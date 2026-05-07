import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, Image, LogBox, Modal, BackHandler } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';

LogBox.ignoreLogs([
    '[expo-av] Expo AV has been deprecated',
    '[expo-av]: Video component from `expo-av` is deprecated',
    'Video component from `expo-av` is deprecated'
]);

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

// ==========================================
// [NEW]: অ্যাপের নিজস্ব VTT কনভার্টার লজিক
// ==========================================
const parseVTTData = (rawData) => {
    const subs = [];
    const lines = rawData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let currentStart = -1, currentEnd = -1, currentText = [];

    const parseTime = (t) => {
        if (!t) return 0;
        const p = t.trim().replace(',', '.').split(':');
        if (p.length === 3) return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
        if (p.length === 2) return parseFloat(p[0]) * 60 + parseFloat(p[1]);
        return parseFloat(p[0]) || 0;
    };

    const pushSub = () => {
        if (currentStart !== -1 && currentEnd !== -1 && currentText.length > 0) {
            const text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
            if (text && !text.includes('WEBVTT') && !text.includes('Kind:')) {
                subs.push({ start: currentStart, end: currentEnd, text });
            }
        }
        currentStart = -1; currentEnd = -1; currentText = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            pushSub();
            const parts = line.split('-->').map(s => s.trim());
            currentStart = parseTime(parts[0]);
            currentEnd = parseTime(parts[1].split(' ')[0]);
        } else if (line === '') {
            pushSub();
        } else {
            if (currentStart !== -1) currentText.push(line);
        }
    }
    pushSub();
    return subs;
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoRef = useRef(null);
  const syncAudioRef = useRef(new Audio.Sound()); 

  const seekPosRef = useRef(0);
  const currentVideoIdRef = useRef(null);
  const isLocalRef = useRef(false);
  
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined'); 
  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [videoKey, setVideoKey] = useState(Date.now().toString());

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('main'); 
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentCC, setCurrentCC] = useState(null); 
  const [ccText, setCcText] = useState("");

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    const backAction = () => {
      if (playerState === 'full') {
        setPlayerState('mini');
        navigation.navigate('Home'); 
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [playerState]);

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({
            staysActiveInBackground: enable,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
        });
    } catch (e) {}
  };

  const fetchStreamUrl = async (vidId, targetQuality) => {
    try {
      const numQ = targetQuality ? targetQuality.toString().replace(/\D/g, '') : '720';
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true`;
      const res = await fetch(apiUrl);
      const json = await res.json();

      if (json.success && json.url) {
          setStreamMode(json.streamType || 'combined');
          setStreamUrl(json.url);

          if (json.streamType === 'separate' && json.audioUrl) {
              await syncAudioRef.current.unloadAsync().catch(()=>{});
              await syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: isPlaying, positionMillis: seekPosRef.current }).catch(() => {});
          }
          setIsPlaying(true);
          setErrorMsg(null);
      }
    } catch(e) { setErrorMsg("Connection Error"); }
  };

  const handlePlaybackStatusUpdate = async (status) => {
    if (status.isLoaded) {
        if (currentCC) {
            const currentSec = status.positionMillis / 1000;
            const sub = currentCC.find(s => currentSec >= s.start && currentSec <= s.end);
            if (sub) setCcText(sub.text);
            else if (!ccText.includes("CC")) setCcText("");
        }

        if (streamMode === 'separate' && !isAudioMode) {
            try {
                const audioStatus = await syncAudioRef.current.getStatusAsync();
                if (audioStatus.isLoaded) {
                    if (status.isPlaying && !audioStatus.isPlaying) await syncAudioRef.current.playAsync();
                    if (!status.isPlaying && audioStatus.isPlaying) await syncAudioRef.current.pauseAsync();
                    if (Math.abs(status.positionMillis - audioStatus.positionMillis) > 600) {
                        await syncAudioRef.current.setPositionAsync(status.positionMillis);
                    }
                }
            } catch(e) {}
        }
    }
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (videoRef.current) await videoRef.current.unloadAsync().catch(()=>{});
      await syncAudioRef.current.unloadAsync().catch(()=>{});

      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);
      setVideoData(data.videoData);
      setPlayerState('full'); 
      setStreamUrl(null);
      setIsAudioMode(false);
      setBackgroundAudio(false);
      setVideoKey(Date.now().toString());
      seekPosRef.current = 0;
      setCurrentCC(null);
      setCcText("");
      
      if (isLocalRef.current) {
          setStreamMode('combined');
          setStreamUrl(data.videoData.localUri);
          return;
      }
      const initialQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, initialQuality);
    });

    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
        if (currentVideoIdRef.current && !isLocalRef.current) {
            if (videoRef.current) {
                const status = await videoRef.current.getStatusAsync();
                seekPosRef.current = status.positionMillis || 0;
                await videoRef.current.pauseAsync();
            }
            setStreamUrl(null);
            setVideoKey(Date.now().toString());
            fetchStreamUrl(currentVideoIdRef.current, newQuality);
        }
    });

    const toggleAudioSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
        setIsAudioMode(mode);
        await setBackgroundAudio(mode);
        
        if (mode && streamMode === 'separate') {
            if (videoRef.current) {
                const status = await videoRef.current.getStatusAsync();
                seekPosRef.current = status.positionMillis || 0;
                await videoRef.current.unloadAsync();
            }
        } else if (!mode && streamMode === 'separate') {
            const aStatus = await syncAudioRef.current.getStatusAsync();
            seekPosRef.current = aStatus.positionMillis || 0;
            setVideoKey(Date.now().toString());
        }
    });

    const minSub = DeviceEventEmitter.addListener('minimizeVideo', () => setPlayerState('mini'));
    const maxSub = DeviceEventEmitter.addListener('maximizeVideo', () => setPlayerState('full'));

    return () => { playSub.remove(); toggleAudioSub.remove(); minSub.remove(); maxSub.remove(); qualitySub.remove(); };
  }, [streamMode]);

  // [UPDATED]: সার্ভার থেকে কাঁচা ফাইল (Raw File) এনে এখানে কনভার্ট করা হচ্ছে
  const fetchCC = async () => {
    try {
        setCcText(`Loading Bengali CC...`);
        setShowSettings(false);
        const res = await fetch(`${MY_API_SERVER}/api/subtitles?id=${currentVideoIdRef.current}`);
        const json = await res.json();
        
        if (json.success && json.rawData) {
            // অ্যাপ নিজেই এখন ফাইলটি প্রসেস করবে
            const parsedSubtitles = parseVTTData(json.rawData);
            if(parsedSubtitles.length > 0) {
                setCurrentCC(parsedSubtitles);
                setCcText("");
            } else {
                setCcText(`Bengali CC is Empty`);
                setTimeout(() => setCcText(""), 3000);
            }
        } else {
            setCcText(`Bengali CC Not Found`);
            setTimeout(() => setCcText(""), 3000);
        }
    } catch(e) { 
        setCcText("Failed to load CC");
        setTimeout(() => setCcText(""), 3000);
    }
  };

  const changeSpeed = async (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) await videoRef.current.setRateAsync(speed, true);
    if (syncAudioRef.current) await syncAudioRef.current.setRateAsync(speed, true);
    setShowSettings(false);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(width - MINI_WIDTH - 20)) x = -(width - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(height - MINI_HEIGHT - 120)) y = -(height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';

  return (
     <Animated.View style={[isFull ? styles.fullContainer : styles.miniContainer, !isFull && { transform: pan.getTranslateTransform() }]} {...(isFull ? {} : panResponder.panHandlers)}>
        <View style={styles.videoWrapper}>
            {streamUrl && (
                <Video 
                    key={videoKey}
                    ref={videoRef} 
                    source={(isAudioMode && streamMode === 'separate') ? null : { uri: streamUrl }} 
                    style={styles.video} 
                    shouldPlay={isPlaying} 
                    positionMillis={seekPosRef.current}
                    isMuted={streamMode === 'separate'}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    useNativeControls={isFull && !isAudioMode}
                    resizeMode="contain" 
                />
            )}
            
            {isAudioMode && !isLocalRef.current && (
                <View style={styles.audioPosterContainer}>
                    <Image source={{ uri: videoData?.thumbnail }} style={styles.audioPosterBg} blurRadius={15} />
                    <View style={styles.audioPosterOverlay}>
                        <Ionicons name="musical-notes" size={isFull ? 50 : 20} color="#FFF" />
                        <Text style={{color: '#FFF', marginTop: 10}}>Background Audio Playing</Text>
                    </View>
                </View>
            )}

            {isFull && (
                <TouchableOpacity style={styles.backBtn} onPress={() => { setPlayerState('mini'); navigation.navigate('Home'); }}>
                    <Ionicons name="chevron-down" size={30} color="#FFF" />
                </TouchableOpacity>
            )}

            {isFull && ccText !== "" && (
                <View style={styles.ccOverlay}><Text style={styles.ccTextStyle}>{ccText}</Text></View>
            )}

            {isFull && (
                <TouchableOpacity style={styles.settingsIcon} onPress={() => { setSettingsTab('main'); setShowSettings(true); }}>
                    <Ionicons name="settings-sharp" size={24} color="#FFF" />
                </TouchableOpacity>
            )}

            {!isFull && (
                <View style={styles.miniOverlay}>
                    <TouchableOpacity style={{flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center'}} onPress={() => {
                        if (videoData) {
                            navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData });
                            setPlayerState('full');
                        }
                    }}>
                        <Ionicons name="expand" size={26} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)} style={{padding: 10}}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={async () => {
                        await setBackgroundAudio(false);
                        if (videoRef.current) await videoRef.current.unloadAsync().catch(()=>{});
                        if (syncAudioRef.current) await syncAudioRef.current.unloadAsync().catch(()=>{});
                        setPlayerState('hidden'); 
                        setStreamUrl(null);
                        setIsPlaying(false);
                    }} style={{padding: 10}}>
                        <Ionicons name="close" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            )}
        </View>

        <Modal visible={showSettings} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettings(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    {settingsTab === 'main' && (
                        <>
                            <TouchableOpacity style={styles.menuItem} onPress={() => {
                                if (currentCC) {
                                    setCurrentCC(null);
                                    setCcText("");
                                    setShowSettings(false);
                                } else {
                                    fetchCC();
                                }
                            }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={20} color={currentCC ? "#4CAF50" : "#FFF"} />
                                <Text style={[styles.menuText, currentCC && {color: '#4CAF50'}]}>
                                    {currentCC ? "Turn Off Bengali CC" : "Turn On Bengali CC"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuItem} onPress={() => setSettingsTab('speed')}>
                                <Ionicons name="speedometer" size={20} color="#FFF" />
                                <Text style={styles.menuText}>Playback Speed ({playbackSpeed}x)</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    {settingsTab === 'speed' && (
                        [0.25, 0.5, 1.0, 1.5, 2.0].map(s => (
                            <TouchableOpacity key={s} style={styles.menuItem} onPress={() => changeSpeed(s)}>
                                <Text style={[styles.menuText, playbackSpeed === s && {color: '#FF0000'}]}>
                                    {s === 1.0 ? 'Normal' : s + 'x'}
                                </Text>
                            </TouchableOpacity>
                        ))
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
     </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 80, right: 15, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', zIndex: 9999, borderRadius: 12, overflow: 'hidden', elevation: 15, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5 },
  videoWrapper: { flex: 1, position: 'relative' },
  video: { width: '100%', height: '100%' },
  backBtn: { position: 'absolute', top: 10, left: 10, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 2 },
  settingsIcon: { position: 'absolute', top: 10, right: 10, zIndex: 100 },
  audioPosterContainer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  audioPosterBg: { width: '100%', height: '100%', resizeMode: 'cover' },
  audioPosterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  ccOverlay: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', zIndex: 50 },
  ccTextStyle: { color: '#FFF', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 10, borderRadius: 5, textAlign: 'center' },
  miniOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  settingsMenu: { width: 250, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  menuText: { color: '#FFF', marginLeft: 15, fontSize: 16 }
});
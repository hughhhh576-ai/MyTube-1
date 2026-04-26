
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, Image, LogBox, Modal } from 'react-native';
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
              syncAudioRef.current.unloadAsync().then(() => {
                  syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: isPlaying, positionMillis: seekPosRef.current }).catch(() => {});
              });
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
    const playSub = DeviceEventEmitter.addListener('playVideo', (data) => {
      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);
      setVideoData(data.videoData);
      
      // নতুন ভিডিও প্লে করার সময় প্লেয়ারকে আবার ফুল স্ক্রিন করা
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

  const fetchCC = async (langCode) => {
    try {
        setCcText(`[${langCode.toUpperCase()}] CC Loading...`);
        setShowSettings(false);

        const res = await fetch(`${MY_API_SERVER}/api/subtitles?id=${currentVideoIdRef.current}&lang=${langCode}`);
        const json = await res.json();
        
        if (json.success && json.subtitles.length > 0) {
            setCurrentCC(json.subtitles);
            setCcText(`[${langCode.toUpperCase()}] CC Ready`);
            setTimeout(() => setCcText(""), 2000);
        } else {
            setCcText(`[${langCode.toUpperCase()}] CC Not Found`);
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

  // [NEW]: ব্যাক বাটনে চাপ দিলে হোম স্ক্রিনে যাওয়া এবং প্লেয়ার ছোট করার লজিক
  const handleBackPress = () => {
    setPlayerState('mini'); 
    navigation.navigate('Home'); 
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
        <TouchableOpacity activeOpacity={0.9} disabled={isFull} style={{flex: 1}} onPress={() => {
            if (!isFull && videoData) {
                navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData });
                setPlayerState('full');
            }
        }}>
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

                {isFull && ccText !== "" && (
                    <View style={styles.ccOverlay}><Text style={styles.ccTextStyle}>{ccText}</Text></View>
                )}

                {/* [NEW]: ব্যাক বাটন (বাম দিকে) */}
                {isFull && (
                    <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
                        <Ionicons name="arrow-back" size={28} color="#FFF" />
                    </TouchableOpacity>
                )}

                {/* সেটিংস বাটন (ডান দিকে) */}
                {isFull && (
                    <TouchableOpacity style={styles.settingsIcon} onPress={() => { setSettingsTab('main'); setShowSettings(true); }}>
                        <Ionicons name="settings-sharp" size={24} color="#FFF" />
                    </TouchableOpacity>
                )}

                {!isFull && (
                    <View style={styles.miniOverlay} pointerEvents="box-none">
                        <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)} style={{marginRight: 15, padding: 10}}>
                            <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async () => {
                            await setBackgroundAudio(false);
                            if (videoRef.current) await videoRef.current.pauseAsync();
                            setPlayerState('hidden'); setStreamUrl(null);
                        }} style={{padding: 10}}>
                            <Ionicons name="close" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </TouchableOpacity>

        <Modal visible={showSettings} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettings(false)}>
                <View style={styles.settingsMenu}>
                    {settingsTab === 'main' && (
                        <>
                            <TouchableOpacity style={styles.menuItem} onPress={() => setSettingsTab('cc')}>
                                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFF" />
                                <Text style={styles.menuText}>CC (Captions)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.menuItem} onPress={() => setSettingsTab('speed')}>
                                <Ionicons name="speedometer" size={20} color="#FFF" />
                                <Text style={styles.menuText}>Playback Speed ({playbackSpeed}x)</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    {settingsTab === 'cc' && (
                        ['bn', 'hi', 'en', 'ur'].map(lang => (
                            <TouchableOpacity key={lang} style={styles.menuItem} onPress={() => fetchCC(lang)}>
                                <Text style={styles.menuText}>{lang === 'bn' ? 'Bengali' : lang === 'hi' ? 'Hindi' : lang === 'en' ? 'English' : 'Urdu'}</Text>
                            </TouchableOpacity>
                        ))
                    )}
                    {settingsTab === 'speed' && (
                        [0.25, 0.5, 1.0, 1.5, 2.0].map(s => (
                            <TouchableOpacity key={s} style={styles.menuItem} onPress={() => changeSpeed(s)}>
                                <Text style={[styles.menuText, playbackSpeed === s && {color: '#FF0000'}]}>{s === 1.0 ? 'Normal' : s + 'x'}</Text>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
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
  backButton: { position: 'absolute', top: 10, left: 10, zIndex: 100, padding: 5 }, // [NEW] ব্যাক বাটনের ডিজাইন
  settingsIcon: { position: 'absolute', top: 10, right: 10, zIndex: 100, padding: 5 },
  audioPosterContainer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  audioPosterBg: { width: '100%', height: '100%', resizeMode: 'cover' },
  audioPosterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  ccOverlay: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center', zIndex: 50 },
  ccTextStyle: { color: '#FFF', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 10, borderRadius: 5, textAlign: 'center' },
  miniOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  settingsMenu: { width: 250, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  menuText: { color: '#FFF', marginLeft: 15, fontSize: 16 }
});
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

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
  const fetchIdRef = useRef(0); 
  const lastTapRef = useRef({ time: 0, side: '' });

  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [audioStreamUrl, setAudioStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined'); 
  const [isPlaying, setIsPlaying] = useState(true);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [videoKey, setVideoKey] = useState(Date.now().toString());

  // পারমিশন অ্যালার্টের জন্য স্টেট
  const [fallbackData, setFallbackData] = useState(null); 

  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
    }, 2000); 
  };

  useEffect(() => {
    const backAction = () => {
      if (playerState === 'full') {
        setPlayerState('mini');
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Home');
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => {
        backHandler.remove();
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [playerState, navigation]);

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({
            staysActiveInBackground: enable,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
        });
    } catch (e) {}
  };

  // ইউজারের অনুমতি পাওয়ার পর ভিডিও প্লে করার ফাংশন
  const applyStreamData = async (json) => {
    setStreamMode(json.streamType || 'combined');
    setStreamUrl(json.url);
    setAudioStreamUrl(json.audioUrl);

    if (json.audioUrl) {
        await syncAudioRef.current.unloadAsync().catch(()=>{});
        const playAudioNow = isPlaying && json.streamType === 'separate';
        await syncAudioRef.current.loadAsync(
            { uri: json.audioUrl }, 
            { shouldPlay: playAudioNow, positionMillis: seekPosRef.current }
        ).catch(() => {});
    }
    setIsPlaying(true);
  };

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const isAuto = targetQuality === 'Auto';
      const reqQ = isAuto ? 720 : (parseInt(targetQuality.toString().replace(/\D/g, '')) || 720);
      
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`;
      const res = await fetch(apiUrl);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          const resQ = parseInt(json.quality) || 720;

          // 🚨 কড়া নিয়ম: রিকোয়েস্ট করা কোয়ালিটি না মিললে পারমিশন চাইবে!
          if (!isAuto && reqQ !== resQ) {
              setFallbackData({
                  reqQ: reqQ,
                  resQ: resQ,
                  data: json,
                  message: `Requested ${reqQ}p is not available.\nPlay highest available quality (${resQ}p) instead?`
              });
              return; // এখানে ভিডিও প্লে না করে ইউজারের অনুমতির জন্য থেমে যাবে
          }

          // যদি কোয়ালিটি মিলে যায়, তবে সরাসরি প্লে হবে
          await applyStreamData(json);
      }
    } catch(e) { console.log("Connection Error"); }
  };

  const handlePlaybackStatusUpdate = async (status) => {
    if (!isAudioMode && status.isLoaded) {
        setCurrentTime(status.positionMillis);
        if (status.durationMillis) setDuration(status.durationMillis);

        if (streamMode === 'separate' && audioStreamUrl) {
            try {
                const audioStatus = await syncAudioRef.current.getStatusAsync();
                if (audioStatus.isLoaded) {
                    if (status.isPlaying && !audioStatus.isPlaying) await syncAudioRef.current.playAsync();
                    if (!status.isPlaying && audioStatus.isPlaying) await syncAudioRef.current.pauseAsync();
                    if (Math.abs(status.positionMillis - audioStatus.positionMillis) > 800) {
                        await syncAudioRef.current.setPositionAsync(status.positionMillis);
                    }
                }
            } catch(e) {}
        }
    }
  };

  useEffect(() => {
      syncAudioRef.current.setOnPlaybackStatusUpdate((status) => {
          if (isAudioMode && status.isLoaded) {
              setCurrentTime(status.positionMillis);
              if (status.durationMillis) setDuration(status.durationMillis);
          }
      });
  }, [isAudioMode]);

  // অডিও মোড টগল লজিক
  const toggleAudioMode = async () => {
      const newMode = !isAudioMode;
      setIsAudioMode(newMode);

      if (newMode) {
          setBackgroundAudio(true);
          if (videoRef.current) {
              const vStatus = await videoRef.current.getStatusAsync();
              if (vStatus.isLoaded) await syncAudioRef.current.setPositionAsync(vStatus.positionMillis);
              await videoRef.current.pauseAsync().catch(()=>{});
          }
          if (isPlaying && audioStreamUrl) await syncAudioRef.current.playAsync().catch(()=>{});
      } else {
          setBackgroundAudio(false);
          const aStatus = await syncAudioRef.current.getStatusAsync();
          if (aStatus.isLoaded) {
              seekPosRef.current = aStatus.positionMillis;
          }
          if (streamMode === 'combined') {
              await syncAudioRef.current.pauseAsync().catch(()=>{});
          }
      }
      triggerControls();
  };

  const handlePlayPause = async () => {
      const nextPlay = !isPlaying;
      setIsPlaying(nextPlay);
      if (isAudioMode && audioStreamUrl) {
          if (nextPlay) await syncAudioRef.current.playAsync();
          else await syncAudioRef.current.pauseAsync();
      }
      triggerControls();
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      fetchIdRef.current = Date.now(); 
      const currentFetchId = fetchIdRef.current;

      if (videoRef.current) await videoRef.current.unloadAsync().catch(()=>{});
      await syncAudioRef.current.unloadAsync().catch(()=>{});

      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);
      setVideoData(data.videoData);
      setPlayerState('full'); 
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setFallbackData(null); 
      setIsAudioMode(false);
      setBackgroundAudio(false);
      setVideoKey(Date.now().toString());
      seekPosRef.current = 0;
      setCurrentTime(0);
      setDuration(0);
      triggerControls(); 

      if (isLocalRef.current) {
          setStreamMode('combined');
          setStreamUrl(data.videoData.localUri);
          return;
      }
      const initialQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, initialQuality, currentFetchId);
    });

    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
        if (currentVideoIdRef.current && !isLocalRef.current) {
            fetchIdRef.current = Date.now();
            if (videoRef.current) {
                const status = await videoRef.current.getStatusAsync();
                seekPosRef.current = status.positionMillis || 0;
                await videoRef.current.pauseAsync();
            }
            setStreamUrl(null);
            setFallbackData(null);
            setVideoKey(Date.now().toString());
            fetchStreamUrl(currentVideoIdRef.current, newQuality, fetchIdRef.current);
        }
    });

    return () => { playSub.remove(); qualitySub.remove(); };
  }, [streamMode]);

  const changeSpeed = async (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) await videoRef.current.setRateAsync(speed, true);
    if (syncAudioRef.current) await syncAudioRef.current.setRateAsync(speed, true);
    setShowSpeedModal(false);
    triggerControls();
  };

  const handleShare = async () => {
    try {
      if (currentVideoIdRef.current) {
        await Share.share({ message: `Check out this amazing video! https://www.youtube.com/watch?v=${currentVideoIdRef.current}` });
      }
    } catch (error) {}
  };

  const closePlayer = async () => {
    fetchIdRef.current = Date.now(); 
    currentVideoIdRef.current = null;
    await setBackgroundAudio(false);
    if (videoRef.current) await videoRef.current.unloadAsync().catch(()=>{});
    if (syncAudioRef.current) await syncAudioRef.current.unloadAsync().catch(()=>{});
    setPlayerState('hidden'); 
    setStreamUrl(null);
    setIsPlaying(false);
    setFallbackData(null);
  };

  const skipVideo = async (amount) => {
    if (duration > 0) {
        let newPosition = currentTime + amount;
        if (newPosition < 0) newPosition = 0;
        if (newPosition > duration) newPosition = duration;
        
        if (isAudioMode) await syncAudioRef.current.setPositionAsync(newPosition);
        else if (videoRef.current) await videoRef.current.setPositionAsync(newPosition);
        
        setCurrentTime(newPosition);
    }
  };

  const handleVideoTap = (side) => {
    const now = Date.now();
    if (lastTapRef.current.side === side && now - lastTapRef.current.time < 300) {
        skipVideo(side === 'right' ? 10000 : -10000);
        lastTapRef.current = { time: 0, side: '' }; 
        triggerControls();
    } else {
        lastTapRef.current = { time: now, side };
        triggerControls(); 
    }
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
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

  const formatTime = (millis) => {
    if (!millis) return "00:00";
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';

  return (
     <Animated.View style={[isFull ? styles.fullContainer : styles.miniContainer, !isFull && { transform: pan.getTranslateTransform() }]} {...(isFull ? {} : panResponder.panHandlers)}>
        <View style={styles.videoWrapper}>
            
            {isAudioMode && isFull && !fallbackData && (
                <View style={styles.audioModeOverlay}>
                    <Ionicons name="headset" size={80} color="#FF0000" />
                    <Text style={styles.audioModeText}>Audio Mode Active</Text>
                </View>
            )}

            {streamUrl && !fallbackData && (
                <Video 
                    key={videoKey}
                    ref={videoRef} 
                    source={isAudioMode ? null : { uri: streamUrl }} 
                    style={styles.video} 
                    shouldPlay={isPlaying} 
                    positionMillis={seekPosRef.current}
                    isMuted={streamMode === 'separate'}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    useNativeControls={false} 
                    resizeMode="contain" 
                />
            )}

            {/* 🚨 ইউজারের অনুমতির অ্যালার্ট স্ক্রিন 🚨 */}
            {fallbackData && isFull && (
                <View style={styles.fallbackOverlay}>
                    <Ionicons name="alert-circle" size={60} color="#FFD700" />
                    <Text style={styles.fallbackTitle}>Quality Not Found</Text>
                    <Text style={styles.fallbackText}>{fallbackData.message}</Text>
                    <View style={styles.fallbackBtnRow}>
                        <TouchableOpacity style={styles.fallbackBtn} onPress={() => {
                            applyStreamData(fallbackData.data); // অনুমতি দিলে প্লে হবে
                            setFallbackData(null);
                        }}>
                            <Text style={styles.fallbackBtnText}>OK, Play {fallbackData.resQ}p</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fallbackBtn, {backgroundColor: '#333'}]} onPress={closePlayer}>
                            <Text style={styles.fallbackBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {isFull && !fallbackData && (
                <View style={styles.doubleTapOverlay}>
                    <TouchableWithoutFeedback onPress={() => handleVideoTap('left')}>
                        <View style={styles.halfScreen} />
                    </TouchableWithoutFeedback>
                    <TouchableWithoutFeedback onPress={() => handleVideoTap('right')}>
                        <View style={styles.halfScreen} />
                    </TouchableWithoutFeedback>
                </View>
            )}

            {isFull && showControls && !fallbackData && (
                <>
                    <TouchableOpacity style={styles.backBtn} onPress={() => { 
                        setPlayerState('mini'); 
                        if (navigation.canGoBack()) navigation.goBack(); 
                        else navigation.navigate('Home'); 
                    }}>
                        <Ionicons name="chevron-down" size={32} color="#FFF" />
                    </TouchableOpacity>

                    <View style={styles.topRightControls}>
                        <TouchableOpacity onPress={toggleAudioMode} style={[styles.iconBtn, isAudioMode && {backgroundColor: 'rgba(255,0,0,0.3)', borderRadius: 20}]}>
                            <Ionicons name={isAudioMode ? "headset" : "headset-outline"} size={24} color={isAudioMode ? "#FF0000" : "#FFF"} />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
                            <Ionicons name="share-social" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowSpeedModal(true)} style={styles.iconBtn}>
                            <Ionicons name="speedometer" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.centerPlayPauseContainer} pointerEvents="box-none">
                        <TouchableOpacity onPress={handlePlayPause}>
                            <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={65} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.customControlsContainer}>
                        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={duration > 0 ? duration : 1}
                            value={currentTime}
                            onSlidingStart={() => { if(controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); }}
                            onSlidingComplete={async (value) => {
                                if (isAudioMode) await syncAudioRef.current.setPositionAsync(value);
                                else if (videoRef.current) await videoRef.current.setPositionAsync(value);
                                setCurrentTime(value);
                                triggerControls();
                            }}
                            minimumTrackTintColor="#FF0000"
                            maximumTrackTintColor="rgba(255, 255, 255, 0.4)"
                            thumbTintColor="#FF0000"
                        />
                        <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                </>
            )}

            {!isFull && (
                <TouchableOpacity 
                    activeOpacity={0.9}
                    style={styles.miniTouchableArea} 
                    onPress={() => {
                        if (videoData) {
                            navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData });
                            setPlayerState('full');
                        }
                    }}>
                    <TouchableOpacity onPress={closePlayer} style={styles.miniCloseBtn}>
                        <Ionicons name="close-circle" size={28} color="#FFF" />
                    </TouchableOpacity>
                </TouchableOpacity>
            )}
        </View>

        <Modal visible={showSpeedModal} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSpeedModal(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>Select Speed</Text>
                    {[0.25, 0.5, 1.0, 1.5, 2.0].map(s => (
                        <TouchableOpacity key={s} style={styles.menuItem} onPress={() => changeSpeed(s)}>
                            <Text style={[styles.menuText, playbackSpeed === s && {color: '#FF0000'}]}>
                                {s === 1.0 ? 'Normal' : s + 'x'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
     </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { 
      position: 'absolute', bottom: 80, right: 15, width: MINI_WIDTH, height: MINI_HEIGHT, 
      backgroundColor: '#000', zIndex: 9999, borderRadius: 12, overflow: 'hidden', 
      elevation: 20, shadowColor: '#00FF00', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10,
      borderWidth: 1.5, borderColor: 'rgba(0, 255, 0, 0.5)'
  },
  videoWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
  video: { width: '100%', height: '100%' },

  audioModeOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  audioModeText: { color: '#FFF', fontSize: 18, marginTop: 10, fontWeight: 'bold' },

  // 🚨 ফলব্যাক অ্যালার্টের স্টাইল
  fallbackOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 200 },
  fallbackTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 10 },
  fallbackText: { color: '#CCC', fontSize: 15, marginVertical: 15, textAlign: 'center', paddingHorizontal: 20 },
  fallbackBtnRow: { flexDirection: 'row', marginTop: 10 },
  fallbackBtn: { backgroundColor: '#FF0000', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginHorizontal: 10 },
  fallbackBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  doubleTapOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', zIndex: 10 },
  halfScreen: { flex: 1, height: '100%', backgroundColor: 'transparent' },
  backBtn: { position: 'absolute', top: 10, left: 10, zIndex: 100, padding: 5 },
  topRightControls: { position: 'absolute', top: 10, right: 10, zIndex: 100, flexDirection: 'row', alignItems: 'center' },
  iconBtn: { marginLeft: 15, padding: 5, backgroundColor: 'transparent' },
  centerPlayPauseContainer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  customControlsContainer: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 50, backgroundColor: 'transparent' },
  timeText: { color: '#FFF', fontSize: 13, marginHorizontal: 5, fontWeight: 'bold', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: {width: -1, height: 1}, textShadowRadius: 5 },
  slider: { flex: 1, height: 40, marginHorizontal: 5 },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  settingsMenu: { width: 220, backgroundColor: '#1A1A1A', borderRadius: 15, padding: 15, elevation: 10 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  menuText: { color: '#FFF', fontSize: 16 }
});
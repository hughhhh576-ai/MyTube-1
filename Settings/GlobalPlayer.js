import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, Image, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback } from 'react-native';
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
  const [audioOnlyUrl, setAudioOnlyUrl] = useState(null); // [NEW] শুধু অডিও লিংক রাখার জন্য
  const [streamMode, setStreamMode] = useState('combined'); 
  const [isPlaying, setIsPlaying] = useState(true);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [videoKey, setVideoKey] = useState(Date.now().toString());

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
    return () => { backHandler.remove(); if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [playerState, navigation]);

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({ staysActiveInBackground: enable, playsInSilentModeIOS: true, shouldDuckAndroid: true });
    } catch (e) {}
  };

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const numQ = targetQuality ? targetQuality.toString().replace(/\D/g, '') : '720';
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true`;
      const res = await fetch(apiUrl);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          setStreamMode(json.streamType || 'combined');
          setStreamUrl(json.url);
          setAudioOnlyUrl(json.audioUrl || null); // [NEW] অডিও লিংক সেভ করা হচ্ছে

          if (json.streamType === 'separate' && json.audioUrl) {
              await syncAudioRef.current.unloadAsync().catch(()=>{});
              await syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: isPlaying && !isAudioMode, positionMillis: seekPosRef.current }).catch(() => {});
          }
          setIsPlaying(true);
      }
    } catch(e) { console.log("Connection Error"); }
  };

  const handlePlaybackStatusUpdate = async (status) => {
    if (status.isLoaded) {
        setCurrentTime(status.positionMillis);
        if (status.durationMillis) setDuration(status.durationMillis);

        if (streamMode === 'separate') {
            if (!isAudioMode) {
                // ভিডিও মোডে থাকলে অডিও রিফ সিংক হবে
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
            } else {
                // [NEW] অডিও মোডে থাকলে ডাবল সাউন্ড বন্ধ করার জন্য সিংক অডিও পজ থাকবে
                try {
                    const audioStatus = await syncAudioRef.current.getStatusAsync();
                    if (audioStatus.isLoaded && audioStatus.isPlaying) {
                        await syncAudioRef.current.pauseAsync();
                    }
                } catch(e) {}
            }
        }
    }
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
      setAudioOnlyUrl(null);
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
            setAudioOnlyUrl(null);
            setVideoKey(Date.now().toString());
            fetchStreamUrl(currentVideoIdRef.current, newQuality, fetchIdRef.current);
        }
    });

    const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (isAudio) => {
        seekPosRef.current = currentTime; // [NEW] মোড চেঞ্জ করার সময় সময়টা সেভ করে রাখা
        setIsAudioMode(isAudio);
        await setBackgroundAudio(isAudio); 
    });

    return () => { playSub.remove(); qualitySub.remove(); audioModeSub.remove(); };
  }, [streamMode, currentTime]);

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
    setAudioOnlyUrl(null);
    setIsPlaying(false);
  };

  const skipVideo = async (amount) => {
    if (videoRef.current && duration > 0) {
        let newPosition = currentTime + amount;
        if (newPosition < 0) newPosition = 0;
        if (newPosition > duration) newPosition = duration;
        await videoRef.current.setPositionAsync(newPosition);
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

  // [NEW] ডাটা সেভ করার লজিক: separate হলে এবং audio mode থাকলে শুধু audioUrl প্লে হবে
  let activeSourceUrl = streamUrl;
  if (isAudioMode && streamMode === 'separate' && audioOnlyUrl) {
      activeSourceUrl = audioOnlyUrl;
  }

  return (
     <Animated.View style={[isFull ? styles.fullContainer : styles.miniContainer, !isFull && { transform: pan.getTranslateTransform() }]} {...(isFull ? {} : panResponder.panHandlers)}>
        <View style={styles.videoWrapper}>
            {activeSourceUrl && (
                <Video 
                    key={videoKey}
                    ref={videoRef} 
                    source={{ uri: activeSourceUrl }} 
                    style={styles.video} 
                    shouldPlay={isPlaying} 
                    positionMillis={seekPosRef.current}
                    isMuted={streamMode === 'separate' && !isAudioMode}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    useNativeControls={false} 
                    resizeMode="contain" 
                />
            )}

            {/* [NEW] অডিও মোড চললে ভিডিও ঢেকে দেওয়ার জন্য ওভারলে (Combined এবং Separate দুটোর জন্যই) */}
            {isAudioMode && (
                <View style={styles.audioModeOverlay}>
                    {videoData?.thumbnail && (
                        <Image source={{ uri: videoData.thumbnail }} style={styles.audioBlurThumb} blurRadius={15} />
                    )}
                    <View style={styles.audioOverlayDarkener} />
                    <View style={styles.audioIconCircle}>
                       <Ionicons name="musical-notes" size={45} color="#00BFA5" />
                    </View>
                    <Text style={styles.audioModeText}>Background Audio Playing</Text>
                </View>
            )}

            {/* Tap Overlay */}
            {isFull && (
                <View style={styles.doubleTapOverlay}>
                    <TouchableWithoutFeedback onPress={() => handleVideoTap('left')}>
                        <View style={styles.halfScreen} />
                    </TouchableWithoutFeedback>
                    <TouchableWithoutFeedback onPress={() => handleVideoTap('right')}>
                        <View style={styles.halfScreen} />
                    </TouchableWithoutFeedback>
                </View>
            )}

            {/* Controls */}
            {isFull && showControls && (
                <>
                    <TouchableOpacity style={styles.backBtn} onPress={() => { 
                        setPlayerState('mini'); 
                        if (navigation.canGoBack()) navigation.goBack(); 
                        else navigation.navigate('Home'); 
                    }}>
                        <Ionicons name="chevron-down" size={32} color="#FFF" />
                    </TouchableOpacity>

                    <View style={styles.topRightControls}>
                        <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
                            <Ionicons name="share-social" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowSpeedModal(true)} style={styles.iconBtn}>
                            <Ionicons name="speedometer" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.centerPlayPauseContainer} pointerEvents="box-none">
                        <TouchableOpacity onPress={() => { setIsPlaying(!isPlaying); triggerControls(); }}>
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
                                if (videoRef.current) {
                                    await videoRef.current.setPositionAsync(value);
                                    setCurrentTime(value);
                                }
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

  // [NEW] Audio Mode Overlay Styles
  audioModeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 5, backgroundColor: '#111' },
  audioBlurThumb: { position: 'absolute', width: '100%', height: '100%', opacity: 0.6 },
  audioOverlayDarkener: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)' },
  audioIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#00BFA5', marginBottom: 10 },
  audioModeText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },

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
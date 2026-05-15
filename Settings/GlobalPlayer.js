import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation'; 
import * as WebBrowser from 'expo-web-browser'; 

LogBox.ignoreLogs(['[expo-av]', 'Video component from `expo-av`']);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); 
  const syncAudioRef = useRef(new Audio.Sound()); 
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  const scale = useRef(new Animated.Value(1)).current;
  const baseScaleRef = useRef(1);
  const initialDistanceRef = useRef(null);
  const isZoomingRef = useRef(false);
  
  const lastTapRef = useRef({ time: 0, side: '' });
  const tapTimeoutRef = useRef(null);
  const isSlidingRef = useRef(false); 

  const [playerState, setPlayerState] = useState('hidden'); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // 🚨 [FIXED]: ব্যাকগ্রাউন্ড অডিও কনফিগারেশন 🚨
  useEffect(() => {
    const setupAudio = async () => {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true, // এটি ব্যাকগ্রাউন্ড প্লে নিশ্চিত করবে
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: false,
        });
    };
    setupAudio();
  }, []);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.playbackRate = currentSpeed; 
    p.play();
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      if (!e.data.state) return;
      const routes = e.data.state.routes;
      const currentRoute = routes[routes.length - 1].name;
      
      if (currentRoute !== 'Player' && currentRoute !== 'PlayerScreen') {
          setPlayerState((prev) => {
              if (prev === 'full' || prev === 'center' || prev === 'fullscreen') {
                  if (isFullscreen) {
                      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                      setIsFullscreen(false);
                  }
                  return 'mini';
              }
              return prev;
          });
      }
    });
    return unsubscribe;
  }, [navigation, isFullscreen]);

  const handleSmartBack = () => {
      if (playerState === 'fullscreen') {
          toggleFullscreen(); 
          return true;
      } else if (playerState === 'center' || playerState === 'full') {
          setPlayerState('mini');
          const state = navigation.getState();
          if (state && state.routes) {
              const routes = state.routes;
              for (let i = routes.length - 1; i >= 0; i--) {
                  if (routes[i].name !== 'Player' && routes[i].name !== 'PlayerScreen') {
                      navigation.navigate(routes[i].name);
                      return true;
                  }
              }
          }
          navigation.navigate('Home'); 
          return true;
      }
      return false;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleSmartBack);
    return () => backHandler.remove();
  }, [playerState, navigation, isFullscreen]);

  const toggleFullscreen = async () => {
    try {
        if (isFullscreen) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            setIsFullscreen(false);
            setPlayerState('full'); 
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            setIsFullscreen(true);
            setPlayerState('fullscreen');
        }
    } catch (error) { console.log(error); }
  };

  const syncAudioWithVideo = async (targetPositionSeconds) => {
      try {
          const status = await syncAudioRef.current.getStatusAsync();
          if (status.isLoaded) {
              await syncAudioRef.current.setPositionAsync(targetPositionSeconds * 1000);
              if (player.playing) await syncAudioRef.current.playAsync();
          }
      } catch (e) {}
  };

  // 🚨 [MODIFIED]: অডিও মোড লজিক - আপনার রিকোয়ারমেন্ট অনুযায়ী 🚨
  useEffect(() => {
      const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
          setIsAudioMode(mode);
          if (mode) {
              // সেপারেট হলে ভিডিও পুরোপুরি কেটে দেওয়া (পজ) হচ্ছে
              if (streamMode === 'separate') {
                  if (player) player.pause();
              }
          } else {
              // অডিও মোড অফ করলে আবার ভিডিও সিঙ্ক হবে
              if (streamMode === 'separate') {
                  if (player) {
                      const audioStatus = await syncAudioRef.current.getStatusAsync();
                      if (audioStatus.isLoaded) {
                          player.currentTime = audioStatus.positionMillis / 1000;
                      }
                      player.play();
                  }
              }
          }
      });
      return () => audioModeSub.remove();
  }, [streamMode, player]);

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (currentVideoIdRef.current === data.videoId) {
          setPlayerState('full');
          if (isFullscreen) toggleFullscreen();
          return;
      }

      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setFallbackData(null);
      setIsAudioMode(data.videoData?.type === 'audio');
      setCurrentTime(0);
      
      scale.setValue(1);
      baseScaleRef.current = 1;
      triggerControls();

      await syncAudioRef.current.unloadAsync().catch(()=>{});
      syncAudioRef.current = new Audio.Sound();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });
    return () => playSub.remove();
  }, [isFullscreen]);

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const qStr = targetQuality.toString().toUpperCase();
      let reqQ = 720;
      if (qStr.includes('8K') || qStr.includes('4320')) reqQ = 4320;
      else if (qStr.includes('4K') || qStr.includes('2160')) reqQ = 2160;
      else if (qStr.includes('2K') || qStr.includes('1440')) reqQ = 1440;
      else reqQ = parseInt(qStr.replace(/\D/g, '')) || 720;
      
      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          const resQ = parseInt(json.quality) || 720;
          if (reqQ > resQ) {
              setFallbackData({ reqQ, resQ, data: json, message: `Requested ${reqQ}p is not available. Play ${resQ}p instead?` });
              return;
          }
          startPlayback(json);
      }
    } catch(e) {}
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined');
    setStreamUrl(json.url);
    if (json.audioUrl) {
        await syncAudioRef.current.unloadAsync().catch(()=>{});
        syncAudioRef.current = new Audio.Sound();
        await syncAudioRef.current.loadAsync(
            { uri: json.audioUrl }, 
            { shouldPlay: true, volume: 1.0, rate: currentSpeed, shouldCorrectPitch: true }
        ).catch(()=>{});

        if (isAudioMode && (json.streamType === 'separate')) {
            setTimeout(() => { if (player) player.pause(); }, 500);
        }
    }
  };

  const handleSkip = async (amount, isSilent = false) => {
      let newTime = currentTime + amount;
      if (newTime < 0) newTime = 0;
      if (newTime > duration) newTime = duration;
      
      if (isAudioMode && streamMode === 'separate') {
          await syncAudioRef.current.setPositionAsync(newTime * 1000);
          setCurrentTime(newTime);
      } else {
          player.currentTime = newTime; 
          setCurrentTime(newTime);
          if (streamMode === 'separate') await syncAudioWithVideo(newTime); 
      }
      if (!isSilent) triggerControls(); 
  };

  const handleTap = (side) => {
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300; 
      if (lastTapRef.current.side === side && (now - lastTapRef.current.time) < DOUBLE_TAP_DELAY) {
          clearTimeout(tapTimeoutRef.current);
          lastTapRef.current = { time: 0, side: '' }; 
          handleSkip(side === 'right' ? 10 : -10, true); 
      } else {
          lastTapRef.current = { time: now, side };
          tapTimeoutRef.current = setTimeout(() => {
              setShowControls(prev => !prev);
              lastTapRef.current = { time: 0, side: '' };
          }, DOUBLE_TAP_DELAY);
      }
  };

  const changeSpeed = async (speed) => {
      setCurrentSpeed(speed);
      if (player) player.playbackRate = speed;
      if (syncAudioRef.current) {
          await syncAudioRef.current.setRateAsync(speed, true).catch(()=>{});
      }
      setShowSpeedMenu(false);
      setShowSettingsMenu(false);
  };

  const videoPanResponder = useRef(PanResponder.create({
      onStartShouldSetPanResponder: () => false, 
      onMoveShouldSetPanResponder: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2) return true; 
          return Math.abs(gestureState.dx) > 15 || Math.abs(gestureState.dy) > 15;
      },
      onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2 && initialDistanceRef.current) {
              isZoomingRef.current = true;
              const dx = touches[0].pageX - touches[1].pageX;
              const dy = touches[0].pageY - touches[1].pageY;
              const currentDistance = Math.sqrt(dx*dx + dy*dy);
              let newScale = baseScaleRef.current * (currentDistance / initialDistanceRef.current);
              scale.setValue(Math.max(0.2, Math.min(6.0, newScale)));
          }
      },
      onPanResponderRelease: (evt, gestureState) => {
          if (isZoomingRef.current) {
              baseScaleRef.current = scale._value;
              setTimeout(() => { isZoomingRef.current = false; }, 100);
              return;
          }
          if (gestureState.dy > 50) {
              if (isFullscreen) toggleFullscreen();
              setPlayerState('mini');
          } else {
              const side = gestureState.x0 < (PORTRAIT_WIDTH / 2) ? 'left' : 'right';
              handleTap(side);
          }
      }
  })).current;

  const miniPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      Animated.spring(pan, { toValue: { x: Math.max(-(PORTRAIT_WIDTH - MINI_WIDTH - 20), Math.min(10, pan.x._value)), y: pan.y._value }, useNativeDriver: false }).start();
    }
  })).current;

  useEffect(() => {
    const interval = setInterval(async () => {
        if (streamMode === 'separate') {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (audioStatus.isLoaded) {
                if (isAudioMode) {
                    if (!isSlidingRef.current) {
                        setCurrentTime(audioStatus.positionMillis / 1000);
                        setDuration(audioStatus.durationMillis / 1000 || 1);
                    }
                } else {
                    if (!isSlidingRef.current && player) {
                        setCurrentTime(player.currentTime);
                        setDuration(player.duration || 1);
                    }
                }
            }
        } else {
            if (!isSlidingRef.current && player) {
                setCurrentTime(player.currentTime);
                setDuration(player.duration || 1);
            }
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player, streamMode, isAudioMode]);

  const closePlayer = async () => {
      setPlayerState('hidden');
      setStreamUrl(null);
      if (player) player.pause();
      await syncAudioRef.current.unloadAsync().catch(()=>{});
  };

  const formatTime = (timeInSeconds) => {
      if (isNaN(timeInSeconds)) return "00:00";
      const m = Math.floor(timeInSeconds / 60);
      const s = Math.floor(timeInSeconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (playerState === 'hidden') return null;
  const isInteractiveFull = playerState === 'full' || playerState === 'center' || playerState === 'fullscreen';

  return (
    <Animated.View 
        style={[
            playerState === 'fullscreen' ? styles.fullscreenContainer : 
            playerState === 'full' ? styles.fullContainer : 
            playerState === 'center' ? styles.centerContainer : 
            styles.miniContainer, 
            playerState === 'mini' && { transform: pan.getTranslateTransform() }
        ]} 
        {...(!isInteractiveFull ? miniPanResponder.panHandlers : {})}
    >
      <View style={styles.videoWrapper}>
        {streamUrl && !fallbackData && (
          <Animated.View style={[styles.animatedVideoWrapper, { transform: [{ scale: scale }] }]}>
              <VideoView 
                ref={videoViewRef} 
                player={player} 
                style={styles.video} 
                contentFit="contain"
              />
              {isAudioMode && (
                  <View style={styles.audioModeOverlay}>
                      <Ionicons name="musical-notes" size={80} color="#00BFA5" />
                      <Text style={styles.audioModeText}>Audio Mode Active</Text>
                      <Text style={styles.audioModeSubText}>
                          {streamMode === 'separate' ? 'Video cut to save data' : 'Playing in background'}
                      </Text>
                  </View>
              )}
          </Animated.View>
        )}

        {isInteractiveFull && !fallbackData && (
            <View style={styles.tapOverlay} {...videoPanResponder.panHandlers}>
                <TouchableWithoutFeedback onPress={() => handleTap('left')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={() => handleTap('right')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
            </View>
        )}

        {isInteractiveFull && showControls && !fallbackData && (
          <View style={styles.controls} pointerEvents="box-none">
             <View style={styles.topBar}>
                 <TouchableOpacity style={styles.iconBtn} onPress={handleSmartBack}><Ionicons name="chevron-down" size={35} color="#FFF" /></TouchableOpacity>
                 <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSettingsMenu(true)}><Ionicons name="settings-outline" size={28} color="#FFF" /></TouchableOpacity>
             </View>
             
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={async () => {
                    if (isAudioMode && streamMode === 'separate') {
                        const status = await syncAudioRef.current.getStatusAsync();
                        if (status.isPlaying) await syncAudioRef.current.pauseAsync().catch(()=>{});
                        else await syncAudioRef.current.playAsync().catch(()=>{});
                    } else {
                        if (player.playing) {
                            player.pause();
                            if (streamMode === 'separate') await syncAudioRef.current.pauseAsync().catch(()=>{});
                        } else {
                            player.play();
                            if (streamMode === 'separate') await syncAudioRef.current.playAsync().catch(()=>{});
                        }
                    }
                }}>
                   <Ionicons name={player.playing || (isAudioMode && streamMode === 'separate') ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Slider 
                  style={{flex: 1, height: 40, marginHorizontal: 10}}
                  minimumValue={0}
                  maximumValue={duration}
                  value={currentTime}
                  onSlidingComplete={async (v) => {
                      if (isAudioMode && streamMode === 'separate') await syncAudioRef.current.setPositionAsync(v * 1000);
                      else { player.currentTime = v; if (streamMode === 'separate') await syncAudioWithVideo(v); }
                  }}
                  minimumTrackTintColor="#FF0000"
                  thumbTintColor="#FF0000"
                />
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
                <TouchableOpacity onPress={toggleFullscreen}><Ionicons name={isFullscreen ? "contract" : "expand"} size={24} color="#FFF" /></TouchableOpacity>
             </View>
          </View>
        )}
        
        {/* সেটিংস এবং স্পিড মেনু (পূর্বের মতো রাখা হয়েছে) */}
        <Modal visible={showSettingsMenu} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettingsMenu(false)}>
                <View style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>Settings</Text>
                    <TouchableOpacity style={styles.menuItem} onPress={() => setShowSpeedMenu(true)}><Text style={styles.menuText}>Speed ({currentSpeed}x)</Text></TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>

        {!isInteractiveFull && (
            <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchableArea} onPress={() => { navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData }); setPlayerState('full'); }}>
                <TouchableOpacity onPress={closePlayer} style={styles.miniCloseBtn}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
            </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: '#000' }, 
  fullContainer: { position: 'absolute', top: 55, left: 0, width: PORTRAIT_WIDTH, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, elevation: 10, borderWidth: 1, borderColor: '#00BFA5' },
  videoWrapper: { flex: 1, justifyContent: 'center' },
  animatedVideoWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' }, 
  video: { flex: 1, width: '100%', height: '100%' },
  audioModeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', zIndex: 8 },
  audioModeText: { color: '#00BFA5', fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  audioModeSubText: { color: '#888', fontSize: 12, marginTop: 8 },
  tapOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 }, 
  tapHalf: { flex: 1 },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  topBar: { position: 'absolute', top: 10, left: 10, right: 15, flexDirection: 'row', justifyContent: 'space-between' },
  iconBtn: { padding: 5 },
  centerRow: { flexDirection: 'row', alignItems: 'center' },
  bottomBar: { position: 'absolute', bottom: 5, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  settingsMenu: { width: 250, backgroundColor: '#1A1A1A', borderRadius: 15, padding: 15 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  menuItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  menuText: { color: '#FFF', fontSize: 16 },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
});
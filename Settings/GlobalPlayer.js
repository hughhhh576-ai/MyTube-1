import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, BackHandler, Pressable, AppState, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation'; 

LogBox.ignoreLogs([
  'Video component', 
  'expo-audio', 
  'expo-video',
  'SafeAreaView has been deprecated',
  'InteractionManager has been deprecated'
]);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

// 🚨 Protected functions for Expo SDK
const safeSeek = (p, targetSec) => {
    if (!p) return;
    try {
        if (typeof p.seekTo === 'function') {
            const res = p.seekTo(targetSec);
            if (res && res.catch) res.catch(() => {});
        } else if (typeof p.seekBy === 'function') {
            const res = p.seekBy(targetSec - p.currentTime);
            if (res && res.catch) res.catch(() => {});
        } else {
            p.currentTime = targetSec; 
        }
    } catch (e) {}
};

const safeSetRate = (p, rate) => {
    if (!p) return;
    try {
        if (typeof p.setPlaybackRate === 'function') {
            const res = p.setPlaybackRate(rate);
            if (res && res.catch) res.catch(() => {});
        } else if (typeof p.setRate === 'function') {
            const res = p.setRate(rate);
            if (res && res.catch) res.catch(() => {});
        } else {
            p.playbackRate = rate;
        }
    } catch (e) {}
};

const safeSetVolume = (p, vol) => {
    if (!p) return;
    try {
        if (typeof p.setVolume === 'function') {
            const res = p.setVolume(vol);
            if (res && res.catch) res.catch(() => {});
        } else {
            p.volume = vol;
        }
    } catch(e) {}
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); 
  const syncAudioRef = useRef(null); 
  
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  const isSlidingRef = useRef(false); 

  const [playerState, setPlayerState] = useState('hidden'); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  
  const [videoSource, setVideoSource] = useState(null); 
  const resumeTimeRef = useRef(0); 

  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isPlayingUI, setIsPlayingUI] = useState(false); 

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const [currentSpeed] = useState(1.0);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const isAudioModeRef = useRef(false);
  const streamModeRef = useRef('combined');
  const cachedAudioUrlRef = useRef(null); 
  const pendingSeekRef = useRef(null); 
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const setupAudio = async () => {
      try {
        await setAudioModeAsync({
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {}
    };
    setupAudio();
  }, []);

  const safeReleaseAudio = () => {
      if (syncAudioRef.current) {
          try { syncAudioRef.current.release(); } catch(e) {}
          syncAudioRef.current = null;
      }
  };

  const player = useVideoPlayer(videoSource, (p) => {
    if (!videoSource) return; 
    try { p.loop = false; } catch(e) {}
    safeSetRate(p, currentSpeed);
    if (streamModeRef.current === 'separate') {
        try { p.muted = true; } catch(e){}
    }
    try { p.play(); } catch(e) {}
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
  };

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', async (nextAppState) => {
        if (nextAppState.match(/inactive|background/)) {
            if (!isAudioModeRef.current) {
                try { if (player && player.playing) player.pause(); } catch(e){}
                try { if (syncAudioRef.current && syncAudioRef.current.playing) syncAudioRef.current.pause(); } catch(e){}
            }
        }
    });
    return () => appStateSub.remove();
  }, [player]);

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
    } catch (error) {}
  };

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
      setVideoSource(null); 
      resumeTimeRef.current = 0; 
      
      setFallbackData(null);
      setIsAudioMode(false);
      isAudioModeRef.current = false;
      cachedAudioUrlRef.current = null;
      pendingSeekRef.current = null;
      
      setCurrentTime(0);
      triggerControls();

      safeReleaseAudio();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
      setIsAudioMode(mode);
      isAudioModeRef.current = mode;

      if (mode) {
          try {
              resumeTimeRef.current = player ? player.currentTime : currentTime;
              if (player && typeof player.pause === 'function') player.pause();
          } catch(e) {
              resumeTimeRef.current = currentTime;
          }
          setVideoSource(null); 
          setIsPlayingUI(true); 

          if (streamModeRef.current === 'separate' && syncAudioRef.current) {
              if (!syncAudioRef.current.playing) syncAudioRef.current.play();
          } else {
              let audioUrlToPlay = cachedAudioUrlRef.current;
              if (!audioUrlToPlay) {
                  try {
                      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${currentVideoIdRef.current}`)}&action=play&type=audio`);
                      const json = await res.json();
                      if (json.success && (json.audioUrl || json.url)) {
                          audioUrlToPlay = json.audioUrl || json.url;
                          cachedAudioUrlRef.current = audioUrlToPlay; 
                      }
                  } catch (e) {}
              }
              if (audioUrlToPlay) {
                  safeReleaseAudio();
                  syncAudioRef.current = createAudioPlayer(audioUrlToPlay);
                  pendingSeekRef.current = resumeTimeRef.current; 
                  safeSetRate(syncAudioRef.current, currentSpeed);
                  syncAudioRef.current.play();
              }
          }
      } else {
          let resumeVideoTime = resumeTimeRef.current;

          if (syncAudioRef.current) {
              try { resumeVideoTime = syncAudioRef.current.currentTime; } catch(e){}
              if (streamModeRef.current !== 'separate') {
                  safeReleaseAudio();
              } else {
                  try { syncAudioRef.current.pause(); } catch(e){}
              }
          }

          resumeTimeRef.current = resumeVideoTime;
          setVideoSource(streamUrl); 
      }
    });

    return () => {
        playSub.remove();
        audioModeSub.remove();
    };
  }, [isFullscreen, streamUrl]);

  useEffect(() => {
      let timeoutId;
      if (!isAudioMode && videoSource && player) {
          timeoutId = setTimeout(() => {
              try {
                  if (resumeTimeRef.current > 0) {
                      safeSeek(player, resumeTimeRef.current);
                      if (streamModeRef.current === 'separate' && syncAudioRef.current) {
                          safeSeek(syncAudioRef.current, resumeTimeRef.current);
                      }
                  }
                  if (typeof player.play === 'function') player.play();
                  if (streamModeRef.current === 'separate' && syncAudioRef.current && !syncAudioRef.current.playing) {
                      syncAudioRef.current.play();
                  }
              } catch (e) {}
          }, 800); 
      }
      return () => clearTimeout(timeoutId);
  }, [videoSource, isAudioMode, player]);

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
    streamModeRef.current = json.streamType || 'combined';
    cachedAudioUrlRef.current = json.audioUrl || null; 
    
    setStreamUrl(json.url);
    setVideoSource(json.url); 
    
    if (json.audioUrl && streamModeRef.current === 'separate') {
        safeReleaseAudio();
        syncAudioRef.current = createAudioPlayer(json.audioUrl);
        safeSetVolume(syncAudioRef.current, 1.0); 
        safeSetRate(syncAudioRef.current, currentSpeed); 
        syncAudioRef.current.play();
    }
  };

  const handleVideoTap = () => {
      setShowControls(prev => {
          const next = !prev;
          if (next) triggerControls();
          return next;
      });
  };

  useEffect(() => {
    const interval = setInterval(() => {
        if (isSyncingRef.current) return; 

        if (isAudioMode) {
            isSyncingRef.current = true;
            try {
                if (syncAudioRef.current) {
                    setIsPlayingUI(syncAudioRef.current.playing);
                    
                    if (pendingSeekRef.current !== null) {
                        safeSeek(syncAudioRef.current, pendingSeekRef.current);
                        setCurrentTime(pendingSeekRef.current);
                        pendingSeekRef.current = null;
                    } else if (!isSlidingRef.current) {
                        setCurrentTime(syncAudioRef.current.currentTime);
                        if (syncAudioRef.current.duration > 0) setDuration(syncAudioRef.current.duration);
                    }
                }
            } catch(e) {}
            isSyncingRef.current = false;
        } else {
            try {
                setIsPlayingUI(player?.playing || false);
                
                if (player) {
                    if (!isSlidingRef.current && (player.currentTime > 0 || player.playing)) {
                        setCurrentTime(player.currentTime);
                        if (player.duration > 0) setDuration(player.duration);
                    }
                }

                if (streamMode === 'separate' && videoSource && syncAudioRef.current) {
                    if (player && player.playing) {
                        const diff = Math.abs(player.currentTime - syncAudioRef.current.currentTime);
                        if (diff > 0.8) { 
                            safeSeek(syncAudioRef.current, player.currentTime);
                        }
                        if (!syncAudioRef.current.playing) syncAudioRef.current.play();
                    } else {
                        if (syncAudioRef.current.playing) syncAudioRef.current.pause();
                    }
                }
            } catch(e) {}
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player, streamMode, isAudioMode, videoSource]);

  const togglePlayPause = () => {
      if (isAudioMode) {
          if (syncAudioRef.current) {
              if (syncAudioRef.current.playing) syncAudioRef.current.pause();
              else syncAudioRef.current.play();
          }
      } else if (player) {
          try {
              if (player.playing) {
                  if (typeof player.pause === 'function') player.pause();
                  if (streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.pause();
              } else {
                  if (typeof player.play === 'function') player.play();
                  if (streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.play();
              }
          } catch(e) {}
      }
      triggerControls();
  };

  const miniPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(PORTRAIT_WIDTH - MINI_WIDTH - 20)) x = -(PORTRAIT_WIDTH - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(Dimensions.get('window').height - MINI_HEIGHT - 120)) y = -(Dimensions.get('window').height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  const closePlayer = async () => {
      setPlayerState('hidden');
      if (isFullscreen) await toggleFullscreen();
      setStreamUrl(null);
      setVideoSource(null); 
      try { if (player && typeof player.pause === 'function') player.pause(); } catch(e) {}
      safeReleaseAudio();
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
          <View style={{ flex: 1, width: '100%', height: '100%' }}>
            
            <Animated.View style={styles.animatedVideoWrapper}>
                {videoSource ? (
                    <VideoView 
                        ref={videoViewRef} 
                        player={player} 
                        style={styles.video} 
                        contentFit="contain"
                        nativeControls={false} 
                        surfaceType="textureView" 
                    />
                ) : null}
            </Animated.View>

            {isAudioMode && (
                <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', zIndex: 10, elevation: 10 }]}>
                    <Image 
                        source={{ uri: `https://img.youtube.com/vi/${currentVideoIdRef.current}/hqdefault.jpg` }}
                        style={[StyleSheet.absoluteFillObject, { opacity: 0.2 }]}
                        resizeMode="cover"
                    />
                    <Ionicons name="headset" size={70} color="#00BFA5" />
                    <Text style={{ color: '#00BFA5', marginTop: 15, fontSize: 16, fontWeight: 'bold' }}>ব্যাকগ্রাউন্ড অডিও মোড চলছে</Text>
                </View>
            )}
          </View>
        )}

        {/* 🚨 এক্সপো ৫৬ ফিক্স: Pressable, elevation এবং transparent background ব্যবহার করা হয়েছে 🚨 */}
        {isInteractiveFull && !fallbackData && (
            <Pressable 
                style={[StyleSheet.absoluteFillObject, { zIndex: 50, elevation: 50, backgroundColor: 'transparent' }]} 
                onPress={handleVideoTap} 
            />
        )}

        {/* 🚨 শুধুমাত্র প্লে এবং পজ করার বাটন, সাথে elevation ফিক্স 🚨 */}
        {isInteractiveFull && showControls && !fallbackData && (
          <View style={[styles.controls, { zIndex: 100, elevation: 100 }]} pointerEvents="box-none">
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={togglePlayPause} style={{ padding: 20 }}>
                   <Ionicons name={isPlayingUI ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>
          </View>
        )}

        {fallbackData && (
          <View style={[styles.fallbackOverlay, { zIndex: 200, elevation: 200 }]}>
            <Ionicons name="alert-circle" size={50} color="#FFD700" />
            <Text style={styles.fallbackText}>{fallbackData.message}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => { startPlayback(fallbackData.data); setFallbackData(null); }}>
              <Text style={styles.btnText}>OK, Play Highest Quality</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {!isInteractiveFull && (
            <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchableArea} onPress={() => {
                if (videoData) {
                    navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData });
                    setPlayerState('full');
                }
            }}>
                <View style={styles.miniControlsRow}>
                    <TouchableOpacity style={styles.miniCtrlBtn} onPress={togglePlayPause}>
                        <Ionicons name={isPlayingUI ? "pause" : "play"} size={22} color="#FFF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={closePlayer} style={styles.miniCtrlBtn}>
                        <Ionicons name="close" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: '#000', overflow: 'hidden' }, 
  fullContainer: { position: 'absolute', top: 55, left: 0, width: PORTRAIT_WIDTH, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000', overflow: 'hidden' },
  centerContainer: { position: 'absolute', top: 0, left: 0, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, zIndex: 9999, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, overflow: 'hidden', elevation: 10, borderWidth: 1, borderColor: '#00FF00' },
  
  videoWrapper: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  animatedVideoWrapper: { flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }, 
  video: { flex: 1, width: '100%', height: '100%' },
  
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  
  centerRow: { flexDirection: 'row', alignItems: 'center' },
  
  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  fallbackText: { color: '#FFF', textAlign: 'center', marginVertical: 20, fontSize: 16 },
  btn: { backgroundColor: '#FF0000', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniControlsRow: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' },
  miniCtrlBtn: { padding: 5, marginHorizontal: 3 },
});
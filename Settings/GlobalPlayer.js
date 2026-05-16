import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { Audio } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation'; 
import * as WebBrowser from 'expo-web-browser'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🚨 নতুন স্টোরেজ প্যাকেজ 🚨

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

  useEffect(() => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
      baseScaleRef.current = 1;
  }, [playerState]);

  const toggleFullscreen = async () => {
    try {
        if (isFullscreen) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            setIsFullscreen(false);
            setPlayerState('full'); 
            scale.setValue(1); 
            baseScaleRef.current = 1;
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            setIsFullscreen(true);
            setPlayerState('fullscreen');
            scale.setValue(1); 
            baseScaleRef.current = 1;
        }
    } catch (error) {}
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
      setIsAudioMode(false);
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
            { shouldPlay: true, volume: 1.0, rate: currentSpeed, shouldCorrectPitch: true, pitchCorrectionQuality: Audio.PitchCorrectionQuality.Low }
        ).catch(()=>{});
    }
  };

  const handleSkip = async (amount, isSilent = false) => {
      let newTime = player.currentTime + amount;
      if (newTime < 0) newTime = 0;
      if (newTime > player.duration) newTime = player.duration;
      
      player.currentTime = newTime; 
      setCurrentTime(newTime);
      if (streamMode === 'separate') await syncAudioWithVideo(newTime); 
      
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
              setShowControls(prev => {
                  const next = !prev;
                  if (next) triggerControls();
                  return next;
              });
              lastTapRef.current = { time: 0, side: '' };
          }, DOUBLE_TAP_DELAY);
      }
  };

  const changeSpeed = async (speed) => {
      setCurrentSpeed(speed);
      if (player) player.playbackRate = speed;
      if (syncAudioRef.current) {
          await syncAudioRef.current.setRateAsync(speed, true, Audio.PitchCorrectionQuality.Low).catch(()=>{});
      }
      setShowSpeedMenu(false);
      setShowSettingsMenu(false);
  };

  // 🚨 প্লেলিস্টে সেভ করার লজিক 🚨
  const saveToPlaylist = async () => {
      setShowSettingsMenu(false);
      try {
          const vidId = currentVideoIdRef.current;
          if (!vidId) return;

          const newVideo = {
              id: vidId,
              title: videoData?.title || fallbackData?.data?.title || "Unknown Video",
              channel: videoData?.channel || "Unknown Channel",
              views: videoData?.views || "",
              thumbnail: videoData?.thumbnail || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`
          };

          const existingData = await AsyncStorage.getItem('my_saved_playlist');
          let playlist = existingData ? JSON.parse(existingData) : [];

          if (playlist.some(v => v.id === vidId)) {
              alert("এই ভিডিওটি আগে থেকেই প্লেলিস্টে আছে!");
          } else {
              playlist.unshift(newVideo); // নতুন ভিডিও সবার ওপরে থাকবে
              await AsyncStorage.setItem('my_saved_playlist', JSON.stringify(playlist));
              DeviceEventEmitter.emit('playlistUpdated'); // প্লেলিস্ট পেজকে আপডেট করার সিগন্যাল
              alert("প্লেলিস্টে সফলভাবে সেভ হয়েছে!");
          }
      } catch (error) {
          alert("সেভ করতে সমস্যা হয়েছে!");
      }
  };

  const videoPanResponder = useRef(PanResponder.create({
      onStartShouldSetPanResponder: () => false, 
      onMoveShouldSetPanResponder: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2) return true; 
          if (Math.abs(gestureState.dx) > 15 || Math.abs(gestureState.dy) > 15) return true; 
          return false;
      },
      onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2) {
              isZoomingRef.current = true;
              const dx = touches[0].pageX - touches[1].pageX;
              const dy = touches[0].pageY - touches[1].pageY;
              initialDistanceRef.current = Math.sqrt(dx*dx + dy*dy);
          }
      },
      onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2 && initialDistanceRef.current) {
              isZoomingRef.current = true;
              const dx = touches[0].pageX - touches[1].pageX;
              const dy = touches[0].pageY - touches[1].pageY;
              const currentDistance = Math.sqrt(dx*dx + dy*dy);

              let newScale = baseScaleRef.current * (currentDistance / initialDistanceRef.current);
              if (newScale < 0.2) newScale = 0.2; 
              if (newScale > 6.0) newScale = 6.0; 
              scale.setValue(newScale);
          }
      },
      onPanResponderRelease: (evt, gestureState) => {
          if (isZoomingRef.current) {
              baseScaleRef.current = scale._value;
              initialDistanceRef.current = null;
              setTimeout(() => { isZoomingRef.current = false; }, 100);
              return;
          }

          if (gestureState.dy > 50 && Math.abs(gestureState.vy) > 0.5) {
              setPlayerState(prev => {
                  if (prev === 'fullscreen') { toggleFullscreen(); return 'mini'; }
                  if (prev === 'full') return 'center'; 
                  if (prev === 'center') {
                      handleSmartBack(); 
                      return 'mini'; 
                  }
                  return prev;
              });
          } else if (gestureState.dy < -50 && Math.abs(gestureState.vy) > 0.5) {
              setPlayerState(prev => {
                  if (prev === 'center') return 'full'; 
                  return prev;
              });
          } 
          else if (Math.abs(gestureState.dx) < 15 && Math.abs(gestureState.dy) < 15) {
              const side = gestureState.x0 < (PORTRAIT_WIDTH / 2) ? 'left' : 'right';
              handleTap(side);
          }
      },
      onPanResponderTerminate: () => {
          if (isZoomingRef.current) {
              baseScaleRef.current = scale._value;
              initialDistanceRef.current = null;
              isZoomingRef.current = false;
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
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(PORTRAIT_WIDTH - MINI_WIDTH - 20)) x = -(PORTRAIT_WIDTH - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(Dimensions.get('window').height - MINI_HEIGHT - 120)) y = -(Dimensions.get('window').height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  useEffect(() => {
    const interval = setInterval(async () => {
        if (!isSlidingRef.current && player) {
            setCurrentTime(player.currentTime);
            setDuration(player.duration > 0 ? player.duration : 1);
        }

        if (streamMode === 'separate') {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (audioStatus.isLoaded) {
                if (player.playing) {
                    const diff = Math.abs((player.currentTime * 1000) - audioStatus.positionMillis);
                    if (diff > 500) await syncAudioRef.current.setPositionAsync(player.currentTime * 1000);
                    if (!audioStatus.isPlaying) await syncAudioRef.current.playAsync();
                } else {
                    if (audioStatus.isPlaying) await syncAudioRef.current.pauseAsync().catch(()=>{});
                }
            }
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player, streamMode]);

  const closePlayer = async () => {
      setPlayerState('hidden');
      if (isFullscreen) await toggleFullscreen();
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
        
        {streamUrl && !fallbackData && !isAudioMode && (
          <Animated.View style={[styles.animatedVideoWrapper, { transform: [{ scale: scale }] }]}>
              <VideoView 
                ref={videoViewRef} 
                player={player} 
                style={styles.video} 
                contentFit="contain"
                nativeControls={false} 
              />
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
                 <TouchableOpacity style={styles.iconBtn} onPress={handleSmartBack}>
                    <Ionicons name="chevron-down" size={35} color="#FFF" />
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSettingsMenu(true)}>
                    <Ionicons name="settings-outline" size={28} color="#FFF" />
                 </TouchableOpacity>
             </View>
             
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={async () => {
                    if (player.playing) {
                        player.pause();
                        if (streamMode === 'separate') await syncAudioRef.current.pauseAsync().catch(()=>{});
                    } else {
                        player.play();
                        if (streamMode === 'separate') await syncAudioRef.current.playAsync().catch(()=>{});
                    }
                    triggerControls();
                }}>
                   <Ionicons name={player.playing ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                
                <Slider 
                  style={{flex: 1, height: 40, marginHorizontal: 10}}
                  minimumValue={0}
                  maximumValue={duration}
                  value={currentTime}
                  onSlidingStart={() => {
                      isSlidingRef.current = true; 
                      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                  }}
                  onValueChange={(v) => setCurrentTime(v)} 
                  onSlidingComplete={async (v) => {
                      player.currentTime = v; 
                      if (streamMode === 'separate') await syncAudioWithVideo(v);
                      isSlidingRef.current = false; 
                      triggerControls();
                  }}
                  minimumTrackTintColor="#FF0000"
                  thumbTintColor="#FF0000"
                />
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
                
                <TouchableOpacity style={{marginLeft: 15}} onPress={toggleFullscreen}>
                    <Ionicons name={isFullscreen ? "contract" : "expand"} size={24} color="#FFF" />
                </TouchableOpacity>
             </View>
          </View>
        )}

        {/* 🚨 Settings Menu Modal 🚨 */}
        <Modal visible={showSettingsMenu} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettingsMenu(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>Player Settings</Text>
                    
                    <TouchableOpacity style={styles.menuItem} onPress={async () => {
                        setShowSettingsMenu(false);
                        const ytUrl = `https://www.youtube.com/watch?v=${currentVideoIdRef.current}?app=desktop`;
                        Linking.openURL(`googlechrome://navigate?url=${ytUrl}`).catch(() => {
                            WebBrowser.openBrowserAsync(ytUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
                        });
                    }}>
                        <Ionicons name="globe-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>Open in Browser</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettingsMenu(false); setShowSpeedMenu(true); }}>
                        <Ionicons name="speedometer-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>Playback Speed ({currentSpeed}x)</Text>
                    </TouchableOpacity>

                    {/* 🚨 প্লেলিস্টে সেভ করার বাটন 🚨 */}
                    <TouchableOpacity style={styles.menuItem} onPress={saveToPlaylist}>
                        <Ionicons name="add-circle-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>Save to Playlist</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        setShowSettingsMenu(false);
                        Share.share({ message: `Watch this awesome video: https://www.youtube.com/watch?v=${currentVideoIdRef.current}` });
                    }}>
                        <Ionicons name="share-social-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>Share</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>

        {/* 🚨 Speed Selection Modal 🚨 */}
        <Modal visible={showSpeedMenu} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSpeedMenu(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>Select Speed</Text>
                    {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0].map(s => (
                        <TouchableOpacity key={s} style={styles.menuItem} onPress={() => changeSpeed(s)}>
                            <Text style={[styles.menuText, currentSpeed === s && {color: '#FF0000', fontWeight: 'bold'}]}>
                                {s === 1.0 ? 'Normal (1.0x)' : `${s}x`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>

        {fallbackData && (
          <View style={styles.fallbackOverlay}>
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
                <TouchableOpacity onPress={closePlayer} style={styles.miniCloseBtn}>
                    <Ionicons name="close-circle" size={28} color="#FFF" />
                </TouchableOpacity>
            </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: '#000', overflow: 'hidden' }, 
  fullContainer: { position: 'absolute', top: 55, left: 0, right: 0, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000', overflow: 'hidden' },
  centerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, overflow: 'hidden', elevation: 10, borderWidth: 1, borderColor: '#00FF00' },
  
  videoWrapper: { flex: 1, justifyContent: 'center', width: '100%', height: '100%' },
  animatedVideoWrapper: { flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }, 
  video: { flex: 1, width: '100%', height: '100%' },
  
  tapOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 }, 
  tapHalf: { flex: 1 },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  
  topBar: { position: 'absolute', top: 10, left: 10, right: 15, flexDirection: 'row', justifyContent: 'space-between', zIndex: 20 },
  iconBtn: { padding: 5 },
  
  centerRow: { flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  bottomBar: { position: 'absolute', bottom: 5, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 20 },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  settingsMenu: { width: 250, backgroundColor: '#1A1A1A', borderRadius: 15, padding: 15, elevation: 10 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  menuIcon: { marginRight: 10 },
  menuText: { color: '#FFF', fontSize: 16 },

  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 30 },
  fallbackText: { color: '#FFF', textAlign: 'center', marginVertical: 20, fontSize: 16 },
  btn: { backgroundColor: '#FF0000', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
});
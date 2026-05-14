import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { Audio } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

LogBox.ignoreLogs(['[expo-av]', 'Video component from `expo-av`']);

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); 
  const syncAudioRef = useRef(new Audio.Sound()); 
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  // ডাবল ট্যাপ এবং স্লাইডারের জন্য Ref
  const lastTapRef = useRef({ time: 0, side: '' });
  const tapTimeoutRef = useRef(null);
  const isSlidingRef = useRef(false); // দাগটি ধরে টানার সময় ট্র্যাক করার জন্য

  // Player States
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  // Time & Duration States (স্লাইডার সচল রাখার জন্য)
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.play();
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  // অন্য স্ক্রিনে গেলে অটো মিনিমাইজ
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      if (!e.data.state) return;
      const routes = e.data.state.routes;
      const currentRoute = routes[routes.length - 1].name;
      
      if (currentRoute !== 'Player' && currentRoute !== 'PlayerScreen') {
          setPlayerState((prev) => {
              if (prev === 'full' || prev === 'center') return 'mini';
              return prev;
          });
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const backAction = () => {
      if (playerState === 'center') {
        setPlayerState('full');
        return true;
      } else if (playerState === 'full') {
        setPlayerState('mini');
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Home');
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [playerState, navigation]);

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
      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setFallbackData(null);
      setIsAudioMode(false);
      setCurrentTime(0);
      triggerControls();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });
    return () => playSub.remove();
  }, []);

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
        await syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: player.playing }).catch(()=>{});
    }
  };

  // ডাবল ট্যাপ করে স্কিপ করার লজিক
  const handleSkip = async (amount) => {
      let newTime = player.currentTime + amount;
      if (newTime < 0) newTime = 0;
      if (newTime > player.duration) newTime = player.duration;
      
      player.currentTime = newTime; 
      setCurrentTime(newTime);
      if (streamMode === 'separate') await syncAudioWithVideo(newTime); 
      triggerControls();
  };

  const handleTap = (side) => {
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300; 
      
      if (lastTapRef.current.side === side && (now - lastTapRef.current.time) < DOUBLE_TAP_DELAY) {
          clearTimeout(tapTimeoutRef.current);
          lastTapRef.current = { time: 0, side: '' }; 
          handleSkip(side === 'right' ? 10 : -10); // ১০ সেকেন্ড স্কিপ
      } else {
          lastTapRef.current = { time: now, side };
          tapTimeoutRef.current = setTimeout(() => {
              setShowControls(prev => !prev);
              lastTapRef.current = { time: 0, side: '' };
              if (!showControls) triggerControls();
          }, DOUBLE_TAP_DELAY);
      }
  };

  // থিয়েটার মোড সোয়াইপ লজিক
  const verticalPanResponder = useRef(PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
          return Math.abs(gestureState.dy) > 30 && Math.abs(gestureState.vy) > 0.5;
      },
      onPanResponderRelease: (evt, gestureState) => {
          if (gestureState.dy > 50) {
              setPlayerState(prev => {
                  if (prev === 'full') return 'center'; 
                  if (prev === 'center') {
                      if (navigation.canGoBack()) navigation.goBack();
                      return 'mini'; 
                  }
                  return prev;
              });
          } else if (gestureState.dy < -50) {
              setPlayerState(prev => {
                  if (prev === 'center') return 'full'; 
                  return prev;
              });
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
      if (x > 10) x = 10; if (x < -(width - MINI_WIDTH - 20)) x = -(width - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(height - MINI_HEIGHT - 120)) y = -(height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  // স্লাইডার এবং অডিও সিঙ্কিং মনিটর (সুপার স্মুথ আপডেট)
  useEffect(() => {
    const interval = setInterval(async () => {
        // ১. ভিডিওর সময় আপডেট করা (যদি দাগ ধরে টানা না হয়)
        if (!isSlidingRef.current && player) {
            setCurrentTime(player.currentTime);
            setDuration(player.duration > 0 ? player.duration : 1);
        }

        // ২. অডিও সিঙ্কিং চেক করা
        if (streamMode === 'separate' && player.playing) {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (audioStatus.isLoaded) {
                const diff = Math.abs((player.currentTime * 1000) - audioStatus.positionMillis);
                if (diff > 500) await syncAudioRef.current.setPositionAsync(player.currentTime * 1000);
                if (!audioStatus.isPlaying) await syncAudioRef.current.playAsync();
            }
        } else if (!player.playing) {
            await syncAudioRef.current.pauseAsync().catch(()=>{});
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player, streamMode]);

  // টাইম ফরম্যাটিং হেল্পার
  const formatTime = (timeInSeconds) => {
      if (isNaN(timeInSeconds)) return "00:00";
      const m = Math.floor(timeInSeconds / 60);
      const s = Math.floor(timeInSeconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (playerState === 'hidden') return null;
  const isInteractiveFull = playerState === 'full' || playerState === 'center';

  return (
    <Animated.View 
        style={[
            playerState === 'full' ? styles.fullContainer : 
            playerState === 'center' ? styles.centerContainer : 
            styles.miniContainer, 
            playerState === 'mini' && { transform: pan.getTranslateTransform() }
        ]} 
        {...(isInteractiveFull ? verticalPanResponder.panHandlers : miniPanResponder.panHandlers)}
    >
      <View style={playerState === 'center' ? styles.videoWrapperCentered : styles.videoWrapper}>
        
        {streamUrl && !fallbackData && !isAudioMode && (
          <VideoView 
            ref={videoViewRef} 
            player={player} 
            style={styles.video} 
            contentFit="contain"
            allowsFullscreen 
          />
        )}

        {/* ডাবল ট্যাপ এবং সিঙ্গেল ট্যাপ ডিটেকশন লেয়ার */}
        {isInteractiveFull && !fallbackData && (
            <View style={styles.tapOverlay}>
                <TouchableWithoutFeedback onPress={() => handleTap('left')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={() => handleTap('right')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
            </View>
        )}

        {/* কন্ট্রোল বার */}
        {isInteractiveFull && showControls && !fallbackData && (
          <View style={styles.controls} pointerEvents="box-none">
             <TouchableOpacity style={styles.backBtn} onPress={() => {
                 if(playerState === 'center') {
                     setPlayerState('full');
                 } else {
                     setPlayerState('mini');
                     if (navigation.canGoBack()) navigation.goBack();
                 }
             }}>
                <Ionicons name="chevron-down" size={35} color="#FFF" />
             </TouchableOpacity>
             
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={() => player.playing ? player.pause() : player.play()}>
                   <Ionicons name={player.playing ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                
                {/* 🚨 আপডেট: নিখুঁত প্রগ্রেস বার (দাগ টানা) 🚨 */}
                <Slider 
                  style={{flex: 1, height: 40, marginHorizontal: 10}}
                  minimumValue={0}
                  maximumValue={duration}
                  value={currentTime}
                  onSlidingStart={() => {
                      isSlidingRef.current = true; // দাগ টানা শুরু
                      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                  }}
                  onValueChange={(v) => setCurrentTime(v)} // টানার সময় ভ্যালু আপডেট
                  onSlidingComplete={async (v) => {
                      player.currentTime = v; // ভিডিও পজিশন আপডেট
                      if (streamMode === 'separate') await syncAudioWithVideo(v);
                      isSlidingRef.current = false; // দাগ টানা শেষ
                      triggerControls();
                  }}
                  minimumTrackTintColor="#FF0000"
                  thumbTintColor="#FF0000"
                />
                
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
                
                <TouchableOpacity style={{marginLeft: 15}} onPress={() => videoViewRef.current?.enterFullscreen()}>
                    <Ionicons name="expand" size={24} color="#FFF" />
                </TouchableOpacity>
             </View>
          </View>
        )}

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
                <TouchableOpacity onPress={() => setPlayerState('hidden')} style={styles.miniCloseBtn}>
                    <Ionicons name="close-circle" size={28} color="#FFF" />
                </TouchableOpacity>
            </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  centerContainer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 9999, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, overflow: 'hidden', elevation: 10, borderWidth: 1, borderColor: '#00FF00' },
  
  videoWrapper: { flex: 1, justifyContent: 'center', width: '100%' },
  videoWrapperCentered: { width: width, height: PLAYER_HEIGHT, justifyContent: 'center', position: 'relative' },
  video: { width: '100%', height: '100%' },
  
  tapOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  tapHalf: { flex: 1 },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  backBtn: { position: 'absolute', top: 10, left: 10, zIndex: 20 },
  centerRow: { flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  bottomBar: { position: 'absolute', bottom: 5, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 20 },
  timeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 30 },
  fallbackText: { color: '#FFF', textAlign: 'center', marginVertical: 20, fontSize: 16 },
  btn: { backgroundColor: '#FF0000', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#FFF', fontWeight: 'bold' },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
});
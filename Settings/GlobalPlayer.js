import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking, AppState } from 'react-native';

// 🚨 [LATEST PACKAGES]
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useLanguage } from '../LanguageContext';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation'; 
import * as WebBrowser from 'expo-web-browser'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

LogBox.ignoreLogs(['Video component', 'expo-audio', 'expo-video', 'InteractionManager', 'SafeAreaView']);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

const safePlay = (p) => { try { if (p && typeof p.play === 'function') p.play(); } catch(e){} };
const safePause = (p) => { try { if (p && typeof p.pause === 'function') p.pause(); } catch(e){} };
const safeSeek = (p, targetSec) => { if (!p) return; try { if (typeof p.seekTo === 'function') p.seekTo(targetSec); else p.currentTime = targetSec; } catch (e) {} };
const safeSetRate = (p, rate) => { if (!p) return; try { if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(rate); else p.playbackRate = rate; } catch (e) {} };
const safeSetMuted = (p, isMuted) => { if (!p) return; try { if (typeof p.setMuted === 'function') p.setMuted(isMuted); else p.muted = isMuted; } catch(e) {} };

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const syncAudioRef = useRef(null); 
  const { locale } = useLanguage(); 

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
  
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const isAudioModeRef = useRef(false);
  const streamModeRef = useRef('combined');
  const cachedAudioUrlRef = useRef(null); 
  const isSyncingRef = useRef(false);
  const pendingSeekRef = useRef(null); 

  // 🚨 [NEW] শুধুমাত্র ফ্রেম কাটার স্ট্যাটাস
  const targetScanSecRef = useRef(0); 
  const isExtractingRef = useRef(false);

  useEffect(() => {
    const setupAudio = async () => {
      try { await setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false }); } catch (e) {}
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
    if (streamModeRef.current === 'separate' && !isAudioModeRef.current) safeSetMuted(p, true); else safeSetMuted(p, false);
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
                  if (isFullscreen) { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); setIsFullscreen(false); }
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
          toggleFullscreen(); return true;
      } else if (playerState === 'center' || playerState === 'full') {
          setPlayerState('mini');
          navigation.navigate('Home'); return true;
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
            setIsFullscreen(false); setPlayerState('full'); scale.setValue(1); baseScaleRef.current = 1;
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            setIsFullscreen(true); setPlayerState('fullscreen'); scale.setValue(1); baseScaleRef.current = 1;
        }
    } catch (error) {}
  };

  const seekTo = async (newTime) => {
      setCurrentTime(newTime); 
      try {
          safeSeek(player, newTime); 
          if (!isAudioModeRef.current && streamModeRef.current === 'separate' && syncAudioRef.current) safeSeek(syncAudioRef.current, newTime);
      } catch (error) {}
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (currentVideoIdRef.current === data.videoId) {
          setPlayerState('full'); if (isFullscreen) toggleFullscreen(); return;
      }

      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null); setVideoSource(null); resumeTimeRef.current = 0; 
      
      // 🚨 নতুন ভিডিও শুরু হলে স্ক্যানার রিসেট
      targetScanSecRef.current = 0; 
      isExtractingRef.current = false;

      setCurrentTime(0); scale.setValue(1); baseScaleRef.current = 1;
      triggerControls();
      safeReleaseAudio();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    return () => { playSub.remove(); };
  }, [isFullscreen, streamUrl, player]);

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      let reqQ = 720;
      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`);
      const json = await res.json();
      if (fetchId !== fetchIdRef.current) return;
      if (json.success && json.url) {
          startPlayback(json);
      }
    } catch(e) {}
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined'); streamModeRef.current = json.streamType || 'combined';
    setStreamUrl(json.url); setVideoSource(json.url); 
  };


  // 🚨 -------------------- LOADED BUFFER EXTRACTION ENGINE -------------------- 🚨
  
  useEffect(() => {
      const frameScanner = setInterval(async () => {
          // ভিডিও সোর্স না থাকলে বা প্লেয়ার রেডি না থাকলে কাজ করবে না
          if (!player || player.duration <= 0 || isExtractingRef.current || !videoSource) return;
          
          let targetSec = targetScanSecRef.current;
          const duration = player.duration;

          // ভিডিও শেষ হয়ে গেলে স্ক্যান বন্ধ
          if (targetSec > duration) return;

          isExtractingRef.current = true;

          try {
              // 🚨 [PROBING THE LOADED BUFFER]
              // এই ফাংশনটি স্ক্রিনশট নেয় না। এটি সরাসরি মেমোরিতে থাকা (Loaded) ভিডিও থেকে ফ্রেম কেটে আনে।
              // যদি ভিডিও ওই পর্যন্ত লোড না হয়ে থাকে, তবে ২ সেকেন্ড পর এটি টাইমআউট হয়ে যাবে।
              const extractPromise = player.generateThumbnailsAsync([targetSec]);
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));
              
              const thumbs = await Promise.race([extractPromise, timeoutPromise]);

              if (thumbs && thumbs.length > 0) {
                  // ফ্রেম সফলভাবে কাটা হয়েছে
                  console.log(`✅ [${targetSec}s] Frame cut from LOADED VIDEO -> ${thumbs[0].uri}`);
                  
                  // সফল হলে পরবর্তী ৩ সেকেন্ডের জন্য এগোবে
                  targetScanSecRef.current += 3;
              } else {
                  console.log(`⚠️ [${targetSec}s] Frame returned empty.`);
              }

          } catch(e) {
              // TIMEOUT - তারমানে ভিডিও এখনো ওই সেকেন্ড পর্যন্ত ইন্টারনেট থেকে লোড (Buffer) হয়নি
              console.log(`⏳ [${targetSec}s] Waiting for video to load...`);
              // targetScanSecRef বাড়াবো না, পরেরবার আবার একই সেকেন্ডে ট্রাই করবে
          } finally {
              isExtractingRef.current = false;
          }
          
      }, 1000); // প্রতি ১ সেকেন্ডে চেক করবে নতুন বাফার হলো কিনা

      return () => clearInterval(frameScanner);
  }, [player, videoSource]);

  // 🚨 -------------------- ENGINE END -------------------- 🚨


  useEffect(() => {
    const videoProgressSync = setInterval(async () => {
        if (isSyncingRef.current) return; 
        isSyncingRef.current = true;

        try {
            setIsPlayingUI(player?.playing || false);
            if (player) {
                if (player.currentTime >= 0) {
                    setCurrentTime(player.currentTime);
                    if (player.duration > 0) setDuration(player.duration);
                }
            }
        } catch(e) {}
        isSyncingRef.current = false;
    }, 1000);
    return () => clearInterval(videoProgressSync);
  }, [player, videoSource]);

  const closePlayer = async () => {
      setPlayerState('hidden'); if (isFullscreen) await toggleFullscreen();
      setStreamUrl(null); setVideoSource(null); safePause(player); safeReleaseAudio(); 
  };

  const formatTime = (timeInSeconds) => {
      if (isNaN(timeInSeconds)) return "00:00";
      const m = Math.floor(timeInSeconds / 60); const s = Math.floor(timeInSeconds % 60); return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (playerState === 'hidden') return null;
  const isInteractiveFull = playerState === 'full' || playerState === 'center' || playerState === 'fullscreen';
  const bufferedWidth = duration > 0 ? `${(buffered / duration) * 100}%` : '0%';

  return (
    <Animated.View 
        style={[
            playerState === 'fullscreen' ? styles.fullscreenContainer : 
            playerState === 'full' ? styles.fullContainer : 
            playerState === 'center' ? styles.centerContainer : 
            styles.miniContainer, 
            playerState === 'mini' && { transform: pan.getTranslateTransform() }
        ]} 
    >
      <View style={styles.videoWrapper}>
        {streamUrl && (
          <View style={{ flex: 1, width: '100%', height: '100%' }}>
            <Animated.View style={[styles.animatedVideoWrapper, { transform: [{ scale: scale }] }]}>
                {videoSource ? (
                    <View collapsable={false} style={styles.video}>
                        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} allowsPictureInPicture surfaceType="textureView" />
                    </View>
                ) : null}
            </Animated.View>
          </View>
        )}

        {isInteractiveFull && showControls && (
          <View style={styles.controls} pointerEvents="box-none">
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={async () => {
                    if (player) {
                        if (player.playing) safePause(player); 
                        else safePlay(player); 
                    }
                    triggerControls();
                }}>
                   <Ionicons name={isPlayingUI ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeTextLeft}>{formatTime(currentTime)}</Text>
                <View style={styles.sliderWrapper}>
                    <Slider style={{ flex: 1, height: 40 }} minimumValue={0} maximumValue={duration} value={currentTime} onValueChange={(v) => setCurrentTime(v)} onSlidingComplete={async (v) => { await seekTo(v); triggerControls(); }} minimumTrackTintColor="#FF0000" maximumTrackTintColor="transparent" thumbTintColor="#FF0000" />
                </View>
                <Text style={styles.timeTextRight}>{formatTime(duration)}</Text>
                <TouchableOpacity style={{marginLeft: 12}} onPress={toggleFullscreen}><Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#FFF" /></TouchableOpacity>
             </View>
          </View>
        )}
        
        {!isInteractiveFull && (
            <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchableArea} onPress={() => { if (videoData) { navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData }); setPlayerState('full'); } }}>
                <View style={styles.miniControlsRow}>
                    <TouchableOpacity onPress={closePlayer} style={styles.miniCtrlBtn}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
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
  videoWrapper: { flex: 1, justifyContent: 'center', width: '100%', height: '100%' }, animatedVideoWrapper: { flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }, video: { flex: 1, width: '100%', height: '100%' },
  tapOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 }, tapHalf: { flex: 1 }, controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  centerRow: { flexDirection: 'row', alignItems: 'center', zIndex: 20 }, bottomBar: { position: 'absolute', bottom: 5, width: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, zIndex: 20 },
  timeTextLeft: { color: '#FFF', fontSize: 13, fontWeight: 'bold', minWidth: 40, textAlign: 'center' }, timeTextRight: { color: '#FFF', fontSize: 13, fontWeight: 'bold', minWidth: 40, textAlign: 'center' },
  sliderWrapper: { flex: 1, marginHorizontal: 8, justifyContent: 'center', position: 'relative', height: 40 }, miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 }, miniControlsRow: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' }, miniCtrlBtn: { padding: 5, marginHorizontal: 3 }
});
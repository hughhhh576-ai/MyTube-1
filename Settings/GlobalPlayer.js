import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking, AppState, Image, Platform } from 'react-native';
// 🚨 [MODIFIED] এআইয়ের জন্য পারফেক্ট (TextureView সাপোর্টেড) পুরনো প্যাকেজটি ফিরিয়ে আনা হলো
import { Audio, Video, ResizeMode } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useLanguage } from '../LanguageContext';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation'; 
import * as WebBrowser from 'expo-web-browser'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import { BlurView } from 'expo-blur';
import { captureRef } from 'react-native-view-shot'; 
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer'; 
import * as jpeg from 'jpeg-js';
import { Asset } from 'expo-asset'; 
import FaceDetection from '@react-native-ml-kit/face-detection';
import { loadTensorflowModel } from 'react-native-fast-tflite';

LogBox.ignoreLogs(['Video component', 'expo-audio', 'expo-video', 'InteractionManager']);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

// সেফটি ফাংশনগুলো (expo-av এর জন্য আপডেট করা হলো)
const safePlay = async (p) => { try { if (p) await p.playAsync(); } catch(e){} };
const safePause = async (p) => { try { if (p) await p.pauseAsync(); } catch(e){} };
const safeSeek = async (p, targetSec) => { try { if (p) await p.setPositionAsync(targetSec * 1000); } catch (e) {} };
const safeSetRate = async (p, rate) => { try { if (p) await p.setRateAsync(rate, true); } catch (e) {} };
const safeSetVolume = async (p, vol) => { try { if (p) await p.setVolumeAsync(vol); } catch(e) {} };
const safeSetMuted = async (p, isMuted) => { try { if (p) await p.setIsMutedAsync(isMuted); } catch(e) {} };

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); 
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
  const [buffered, setBuffered] = useState(0); 
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

  const [isBlurred, setIsBlurred] = useState(false);
  const [aiVisionImage, setAiVisionImage] = useState(null); 
  
  const isAiProcessingRef = useRef(false);
  const lastAiCheckTimeRef = useRef(0);
  const genderModelRef = useRef(null);
  const snapshotRef = useRef(null);

  useEffect(() => {
    const setupAudio = async () => {
      try { await Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false }); } catch (e) {}
    };
    setupAudio();
  }, []);

  const safeReleaseAudio = () => {
      if (syncAudioRef.current) { try { syncAudioRef.current.unloadAsync(); } catch(e) {} syncAudioRef.current = null; }
  };

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', async (nextAppState) => {});
    return () => appStateSub.remove();
  }, []);

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
          const state = navigation.getState();
          if (state && state.routes) {
              const routes = state.routes;
              for (let i = routes.length - 1; i >= 0; i--) {
                  if (routes[i].name !== 'Player' && routes[i].name !== 'PlayerScreen') {
                      navigation.navigate(routes[i].name); return true;
                  }
              }
          }
          navigation.navigate('Home'); return true;
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
            setIsFullscreen(false); setPlayerState('full'); scale.setValue(1); baseScaleRef.current = 1;
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            setIsFullscreen(true); setPlayerState('fullscreen'); scale.setValue(1); baseScaleRef.current = 1;
        }
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
      setFallbackData(null); setIsAudioMode(false); isAudioModeRef.current = false;
      cachedAudioUrlRef.current = null; pendingSeekRef.current = null;
      
      setIsBlurred(false); 
      setAiVisionImage(null); 
      isAiProcessingRef.current = false;
      lastAiCheckTimeRef.current = 0;

      setCurrentTime(0); setBuffered(0); scale.setValue(1); baseScaleRef.current = 1;
      triggerControls(); safeReleaseAudio();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
      setIsAudioMode(mode); isAudioModeRef.current = mode;

      if (mode) {
          resumeTimeRef.current = currentTime;
          if (videoViewRef.current) {
              const status = await videoViewRef.current.getStatusAsync();
              if (status.isLoaded) resumeTimeRef.current = status.positionMillis / 1000;
              await safePause(videoViewRef.current);
          }
          setIsPlayingUI(true); 

          let audioUrlToPlay = cachedAudioUrlRef.current;
          if (!audioUrlToPlay) {
              try {
                  const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${currentVideoIdRef.current}`)}&action=play&type=audio`);
                  const json = await res.json();
                  if (json.success && (json.audioUrl || json.url)) { audioUrlToPlay = json.audioUrl || json.url; cachedAudioUrlRef.current = audioUrlToPlay; }
              } catch (e) {}
          }
          if (audioUrlToPlay) { safeReleaseAudio(); setVideoSource(audioUrlToPlay); pendingSeekRef.current = resumeTimeRef.current; }
      } else {
          resumeTimeRef.current = currentTime;
          if (videoViewRef.current) {
              const status = await videoViewRef.current.getStatusAsync();
              if (status.isLoaded) resumeTimeRef.current = status.positionMillis / 1000;
              await safePause(videoViewRef.current);
          }
          setVideoSource(streamUrl); 
          if (streamModeRef.current === 'separate' && cachedAudioUrlRef.current) {
              safeReleaseAudio(); 
              const { sound } = await Audio.Sound.createAsync({ uri: cachedAudioUrlRef.current });
              syncAudioRef.current = sound;
              await safeSetRate(sound, currentSpeed);
          }
      }
    });

    return () => { playSub.remove(); audioModeSub.remove(); };
  }, [isFullscreen, streamUrl, currentTime]);

  useEffect(() => {
      let timeoutId;
      if (videoSource) {
          timeoutId = setTimeout(async () => {
              try {
                  if (videoViewRef.current) {
                      if (resumeTimeRef.current > 0) await safeSeek(videoViewRef.current, resumeTimeRef.current);
                      await safePlay(videoViewRef.current);
                  }
                  if (!isAudioMode && streamModeRef.current === 'separate' && syncAudioRef.current) { 
                      await safeSeek(syncAudioRef.current, resumeTimeRef.current); 
                      await syncAudioRef.current.playAsync(); 
                  }
              } catch (e) {}
          }, 800); 
      }
      return () => clearTimeout(timeoutId);
  }, [videoSource, isAudioMode]);

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
          if (reqQ > resQ) { setFallbackData({ reqQ, resQ, data: json, message: `Requested ${reqQ}p is not available. Play ${resQ}p instead?` }); return; }
          startPlayback(json);
      }
    } catch(e) {}
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined'); streamModeRef.current = json.streamType || 'combined';
    cachedAudioUrlRef.current = json.audioUrl || null; setStreamUrl(json.url); setVideoSource(json.url); 
    if (json.audioUrl && streamModeRef.current === 'separate') {
        safeReleaseAudio(); 
        const { sound } = await Audio.Sound.createAsync({ uri: json.audioUrl });
        syncAudioRef.current = sound;
        await safeSetVolume(sound, 1.0); await safeSetRate(sound, currentSpeed); await sound.playAsync();
    }
  };

  const handleSkip = async (amount, isSilent = false) => {
      let newTime = currentTime + amount;
      if (newTime < 0) newTime = 0; if (newTime > duration) newTime = duration;
      setCurrentTime(newTime);
      if (videoViewRef.current) await safeSeek(videoViewRef.current, newTime);
      if (!isAudioModeRef.current && streamModeRef.current === 'separate' && syncAudioRef.current) await safeSeek(syncAudioRef.current, newTime);
      if (!isSilent) triggerControls(); 
  };

  const handleTap = (side) => {
      const now = Date.now(); const DOUBLE_TAP_DELAY = 300; 
      if (lastTapRef.current.side === side && (now - lastTapRef.current.time) < DOUBLE_TAP_DELAY) {
          clearTimeout(tapTimeoutRef.current); lastTapRef.current = { time: 0, side: '' }; handleSkip(side === 'right' ? 10 : -10, true); 
      } else {
          lastTapRef.current = { time: now, side };
          tapTimeoutRef.current = setTimeout(() => { setShowControls(prev => { const next = !prev; if (next) triggerControls(); return next; }); lastTapRef.current = { time: 0, side: '' }; }, DOUBLE_TAP_DELAY);
      }
  };

  const changeSpeed = async (speed) => {
      setCurrentSpeed(speed); 
      if (videoViewRef.current) await safeSetRate(videoViewRef.current, speed); 
      if (syncAudioRef.current) await safeSetRate(syncAudioRef.current, speed); 
      setShowSpeedMenu(false); setShowSettingsMenu(false);
  };

  const loadGenderModelAsync = async () => {
      if (!genderModelRef.current) {
          try {
              const modelAsset = Asset.fromModule(require('../assets/gender_classification.tflite'));
              await modelAsset.downloadAsync();
              let modelUri = modelAsset.localUri || modelAsset.uri;
              const localFilePath = FileSystem.documentDirectory + 'gender_model.tflite';
              const fileInfo = await FileSystem.getInfoAsync(localFilePath);
              if (fileInfo.exists) await FileSystem.deleteAsync(localFilePath);

              if (modelUri.startsWith('http')) {
                  const downloadRes = await FileSystem.downloadAsync(modelUri, localFilePath); modelUri = downloadRes.uri;
              } else {
                  await FileSystem.copyAsync({ from: modelUri, to: localFilePath }); modelUri = localFilePath;
              }
              const cleanPath = modelUri.replace('file://', '');
              genderModelRef.current = await loadTensorflowModel(cleanPath);
              console.log("✅ Model Loaded Perfectly from Memory");
          } catch (e) { console.log("Model Loading Failure:", e); }
      }
  };

  const detectFacesWithMLKit = async (uri) => {
      try { return await FaceDetection.detect(uri); } catch (error) { return []; }
  };

  const checkGenderWithTFLite = async (croppedFaceUri) => {
      try {
          await loadGenderModelAsync();
          if (!genderModelRef.current) return false;

          const MODEL_SIZE = 224; 
          const resizedImage = await ImageManipulator.manipulateAsync(
              croppedFaceUri, [{ resize: { width: MODEL_SIZE, height: MODEL_SIZE } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );

          const base64Data = await FileSystem.readAsStringAsync(resizedImage.uri, { encoding: FileSystem.EncodingType.Base64 });
          const rawBuffer = new Uint8Array(decode(base64Data));
          const rawImageData = jpeg.decode(rawBuffer, { useTArray: true });

          const rgbPixels = new Float32Array(MODEL_SIZE * MODEL_SIZE * 3);
          let rgbIndex = 0;
          for (let i = 0; i < rawImageData.data.length; i += 4) {
              rgbPixels[rgbIndex++] = rawImageData.data[i] / 255.0;     
              rgbPixels[rgbIndex++] = rawImageData.data[i + 1] / 255.0; 
              rgbPixels[rgbIndex++] = rawImageData.data[i + 2] / 255.0; 
          }

          const output = await genderModelRef.current.run([rgbPixels]);
          if (output && output[0] && output[0].length > 0) {
              const probability = output[0][0];
              console.log(`Female Probability: ${probability.toFixed(3)}`);
              return probability > 0.5; 
          }
          return false;
      } catch (error) { return false; }
  };

  const runRealTimeAI = async (timeInSeconds) => {
      if (!snapshotRef.current) return;
      isAiProcessingRef.current = true;
      
      try {
          const uri = await captureRef(snapshotRef, {
              format: 'jpg',
              quality: 0.8,
          });

          setAiVisionImage(uri);

          const faces = await detectFacesWithMLKit(uri);
          console.log(`👤 Faces found: ${faces.length}`);

          if (faces && faces.length > 0) {
              const face = faces[0];
              const box = face.frame || face.bounds || {}; 
              
              const originX = Math.max(0, box.left ?? box.x ?? box.originX ?? 0);
              const originY = Math.max(0, box.top ?? box.y ?? box.originY ?? 0);
              const width = box.width ?? 0;
              const height = box.height ?? 0;
              
              if (width > 0 && height > 0) {
                  const croppedFace = await ImageManipulator.manipulateAsync(
                      uri, [{ crop: { originX, originY, width, height } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  const isFemale = await checkGenderWithTFLite(croppedFace.uri);
                  setIsBlurred(isFemale); 
              } else {
                  setIsBlurred(false);
              }
          } else {
              setIsBlurred(false); 
          }
      } catch (error) {
          console.log(`❌ AI Failed: ${error.message || error}`);
      } finally {
          isAiProcessingRef.current = false; 
      }
  };

  useEffect(() => {
    const interval = setInterval(async () => {
        if (isSyncingRef.current) return; 
        isSyncingRef.current = true;

        try {
            if (videoViewRef.current) {
                const status = await videoViewRef.current.getStatusAsync();
                
                if (status.isLoaded) {
                    setIsPlayingUI(status.isPlaying);

                    if (pendingSeekRef.current !== null) {
                        await safeSeek(videoViewRef.current, pendingSeekRef.current);
                        setCurrentTime(pendingSeekRef.current);
                        pendingSeekRef.current = null;
                    } else if (!isSlidingRef.current) {
                        const currentSec = status.positionMillis / 1000;
                        setCurrentTime(currentSec);
                        if (status.durationMillis > 0) setDuration(status.durationMillis / 1000);
                        
                        if (videoSource && !isAudioMode && status.isPlaying) {
                            if (Math.abs(currentSec - lastAiCheckTimeRef.current) >= 3 && !isAiProcessingRef.current) {
                                lastAiCheckTimeRef.current = currentSec;
                                runRealTimeAI(currentSec);
                            }
                        }
                    }

                    if (!isAudioMode && streamMode === 'separate' && videoSource && syncAudioRef.current) {
                        const audioStatus = await syncAudioRef.current.getStatusAsync();
                        if (audioStatus.isLoaded) {
                            if (status.isPlaying) {
                                const diff = Math.abs((status.positionMillis / 1000) - (audioStatus.positionMillis / 1000));
                                if (diff > 1.5) { await safeSeek(syncAudioRef.current, status.positionMillis / 1000); }
                                if (!audioStatus.isPlaying) await syncAudioRef.current.playAsync();
                            } else {
                                if (audioStatus.isPlaying) await syncAudioRef.current.pauseAsync();
                            }
                        }
                    }
                }
            }
        } catch(e) {}

        isSyncingRef.current = false;
    }, 1000);
    return () => clearInterval(interval);
  }, [streamMode, isAudioMode, videoSource]);

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
              isZoomingRef.current = true; const dx = touches[0].pageX - touches[1].pageX; const dy = touches[0].pageY - touches[1].pageY; initialDistanceRef.current = Math.sqrt(dx*dx + dy*dy);
          }
      },
      onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches && touches.length >= 2 && initialDistanceRef.current) {
              isZoomingRef.current = true; const dx = touches[0].pageX - touches[1].pageX; const dy = touches[0].pageY - touches[1].pageY; const currentDistance = Math.sqrt(dx*dx + dy*dy);
              let newScale = baseScaleRef.current * (currentDistance / initialDistanceRef.current);
              if (newScale < 0.2) newScale = 0.2; if (newScale > 6.0) newScale = 6.0; scale.setValue(newScale);
          }
      },
      onPanResponderRelease: (evt, gestureState) => {
          if (isZoomingRef.current) {
              baseScaleRef.current = scale._value; initialDistanceRef.current = null; setTimeout(() => { isZoomingRef.current = false; }, 100); return;
          }
          if (gestureState.dy > 50 && Math.abs(gestureState.vy) > 0.5) {
              setPlayerState(prev => { if (prev === 'fullscreen') { toggleFullscreen(); return 'mini'; } if (prev === 'full') return 'center'; if (prev === 'center') { handleSmartBack(); return 'mini'; } return prev; });
          } else if (gestureState.dy < -50 && Math.abs(gestureState.vy) > 0.5) {
              setPlayerState(prev => { if (prev === 'center') return 'full'; return prev; });
          } else if (Math.abs(gestureState.dx) < 15 && Math.abs(gestureState.dy) < 15) {
              const side = gestureState.x0 < (PORTRAIT_WIDTH / 2) ? 'left' : 'right'; handleTap(side);
          }
      },
      onPanResponderTerminate: () => {
          if (isZoomingRef.current) { baseScaleRef.current = scale._value; initialDistanceRef.current = null; isZoomingRef.current = false; }
      }
  })).current;

  const miniPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, 
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset(); let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(PORTRAIT_WIDTH - MINI_WIDTH - 20)) x = -(PORTRAIT_WIDTH - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(Dimensions.get('window').height - MINI_HEIGHT - 120)) y = -(Dimensions.get('window').height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  const closePlayer = async () => {
      setPlayerState('hidden'); if (isFullscreen) await toggleFullscreen();
      setStreamUrl(null); setVideoSource(null); 
      if (videoViewRef.current) await safePause(videoViewRef.current); 
      safeReleaseAudio(); setIsBlurred(false); 
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
        {...(!isInteractiveFull ? miniPanResponder.panHandlers : {})}
    >
      <View style={styles.videoWrapper}>
        
        {streamUrl && !fallbackData && (
          <View style={{ flex: 1, width: '100%', height: '100%' }}>
            
            <Animated.View style={[styles.animatedVideoWrapper, { transform: [{ scale: scale }] }]}>
                {videoSource ? (
                    <>
                        <View ref={snapshotRef} collapsable={false} style={styles.video}>
                            {/* 🚨 [THE GAME CHANGER] - expo-av এর Video component ব্যবহার করা হলো */}
                            <Video 
                                ref={videoViewRef} 
                                source={{ uri: videoSource }} 
                                style={styles.video} 
                                resizeMode={ResizeMode.CONTAIN} 
                                shouldPlay={true}
                                isMuted={streamModeRef.current === 'separate' && !isAudioModeRef.current}
                                rate={currentSpeed}
                            />
                        </View>
                        
                        {isBlurred && !isAudioMode && (
                            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFillObject} />
                        )}

                        {aiVisionImage && isInteractiveFull && (
                            <View style={styles.debugWindow}>
                                <Image source={{ uri: aiVisionImage }} style={{ flex: 1, width: '100%', height: '100%' }} resizeMode="contain" />
                                <Text style={styles.debugText}>🤖 AI VISION</Text>
                            </View>
                        )}
                    </>
                ) : null}
            </Animated.View>

            {isAudioMode && (
                <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', zIndex: 2, backgroundColor: '#000' }]}>
                    <Image source={{ uri: `https://img.youtube.com/vi/${currentVideoIdRef.current}/hqdefault.jpg` }} style={[StyleSheet.absoluteFillObject, { opacity: 0.2 }]} resizeMode="cover" />
                    <Ionicons name="headset" size={70} color="#00BFA5" />
                    <Text style={{ color: '#00BFA5', marginTop: 15, fontSize: 16, fontWeight: 'bold' }}>{__translate('ব্যাকগ্রাউন্ড অডিও মোড চলছে')}</Text>
                    <Text style={{ color: '#DDD', marginTop: 5, fontSize: 12 }}>{__translate('লক স্ক্রিন থেকেও নিয়ন্ত্রণ করা যাবে')}</Text>
                </View>
            )}

          </View>
        )}

        {isInteractiveFull && !fallbackData && (
            <View style={styles.tapOverlay} {...videoPanResponder.panHandlers}>
                <TouchableWithoutFeedback onPress={() => handleTap('left')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
                <TouchableWithoutFeedback onPress={() => handleTap('right')}><View style={styles.tapHalf} /></TouchableWithoutFeedback>
            </View>
        )}

        {isInteractiveFull && showControls && !fallbackData && (
          <View style={styles.controls} pointerEvents="box-none">
             
             <View style={styles.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={async () => {
                    if (videoViewRef.current) {
                        const status = await videoViewRef.current.getStatusAsync();
                        if (status.isLoaded) {
                            if (status.isPlaying) { 
                                await safePause(videoViewRef.current); 
                                if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) await syncAudioRef.current.pauseAsync(); 
                            } else { 
                                await safePlay(videoViewRef.current); 
                                if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) await syncAudioRef.current.playAsync(); 
                            }
                        }
                    }
                    triggerControls();
                }}>
                   <Ionicons name={isPlayingUI ? "pause-circle" : "play-circle"} size={75} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Text style={styles.timeTextLeft}>{formatTime(currentTime)}</Text>
                
                <View style={styles.sliderWrapper}>
                    <View style={styles.customTrackContainer}>
                        <View style={[styles.bufferedBar, { width: bufferedWidth }]} />
                    </View>
                    <Slider 
                      style={{ flex: 1, height: 40 }} minimumValue={0} maximumValue={duration} value={currentTime}
                      onSlidingStart={() => { isSlidingRef.current = true; if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); }}
                      onValueChange={(v) => setCurrentTime(v)} 
                      onSlidingComplete={async (v) => { await seekTo(v); isSlidingRef.current = false; triggerControls(); }}
                      minimumTrackTintColor="#FF0000" maximumTrackTintColor="transparent" thumbTintColor="#FF0000"
                    />
                </View>

                <Text style={styles.timeTextRight}>{formatTime(duration)}</Text>
                <TouchableOpacity style={{marginLeft: 12}} onPress={() => setShowSettingsMenu(true)}><Ionicons name="settings-outline" size={22} color="#FFF" /></TouchableOpacity>
                <TouchableOpacity style={{marginLeft: 12}} onPress={toggleFullscreen}><Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#FFF" /></TouchableOpacity>
             </View>
          </View>
        )}

        <Modal visible={showSettingsMenu} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSettingsMenu(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>{__translate('Player Settings')}</Text>
                    
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettingsMenu(false); const ytUrl = `https://www.youtube.com/watch?v=${currentVideoIdRef.current}?app=desktop`; Linking.openURL(`googlechrome://navigate?url=${ytUrl}`).catch(() => { WebBrowser.openBrowserAsync(ytUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN }); }); }}>
                        <Ionicons name="globe-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>{__translate('Open in Browser')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettingsMenu(false); setShowSpeedMenu(true); }}>
                        <Ionicons name="speedometer-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>Playback Speed ({currentSpeed}x)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={async () => {
                        setShowSettingsMenu(false); if (!videoData || !currentVideoIdRef.current) return;
                        try {
                            const existing = await AsyncStorage.getItem('saved_playlist'); let playlist = existing ? JSON.parse(existing) : [];
                            const isSaved = playlist.find(v => v.id === currentVideoIdRef.current);
                            if (!isSaved) { playlist.unshift({ id: currentVideoIdRef.current, title: videoData.title || "Video", channel: videoData.channel || "Channel", thumbnail: `https://i.ytimg.com/vi/${currentVideoIdRef.current}/hqdefault.jpg`, views: videoData.views || "" }); await AsyncStorage.setItem('saved_playlist', JSON.stringify(playlist)); alert("ভিডিওটি প্লেলিস্টে সেভ হয়েছে!"); } else { alert("ভিডিওটি আগে থেকেই প্লেলিস্টে আছে!"); }
                        } catch(e) { alert("সেভ করতে সমস্যা হয়েছে।"); }
                    }}>
                        <Ionicons name="add-circle-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>{__translate('Save to Playlist')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettingsMenu(false); Share.share({ message: `Watch this awesome video: https://www.youtube.com/watch?v=${currentVideoIdRef.current}` }); }}>
                        <Ionicons name="share-social-outline" size={20} color="#FFF" style={styles.menuIcon} />
                        <Text style={styles.menuText}>{__translate('Share')}</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>

        <Modal visible={showSpeedMenu} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowSpeedMenu(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.settingsMenu}>
                    <Text style={styles.modalTitle}>{__translate('Select Speed')}</Text>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                        <TouchableOpacity key={s} style={styles.menuItem} onPress={() => changeSpeed(s)}>
                            <Text style={[styles.menuText, currentSpeed === s && {color: '#FF0000', fontWeight: 'bold'}]}>{s === 1.0 ? 'Normal (1.0x)' : `${s}x`}</Text>
                        </TouchableOpacity>
                    ))}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>

        {fallbackData && (
          <View style={styles.fallbackOverlay}>
            <Ionicons name="alert-circle" size={50} color="#FFD700" />
            <Text style={styles.fallbackText}>{fallbackData.message}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => { startPlayback(fallbackData.data); setFallbackData(null); }}><Text style={styles.btnText}>{__translate('OK, Play Highest Quality')}</Text></TouchableOpacity>
          </View>
        )}
        
        {!isInteractiveFull && (
            <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchableArea} onPress={() => { if (videoData) { navigation.navigate('Player', { videoId: currentVideoIdRef.current, videoData }); setPlayerState('full'); } }}>
                <View style={styles.miniControlsRow}>
                    <TouchableOpacity style={styles.miniCtrlBtn} onPress={async () => {
                        if (videoViewRef.current) {
                            const status = await videoViewRef.current.getStatusAsync();
                            if (status.isLoaded) {
                                if (status.isPlaying) { 
                                    await safePause(videoViewRef.current); 
                                    if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) await syncAudioRef.current.pauseAsync(); 
                                } else { 
                                    await safePlay(videoViewRef.current); 
                                    if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) await syncAudioRef.current.playAsync(); 
                                }
                            }
                        }
                    }}>
                        <Ionicons name={isPlayingUI ? "pause" : "play"} size={22} color="#FFF" />
                    </TouchableOpacity>
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
  sliderWrapper: { flex: 1, marginHorizontal: 8, justifyContent: 'center', position: 'relative', height: 40 }, customTrackContainer: { position: 'absolute', left: Platform.OS === 'android' ? 15 : 0, right: Platform.OS === 'android' ? 15 : 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }, bufferedBar: { height: '100%', backgroundColor: 'rgba(144, 238, 144, 0.8)', borderRadius: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }, settingsMenu: { width: 250, backgroundColor: '#1A1A1A', borderRadius: 15, padding: 15, elevation: 10 }, modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 }, menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' }, menuIcon: { marginRight: 10 }, menuText: { color: '#FFF', fontSize: 16 },
  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 30 }, fallbackText: { color: '#FFF', textAlign: 'center', marginVertical: 20, fontSize: 16 }, btn: { backgroundColor: '#FF0000', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 }, btnText: { color: '#FFF', fontWeight: 'bold' },
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 }, miniControlsRow: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' }, miniCtrlBtn: { padding: 5, marginHorizontal: 3 },
  debugWindow: { position: 'absolute', top: 80, right: 20, width: 100, height: 150, backgroundColor: '#000', borderWidth: 2, borderColor: '#FF0000', zIndex: 100, elevation: 10 },
  debugText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', textAlign: 'center', backgroundColor: '#FF0000', padding: 2 }
});
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking, AppState, Image, Platform } from 'react-native';

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

// 🚨 [REAL AI INTEGRATION PACKAGES]
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy'; 
import { decode } from 'base64-arraybuffer'; 
import * as jpeg from 'jpeg-js';
import { Asset } from 'expo-asset'; 
import FaceDetection from '@react-native-ml-kit/face-detection';
import { loadTensorflowModel } from 'react-native-fast-tflite';

LogBox.ignoreLogs(['Video component', 'expo-audio', 'expo-video', 'InteractionManager', 'SafeAreaView']);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

const safePlay = (p) => { try { if (p && typeof p.play === 'function') { const res = p.play(); if (res && res.catch) res.catch(()=>{}); } } catch(e){} };
const safePause = (p) => { try { if (p && typeof p.pause === 'function') { const res = p.pause(); if (res && res.catch) res.catch(()=>{}); } } catch(e){} };
const safeSeek = (p, targetSec) => { if (!p) return; try { if (typeof p.seekTo === 'function') p.seekTo(targetSec); else if (typeof p.seekBy === 'function') p.seekBy(targetSec - p.currentTime); else p.currentTime = targetSec; } catch (e) {} };
const safeSetRate = (p, rate) => { if (!p) return; try { if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(rate); else if (typeof p.setRate === 'function') p.setRate(rate); else p.playbackRate = rate; } catch (e) {} };
const safeSetVolume = (p, vol) => { if (!p) return; try { if (typeof p.setVolume === 'function') p.setVolume(vol); else p.volume = vol; } catch(e) {} };
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

  // 🚨 [PRO AI STATES - 3 SECOND CHUNK ARCHITECTURE]
  const [isBlurred, setIsBlurred] = useState(false);
  const [blurOverlayImage, setBlurOverlayImage] = useState(null);
  
  const aiDataMapRef = useRef({}); // ডাটাবেস সেভ করার জন্য
  const backgroundScanSecRef = useRef(0); // ৩, ৬, ৯ সেকেন্ড ট্র্যাকার
  const isAiProcessingRef = useRef(false); // একই সাথে ২ বার যেন স্ক্যান না হয়
  
  const genderModelRef = useRef(null);

  useEffect(() => {
    const setupAudio = async () => {
      try { await setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false }); } catch (e) {}
    };
    setupAudio();
  }, []);

  const safeReleaseAudio = () => {
      if (syncAudioRef.current) { try { syncAudioRef.current.release(); } catch(e) {} syncAudioRef.current = null; }
  };

  const player = useVideoPlayer(videoSource, (p) => {
    if (!videoSource) return; 
    try { p.loop = false; } catch(e) {}
    safeSetRate(p, currentSpeed);
    if (streamModeRef.current === 'separate' && !isAudioModeRef.current) { safeSetMuted(p, true); } else { safeSetMuted(p, false); }
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

  const seekTo = async (newTime) => {
      setCurrentTime(newTime); 
      try {
          safeSeek(player, newTime); 
          if (!isAudioModeRef.current && streamModeRef.current === 'separate' && syncAudioRef.current) { safeSeek(syncAudioRef.current, newTime); }
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
      setBlurOverlayImage(null);
      
      // 🚨 [RESET AI CHUNK DATABASE] নতুন ভিডিও প্লে হলে ডাটাবেস ক্লিয়ার করা হলো
      aiDataMapRef.current = {};
      backgroundScanSecRef.current = 0; // ০ সেকেন্ড থেকে শুরু
      isAiProcessingRef.current = false;

      setCurrentTime(0); setBuffered(0); scale.setValue(1); baseScaleRef.current = 1;
      triggerControls(); safeReleaseAudio();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
      setIsAudioMode(mode); isAudioModeRef.current = mode;

      if (mode) {
          resumeTimeRef.current = player ? player.currentTime : currentTime;
          safePause(player); setIsPlayingUI(true); 

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
          resumeTimeRef.current = player ? player.currentTime : currentTime;
          safePause(player); setVideoSource(streamUrl); 
          if (streamModeRef.current === 'separate' && cachedAudioUrlRef.current) {
              safeReleaseAudio(); syncAudioRef.current = createAudioPlayer(cachedAudioUrlRef.current); safeSetRate(syncAudioRef.current, currentSpeed);
          }
      }
    });

    return () => { playSub.remove(); audioModeSub.remove(); };
  }, [isFullscreen, streamUrl, player]);

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
        safeReleaseAudio(); syncAudioRef.current = createAudioPlayer(json.audioUrl);
        safeSetVolume(syncAudioRef.current, 1.0); safeSetRate(syncAudioRef.current, currentSpeed); syncAudioRef.current.play();
    }
  };

  const handleSkip = async (amount, isSilent = false) => {
      let currentPosition = player ? player.currentTime : currentTime;
      let newTime = currentPosition + amount;
      if (newTime < 0) newTime = 0; if (newTime > duration) newTime = duration;
      await seekTo(newTime);
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
      setCurrentSpeed(speed); safeSetRate(player, speed); 
      if (syncAudioRef.current) safeSetRate(syncAudioRef.current, speed); 
      setShowSpeedMenu(false); setShowSettingsMenu(false);
  };

  // 🤖 -------------------- AI ENGINE START -------------------- 🤖
  
  const loadGenderModelAsync = async () => {
      if (!genderModelRef.current) {
          try {
              const asset = Asset.fromModule(require('../assets/gender_classification.tflite'));
              await asset.downloadAsync();
              genderModelRef.current = await loadTensorflowModel({ url: asset.localUri || asset.uri }, []);
          } catch (e) { }
      }
  };

  const detectFacesWithMLKit = async (uri) => {
      try { return await FaceDetection.detect(uri); } catch (error) { return []; }
  };

  const checkGenderWithTFLite = async (croppedFaceUri) => {
      try {
          await loadGenderModelAsync();
          if (!genderModelRef.current) return 0;

          const inputTensor = genderModelRef.current.inputs?.[0];
          const MODEL_WIDTH = inputTensor?.shape?.[1] || 224;
          const MODEL_HEIGHT = inputTensor?.shape?.[2] || 224;
          const isUint8 = inputTensor?.dataType === 'uint8' || inputTensor?.dataType === 'int8';

          const resizedImage = await ImageManipulator.manipulateAsync(
              croppedFaceUri, [{ resize: { width: MODEL_WIDTH, height: MODEL_HEIGHT } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );

          const base64Data = await FileSystem.readAsStringAsync(resizedImage.uri, { encoding: FileSystem.EncodingType.Base64 });
          const rawBuffer = new Uint8Array(decode(base64Data));
          const rawImageData = jpeg.decode(rawBuffer, { useTArray: true });

          const bufferSize = MODEL_WIDTH * MODEL_HEIGHT * 3 * (isUint8 ? 1 : 4);
          const pureInputBuffer = new ArrayBuffer(bufferSize);
          const inputData = isUint8 ? new Uint8Array(pureInputBuffer) : new Float32Array(pureInputBuffer);

          let rgbIndex = 0;
          for (let i = 0; i < rawImageData.data.length; i += 4) {
              if (isUint8) {
                  inputData[rgbIndex++] = rawImageData.data[i];     
                  inputData[rgbIndex++] = rawImageData.data[i + 1]; 
                  inputData[rgbIndex++] = rawImageData.data[i + 2]; 
              } else {
                  inputData[rgbIndex++] = rawImageData.data[i] / 255.0;     
                  inputData[rgbIndex++] = rawImageData.data[i + 1] / 255.0; 
                  inputData[rgbIndex++] = rawImageData.data[i + 2] / 255.0; 
              }
          }

          const output = await genderModelRef.current.run([pureInputBuffer]);
          let probability = 0;

          if (output && output.length > 0) {
              const rawOut = output[0];
              let outBuffer;
              if (rawOut instanceof ArrayBuffer) outBuffer = rawOut;
              else if (rawOut && rawOut.buffer instanceof ArrayBuffer) outBuffer = rawOut.buffer;
              else outBuffer = new Float32Array(rawOut).buffer;

              const outTensor = genderModelRef.current.outputs?.[0];
              if (outTensor?.dataType === 'uint8' || outTensor?.dataType === 'int8') {
                  probability = new Uint8Array(outBuffer)[0] / 255.0;
              } else {
                  probability = new Float32Array(outBuffer)[0];
              }
          }

          if (typeof probability !== 'number' || isNaN(probability)) probability = 0;
          return probability;
          
      } catch (error) { 
          return 0; 
      }
  };

  // 🚨 [SMART LOGIC] রিটার্ন করবে: 'w', 'm', বা 'none'
  const processFrameForGender = async (uri) => {
      try {
          const faces = await detectFacesWithMLKit(uri);
          
          if (faces && faces.length > 0) {
              let hasFemale = false;
              let hasMale = false;

              for (let i = 0; i < faces.length; i++) {
                  const face = faces[i];
                  const box = face.frame || face.bounds || {}; 
                  
                  let originX = Math.floor(Math.max(0, box.left ?? box.x ?? box.originX ?? 0));
                  let originY = Math.floor(Math.max(0, box.top ?? box.y ?? box.originY ?? 0));
                  let width = Math.floor(Math.max(10, box.width ?? 0));
                  let height = Math.floor(Math.max(10, box.height ?? 0));
                  
                  const croppedFace = await ImageManipulator.manipulateAsync(
                      uri, [{ crop: { originX, originY, width, height } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  
                  const femaleProbability = await checkGenderWithTFLite(croppedFace.uri);
                  
                  if (femaleProbability >= 0.50) {
                      hasFemale = true;
                      break; // একটি মেয়ে পেলেই আর স্ক্যান করবে না
                  } else {
                      hasMale = true;
                  }
              }
              
              if (hasFemale) return 'w';
              if (hasMale) return 'm';
          }
          return 'none';
      } catch (error) {
          return 'none';
      }
  };

  // 🚨 [STEP 1 & 2 & 3: BACKGROUND 3-SEC SCANNER & DB SAVER]
  useEffect(() => {
      const backgroundScanner = setInterval(async () => {
          if (!player || player.duration <= 0 || isAiProcessingRef.current || !videoSource) return;
          
          const duration = player.duration;
          let targetSec = backgroundScanSecRef.current;

          // ভিডিওর শেষ পর্যন্ত পৌঁছায়নি এমন সময়গুলোতে চেক করবে
          if (targetSec <= duration) {
              isAiProcessingRef.current = true;
              try {
                  const thumbs = await player.generateThumbnailsAsync([targetSec]);
                  if (thumbs && thumbs.length > 0) {
                      const result = await processFrameForGender(thumbs[0].uri);
                      
                      // ডাটাবেসে ডেটা সেভ করা হচ্ছে
                      aiDataMapRef.current[targetSec] = {
                          status: result, // 'w', 'm', 'none'
                          uri: thumbs[0].uri // ব্লার হিসেবে দেখানোর জন্য ছবিটিও সেভ রাখা হলো
                      };
                      
                      // 🚨 [STEP 3] টার্মিনালে ডাটাবেসের অবস্থা প্রিন্ট করা
                      let terminalLog = `\n--- 📊 AI DATA MAP (Loaded) ---\n`;
                      Object.keys(aiDataMapRef.current)
                          .map(Number)
                          .sort((a,b) => a - b)
                          .forEach(timeKey => {
                              terminalLog += `${timeKey}-${aiDataMapRef.current[timeKey].status}\n`;
                          });
                      console.log(terminalLog);
                      
                      // সফল হলে পরবর্তী ৩ সেকেন্ডের জন্য ইনডেক্স বাড়ানো হলো
                      backgroundScanSecRef.current += 3;
                  } else {
                      // যদি থাম্বনেইল না পাওয়া যায়, তবে none সেভ হবে
                      aiDataMapRef.current[targetSec] = { status: 'none', uri: null };
                      backgroundScanSecRef.current += 3;
                  }
              } catch(e) {
                  // Error মানে ভিডিও এখনো ততটুকু লোড (Buffer) হয়নি। তাই স্ক্যানার এখানেই অপেক্ষা করবে।
                  // console.log(`Waiting for buffer at ${targetSec}s...`);
              } finally {
                  isAiProcessingRef.current = false;
              }
          }
      }, 500); // প্রতি ০.৫ সেকেন্ডে চেক করবে নতুন বাফার হলো কিনা

      return () => clearInterval(backgroundScanner);
  }, [player, videoSource]);

  // 🚨 [STEP 4: PLAYBACK SYNC & BLUR CONTROLLER]
  useEffect(() => {
      const displayUpdater = setInterval(async () => {
          if (!player || isAudioMode || !videoSource) return;

          const currentSec = player.currentTime;
          // বর্তমান সময়কে ৩ এর গুণিতকে (Multiple of 3) ভাগ করা হচ্ছে 
          // যেমন: ৭.৫ সেকেন্ড হলে সেটিকে ফ্লোর করে ৬ সেকেন্ডের ব্লকে ফেলা হবে (7.5/3 = 2.5 -> 2 * 3 = 6)
          const currentBucket = Math.floor(currentSec / 3) * 3;
          
          const chunkData = aiDataMapRef.current[currentBucket];

          if (chunkData && chunkData.status === 'w') {
              // 🔴 এই ৩ সেকেন্ডের ব্লকে মহিলা আছে, তাই ব্লার অন করো!
              setIsBlurred(true);
              setBlurOverlayImage(chunkData.uri);
          } else {
              // 🟢 এই ৩ সেকেন্ডের ব্লকে পুরুষ আছে বা কেউ নেই, ব্লার অফ করো!
              setIsBlurred(false);
          }
          
      }, 200); // চোখের পলকে চেক করে আপডেট করবে

      return () => clearInterval(displayUpdater);
  }, [player, isAudioMode, videoSource]);

  // 🤖 -------------------- AI ENGINE END -------------------- 🤖

  useEffect(() => {
    const videoProgressSync = setInterval(async () => {
        if (isSyncingRef.current) return; 
        isSyncingRef.current = true;

        try {
            setIsPlayingUI(player?.playing || false);

            if (player) {
                if (pendingSeekRef.current !== null) {
                    safeSeek(player, pendingSeekRef.current);
                    setCurrentTime(pendingSeekRef.current);
                    pendingSeekRef.current = null;
                } else if (!isSlidingRef.current) {
                    try {
                        if (player.currentTime >= 0) {
                            setCurrentTime(player.currentTime);
                            if (player.duration > 0) setDuration(player.duration);
                        }
                    } catch(e) {}
                }
            }

            if (!isAudioMode && streamMode === 'separate' && videoSource && syncAudioRef.current) {
                const isAudioReady = syncAudioRef.current.duration > 0 || syncAudioRef.current.playing;
                if (isAudioReady) {
                    if (player && player.playing) {
                        const diff = Math.abs(player.currentTime - syncAudioRef.current.currentTime);
                        if (diff > 1.5) { safeSeek(syncAudioRef.current, player.currentTime); }
                        if (!syncAudioRef.current.playing) syncAudioRef.current.play();
                    } else {
                        if (syncAudioRef.current.playing) syncAudioRef.current.pause();
                    }
                }
            }
        } catch(e) {}

        isSyncingRef.current = false;
    }, 1000);
    return () => clearInterval(videoProgressSync);
  }, [player, streamMode, isAudioMode, videoSource]);

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
      setStreamUrl(null); setVideoSource(null); safePause(player); safeReleaseAudio(); setIsBlurred(false); 
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
                        {/* 🚨 surfaceType="textureView" */}
                        <View collapsable={false} style={styles.video}>
                            <VideoView 
                                player={player} 
                                style={styles.video} 
                                contentFit="contain" 
                                nativeControls={false} 
                                allowsPictureInPicture 
                                surfaceType="textureView"   
                            />
                        </View>
                        
                        {/* 🚨 Android Optical Illusion Blur */}
                        {isBlurred && blurOverlayImage && !isAudioMode && (
                            <View style={[StyleSheet.absoluteFillObject, { zIndex: 100, overflow: 'hidden' }]}>
                                <Image 
                                    source={{ uri: blurOverlayImage }} 
                                    style={[StyleSheet.absoluteFillObject, { transform: [{ scale: 1.1 }] }]} 
                                    blurRadius={50} 
                                />
                                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }]}>
                                    <Ionicons name="eye-off-outline" size={80} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 15 }}>মহিলা শনাক্ত হয়েছে</Text>
                                    <Text style={{ color: '#FFF', fontSize: 12, marginTop: 5 }}>(Censored by AI)</Text>
                                </View>
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
                    if (player) {
                        if (player.playing) { safePause(player); if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.pause(); } 
                        else { safePlay(player); if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.play(); }
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
                    <TouchableOpacity style={styles.miniCtrlBtn} onPress={async () => { if (player) { if (player.playing) { safePause(player); if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.pause(); } else { safePlay(player); if (!isAudioMode && streamMode === 'separate' && syncAudioRef.current) syncAudioRef.current.play(); } } }}>
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
  miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 }, miniControlsRow: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' }, miniCtrlBtn: { padding: 5, marginHorizontal: 3 }
});
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking, AppState, Platform } from 'react-native';

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

  // 🚨 BACKGROUND SCANNER STATES
  const aiDataMapRef = useRef({}); 
  const targetScanSecRef = useRef(0); 
  const isAiProcessingRef = useRef(false); 
  
  const genderModelRef = useRef(null);

  // 🚨 [FIXED] হারানো ফাংশনটি আবার যোগ করা হয়েছে
  const safeReleaseAudio = () => {
      if (syncAudioRef.current) { 
          try { syncAudioRef.current.release(); } catch(e) {} 
          syncAudioRef.current = null; 
      }
  };

  useEffect(() => {
    const setupAudio = async () => {
      try { await setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false }); } catch (e) {}
    };
    setupAudio();
  }, []);

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
      
      aiDataMapRef.current = {};
      targetScanSecRef.current = 0; 
      isAiProcessingRef.current = false;

      setCurrentTime(0); scale.setValue(1); baseScaleRef.current = 1;
      triggerControls();
      safeReleaseAudio(); // 🚨 এই ফাংশনটি খুঁজছিল অ্যাপ!

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
                      break; 
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

  // 🚨 THE BUFFER SCANNER (TESTING MODE)
  useEffect(() => {
      const bufferScanner = setInterval(async () => {
          if (!player || player.duration <= 0 || isAiProcessingRef.current || !videoSource) return;
          
          let targetSec = targetScanSecRef.current;
          const duration = player.duration;

          if (targetSec > duration) return;

          isAiProcessingRef.current = true;

          try {
              const extractPromise = player.generateThumbnailsAsync([targetSec]);
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));
              
              const thumbs = await Promise.race([extractPromise, timeoutPromise]);

              if (thumbs && thumbs.length > 0) {
                  const result = await processFrameForGender(thumbs[0].uri);
                  
                  aiDataMapRef.current[targetSec] = result;
                  
                  let terminalLog = `\n--- 📊 AI DATA MAP (Loaded Buffer) ---\n`;
                  Object.keys(aiDataMapRef.current)
                      .map(Number)
                      .sort((a,b) => a - b)
                      .forEach(timeKey => {
                          terminalLog += `${timeKey}-${aiDataMapRef.current[timeKey]}\n`;
                      });
                  console.log(terminalLog);
                  
                  targetScanSecRef.current += 3;
              }

          } catch(e) {
              // Timeout - waiting for buffer
          } finally {
              isAiProcessingRef.current = false;
          }
          
      }, 1000); 

      return () => clearInterval(bufferScanner);
  }, [player, videoSource]);

  // 🤖 -------------------- AI ENGINE END -------------------- 🤖


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
                    <Slider style={{ flex: 1, height: 40 }} minimumValue={0} maximumValue={duration} value={currentTime} onValueChange={(v) => setCurrentTime(v)} minimumTrackTintColor="#FF0000" maximumTrackTintColor="transparent" thumbTintColor="#FF0000" />
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
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
import * as FileSystem from 'expo-file-system'; 
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
  const isZoomingRef = useRef(false);
  const initialDistanceRef = useRef(null);
  
  const lastTapRef = useRef({ time: 0, side: '' });
  const tapTimeoutRef = useRef(null);
  const isSlidingRef = useRef(false); 

  const [playerState, setPlayerState] = useState('hidden'); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [videoSource, setVideoSource] = useState(null); 
  
  const [storyboardUrlTemplate, setStoryboardUrlTemplate] = useState(null);

  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayingUI, setIsPlayingUI] = useState(false); 
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const isAudioModeRef = useRef(false);
  const streamModeRef = useRef('combined');
  const isSyncingRef = useRef(false);
  const pendingSeekRef = useRef(null); 

  const aiDataMapRef = useRef({}); 
  const targetScanSecRef = useRef(0); 
  const isAiProcessingRef = useRef(false); 
  
  const genderModelRef = useRef(null);

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
    if (streamModeRef.current === 'separate' && !isAudioModeRef.current) {
        safeSetMuted(p, true); 
    } else {
        safeSetMuted(p, false);
    }
    // 🚨 অটো-প্লে ট্রিক
    safePlay(p);
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
      setStreamUrl(null); setVideoSource(null); 
      setStoryboardUrlTemplate(null);
      
      aiDataMapRef.current = {};
      targetScanSecRef.current = 0; 
      isAiProcessingRef.current = false;

      setCurrentTime(0); setDuration(0); scale.setValue(1); baseScaleRef.current = 1;
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
          if (json.storyboardUrl) {
              setStoryboardUrlTemplate(json.storyboardUrl);
          }
          startPlayback(json);
      }
    } catch(e) {}
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined'); streamModeRef.current = json.streamType || 'combined';
    setStreamUrl(json.url); 
    setVideoSource(json.url); 
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

  // 🚨 [THE ZERO-DATA CACHED SPRITE SOLUTION]
  const SB_COLS = 5;
  const SB_ROWS = 5;
  const SB_FRAME_W = 160;
  const SB_FRAME_H = 90;
  const SB_INTERVAL = 2; 
  const SB_FRAMES_PER_CHUNK = SB_COLS * SB_ROWS; 
  const SB_CHUNK_DURATION = SB_FRAMES_PER_CHUNK * SB_INTERVAL; 

  useEffect(() => {
      let isQueueActive = true;

      const processQueue = async () => {
          
          while (isQueueActive) {
              if (player && player.playing && player.duration > 0) break;
              await new Promise(r => setTimeout(r, 500));
          }

          if (!isQueueActive) return;

          console.log("⏸️ Video started! Giving player 2s to buffer...");
          await new Promise(r => setTimeout(r, 2000));

          while (isQueueActive) {
              if (!storyboardUrlTemplate || !videoSource) {
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
              }

              let targetSec = targetScanSecRef.current;
              const currentPlaybackSec = player ? player.currentTime : 0;
              const vDuration = player ? player.duration : 0;

              if (vDuration > 0 && targetSec > vDuration) {
                  await new Promise(r => setTimeout(r, 2000));
                  continue;
              }

              // বাফার রুল
              if (targetSec > currentPlaybackSec + 15) {
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
              }

              if (aiDataMapRef.current[targetSec] !== undefined) {
                  targetScanSecRef.current += SB_INTERVAL;
                  continue;
              }

              isAiProcessingRef.current = true;
              try {
                  const chunkNumber = Math.floor(targetSec / SB_CHUNK_DURATION); 
                  const timeInChunk = targetSec % SB_CHUNK_DURATION; 
                  const indexInChunk = Math.floor(timeInChunk / SB_INTERVAL); 
                  
                  const col = indexInChunk % SB_COLS; 
                  const row = Math.floor(indexInChunk / SB_COLS); 
                  
                  const cropX = col * SB_FRAME_W;
                  const cropY = row * SB_FRAME_H;
                  
                  const currentGridUrl = storyboardUrlTemplate.replace('$M', chunkNumber).replace('$L', '0').replace('$N', '0');

                  // 🚨 Local Cache System: ছবি শুধু একবার ডাউনলোড হবে!
                  const localChunkPath = `${FileSystem.cacheDirectory}sb_chunk_${chunkNumber}.jpg`;
                  const chunkInfo = await FileSystem.getInfoAsync(localChunkPath);

                  if (!chunkInfo.exists) {
                      console.log(`📥 Downloading Sprite Chunk ${chunkNumber} ONCE...`);
                      await FileSystem.downloadAsync(currentGridUrl, localChunkPath);
                  }

                  const croppedFrame = await ImageManipulator.manipulateAsync(
                      localChunkPath, 
                      [{ crop: { originX: cropX, originY: cropY, width: SB_FRAME_W, height: SB_FRAME_H } }], 
                      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                  );

                  const result = await processFrameForGender(croppedFrame.uri);
                  aiDataMapRef.current[targetSec] = result;
                  
                  let terminalLog = `\n--- 📊 AI DATA MAP (Local Cached Sprite) ---\n`;
                  terminalLog += `Target: ${targetSec}s | Image Chunk: ${chunkNumber} | Cut Pos: (X:${cropX}, Y:${cropY})\n`;
                  Object.keys(aiDataMapRef.current)
                      .map(Number)
                      .sort((a,b) => a - b)
                      .forEach(timeKey => {
                          terminalLog += `${timeKey}-${aiDataMapRef.current[timeKey]}\n`;
                      });
                  console.log(terminalLog);
                  
              } catch(e) {
                  console.log(`❌ Frame Error at ${targetSec}s:`, e.message);
              } finally {
                  isAiProcessingRef.current = false;
                  targetScanSecRef.current += SB_INTERVAL;
              }

              // নিঃশ্বাস নেওয়ার সময়
              await new Promise(r => setTimeout(r, 500)); 
          }
      };

      processQueue();

      return () => { isQueueActive = false; };
  }, [player, videoSource, storyboardUrlTemplate]);

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
                    if (player.duration > 0 && duration === 0) setDuration(player.duration);
                }
            }
        } catch(e) {}
        isSyncingRef.current = false;
    }, 1000);
    return () => clearInterval(videoProgressSync);
  }, [player, videoSource, duration]);

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
  sliderWrapper: { flex: 1, marginHorizontal: 8, justifyContent: 'center', position: 'relative', height: 40 }, customTrackContainer: { position: 'absolute', left: Platform.OS === 'android' ? 15 : 0, right: Platform.OS === 'android' ? 15 : 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }, bufferedBar: { height: '100%', backgroundColor: 'rgba(144, 238, 144, 0.8)', borderRadius: 2 }, miniTouchableArea: { flex: 1, width: '100%', height: '100%', position: 'absolute', zIndex: 50 }, miniControlsRow: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' }, miniCtrlBtn: { padding: 5, marginHorizontal: 3 }
});
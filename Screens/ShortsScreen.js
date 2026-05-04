import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';

// ৪টি আলাদা কোয়ালিটির জন্য ৪টি ভিন্ন মোবাইলের সুরত (User-Agents)
const UAS = {
  anti: "Mozilla/5.0 (Linux; Android 11; LS5018 Build/RP1A.201005.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36", // JioPhone
  low: "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36", // Nexus 5
  normal: "Mozilla/5.0 (Linux; Android 10; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36", // Galaxy A51
  high: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36" // Pixel 8 Pro
};

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  // [NEW LOGIC]: স্ক্রিন অ্যাক্টিভ আছে কি না তা ট্র্যাক করার স্টেট
  const [isActive, setIsActive] = useState(true);

  const [isAutoSkipping, setIsAutoSkipping] = useState(false);
  const [shortsLoading, setShortsLoading] = useState(true);
  const [uaReady, setUaReady] = useState(false); 

  const [showUnmuteBtn, setShowUnmuteBtn] = useState(false);
  const [showActionBtns, setShowActionBtns] = useState(false);

  const [deviceUserAgent, setDeviceUserAgent] = useState(UAS.normal);
  const [webviewKey, setWebviewKey] = useState(Date.now().toString());

  const [hardwareMockScript, setHardwareMockScript] = useState('');

  const [currentUrl, setCurrentUrl] = useState(`https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId || ''}`);
  const [currentChannel, setCurrentChannel] = useState({ name: 'Unknown Channel', isSubscribed: false });

  const subscribeTimerRef = useRef(null);
  const currentChannelNameRef = useRef(''); 
  const shortsWebViewRef = useRef(null);

  const targetUri = initialVideoId || route?.params?.videoId ? `https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId}` : "https://m.youtube.com/shorts";

  // [CRITICAL FIX]: ব্যাক করার সাথে সাথে সম্পর্ক ছিন্ন করার লজিক
  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => {
        // স্ক্রিন থেকে বের হওয়ার সাথে সাথে ভিডিও পজ করে ধ্বংস করা হচ্ছে
        if (shortsWebViewRef.current) {
          shortsWebViewRef.current.injectJavaScript(`
            try {
              var v = document.querySelector('video');
              if(v) { v.pause(); v.removeAttribute('src'); v.load(); }
            } catch(e) {}
            true;
          `);
        }
        setIsActive(false);
        setUaReady(false);
      };
    }, [])
  );

  useEffect(() => {
    if (isFocused && isActive) {
      setUaReady(false); 
      setShortsLoading(true);

      const qualityVal = global.shortVideoQuality || 'Normal Video Quality';

      let newUA = UAS.normal;
      let mockJS = '';

      if (qualityVal === 'Anti Data Saver Mode' || qualityVal === 'Low Video Quality') {
        newUA = qualityVal === 'Anti Data Saver Mode' ? UAS.anti : UAS.low;
        mockJS = `
          Object.defineProperty(navigator, 'connection', { get: function() { return { effectiveType: '2g', saveData: true, downlink: 0.1, rtt: 600 }; } });
          Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 1; } });
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 2; } });
          Object.defineProperty(window, 'devicePixelRatio', { get: function() { return 1; } });
        `;
      } 
      else if (qualityVal === 'High Video Quality 4k-8k') {
        newUA = UAS.high;
        mockJS = `
          Object.defineProperty(navigator, 'connection', { get: function() { return { effectiveType: '4g', saveData: false, downlink: 10.0, rtt: 50 }; } });
          Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 8; } });
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 8; } });
          Object.defineProperty(window, 'devicePixelRatio', { get: function() { return 3; } });
        `;
      } 
      else {
        newUA = UAS.normal;
        mockJS = `
          Object.defineProperty(navigator, 'connection', { get: function() { return { effectiveType: '3g', saveData: false, downlink: 1.5, rtt: 150 }; } });
          Object.defineProperty(window, 'devicePixelRatio', { get: function() { return 2; } });
        `;
      }

      setDeviceUserAgent(newUA);
      setHardwareMockScript(mockJS);
      setWebviewKey(Date.now().toString()); 

      setTimeout(() => setUaReady(true), 100);
    }
  }, [isFocused, isActive]);

  const restartActionTimer = () => {
    setShowActionBtns(false);
    if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    subscribeTimerRef.current = setTimeout(() => {
      setShowActionBtns(true);
    }, 15000); 
  };

  useEffect(() => {
    if (uaReady && isActive) {
      setShowUnmuteBtn(false);
      const timerLoading = setTimeout(() => setShortsLoading(false), 2000);
      const timerUnmute = setTimeout(() => setShowUnmuteBtn(true), 10000); 
      restartActionTimer();
      return () => { 
        clearTimeout(timerLoading); 
        clearTimeout(timerUnmute); 
      };
    }
  }, [uaReady, targetUri, isActive]);

  const handleNativeSubscribe = async () => {
    let channelNameToSave = currentChannel.name;
    if (!channelNameToSave || channelNameToSave === 'Unknown Channel') return; 

    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      let parsedSubs = subs ? JSON.parse(subs) : [];
      const isSubbed = parsedSubs.some(s => s.name === channelNameToSave);

      if (isSubbed) parsedSubs = parsedSubs.filter(s => s.name !== channelNameToSave);
      else parsedSubs.push({ id: Date.now().toString(), name: channelNameToSave, avatar: 'https://via.placeholder.com/150' });

      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs));
      setCurrentChannel(prev => ({ ...prev, isSubscribed: !isSubbed }));
    } catch (e) {}
  };

  const handleShare = async () => {
    try { await Share.share({ message: `Check out this amazing short video: ${currentUrl}` }); } catch (error) {}
  };

  const handleUnmutePress = () => {
    if (shortsWebViewRef.current) {
      shortsWebViewRef.current.injectJavaScript(`
        try {
            var video = document.querySelector('video');
            if(video) { video.muted = false; video.play().catch(function(e){}); }
            var unmuteBtn = document.querySelector('.ytp-unmute, .ytm-unmute, button[aria-label*="unmute"]');
            if (unmuteBtn) { unmuteBtn.click(); }
        } catch(e) {}
        true;
      `);
      setShowUnmuteBtn(false); 
    }
  };

  const shortsInjectScript = `
    (function() {
        try { window.localStorage.clear(); window.sessionStorage.clear(); } catch(e) {}

        try {
            var css = 'ytm-mobile-topbar-renderer, ytm-pivot-bar-renderer, header, .ytm-bottom-sheet { display: none !important; } ' +
                      'ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-like-button-renderer, ' +
                      'ytm-dislike-button-renderer, ytm-comment-button-renderer, ytm-share-button-renderer, ' +
                      'ytm-remix-button-renderer, [aria-label*="Like"], [aria-label*="Comment"], [aria-label*="Share"], ' +
                      '[aria-label*="লাইক"], [aria-label*="কমেন্ট"] ' +
                      '{ display: none !important; opacity: 0 !important; width: 0 !important; height: 0 !important; visibility: hidden !important; pointer-events: none !important; }';
            var head = document.head || document.getElementsByTagName('head')[0];
            var style = document.createElement('style');
            style.type = 'text/css';
            style.appendChild(document.createTextNode(css));
            head.appendChild(style);
        } catch(e) {}

        setInterval(function() {
            try {
                var actionBars = document.querySelectorAll('ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-like-button-renderer');
                for (var i = 0; i < actionBars.length; i++) {
                    if(actionBars[i]) {
                        actionBars[i].style.setProperty('display', 'none', 'important');
                        actionBars[i].style.setProperty('opacity', '0', 'important');
                        actionBars[i].style.setProperty('pointer-events', 'none', 'important');
                        if (actionBars[i].parentElement) actionBars[i].parentElement.style.setProperty('display', 'none', 'important');
                    }
                }

                var skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
                if (skipBtn) skipBtn.click();
                
                var adShowing = document.querySelector('.ad-showing');
                var vidElement = document.querySelector('video');
                if (adShowing && vidElement) vidElement.playbackRate = 16.0;

                var activeReel = document.querySelector('ytm-reel-video-renderer[is-active]');
                if (activeReel && window.ReactNativeWebView) {
                    var linkElem = activeReel.querySelector('a[href^="/@"]');
                    if (linkElem) {
                        var channelName = linkElem.getAttribute('href').split('?')[0].replace('/', '');
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHANNEL_SYNC', name: channelName }));
                    }
                }
            } catch(err) {}
        }, 200); 
    })();
    true;
  `;

  const checkSubscription = async (name) => {
    try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        const parsedSubs = subs ? JSON.parse(subs) : [];
        setCurrentChannel({ name: name, isSubscribed: parsedSubs.some(s => s.name === name) });
    } catch(e){}
  };

  const onShortsMessage = async (event) => {
    const rawData = event.nativeEvent.data;
    if (rawData === "SKIP_START") setIsAutoSkipping(true);
    else if (rawData === "SKIP_END") setIsAutoSkipping(false);
    else {
        try {
          const data = JSON.parse(rawData);
          if (data.type === 'NEW_VIDEO_STARTED') if (data.url) setCurrentUrl(data.url); 
          if (data.type === 'CHANNEL_SYNC' && data.name) {
              if (currentChannelNameRef.current !== data.name) {
                  currentChannelNameRef.current = data.name;
                  checkSubscription(data.name);
              }
          }
        } catch (e) {}
    }
  };

  // [DISCONNECT LOGIC]: যদি স্ক্রিন ফোকাস না থাকে বা ইউজার ব্যাক করে, তবে WebView একদম আনমাউন্ট (Unmount) হয়ে যাবে
  if (!isActive || !isFocused) {
    return <View style={styles.container} />; // পুরোপুরি কালো পর্দা (WebView ধ্বংস)
  }

  if (!uaReady) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#FF0000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        key={webviewKey} 
        ref={shortsWebViewRef} 
        source={{ uri: targetUri }} 
        userAgent={deviceUserAgent} 
        injectedJavaScriptBeforeContentLoaded={hardwareMockScript} 
        injectedJavaScript={shortsInjectScript} 
        onMessage={onShortsMessage} 
        onLoadEnd={() => setShortsLoading(false)} 
        javaScriptEnabled={true} 
        containerStyle={{ flex: 1 }} 
        incognito={true} 
        cacheEnabled={false} 
        cacheMode="LOAD_NO_CACHE"
      />

      {showActionBtns && currentChannel.name !== '' && currentChannel.name !== 'Unknown Channel' && (
        <View style={styles.actionRowContainer} pointerEvents="box-none">
            <TouchableOpacity 
              style={[styles.nativeSubBtn, currentChannel.isSubscribed && styles.nativeSubbedBtn]} 
              onPress={handleNativeSubscribe} activeOpacity={0.8}
            >
              <Text style={[styles.nativeSubText, currentChannel.isSubscribed && styles.nativeSubbedText]}>
                {currentChannel.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.nativeShareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="arrow-redo-outline" size={18} color="#FFF" />
              <Text style={styles.nativeShareText}>Share</Text>
            </TouchableOpacity>
        </View>
      )}

      {showUnmuteBtn && (
        <TouchableOpacity activeOpacity={0.8} style={styles.unmuteBadge} onPress={handleUnmutePress}>
          <Ionicons name="volume-mute" size={18} color="#FFF" />
          <Text style={styles.unmuteText}>Unmute</Text>
        </TouchableOpacity>
      )}

      {isAutoSkipping && (
        <View style={styles.skipOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.skipText}>অ্যাড ফিল্টার হচ্ছে...</Text>
        </View>
      )}

      {shortsLoading && !isAutoSkipping && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  skipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  skipText: { color: '#FFF', marginTop: 15, fontWeight: 'bold' },
  actionRowContainer: { position: 'absolute', bottom: "20%", left: 15, flexDirection: 'row', alignItems: 'center', zIndex: 99999, elevation: 100 },
  nativeSubBtn: { backgroundColor: '#FF0000', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeSubbedBtn: { backgroundColor: '#333', borderColor: '#555' },
  nativeSubText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  nativeSubbedText: { color: '#AAA' },
  nativeShareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 25, marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeShareText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  unmuteBadge: { position: 'absolute', top: 50, right: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 0, 0, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', zIndex: 99999 }
});
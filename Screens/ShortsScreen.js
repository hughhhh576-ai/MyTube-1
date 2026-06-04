import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';

// Theme & Language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

const UAS = {
  anti: "Mozilla/5.0 (Linux; Android 11; LS5018 Build/RP1A.201005.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36",
  low: "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36",
  normal: "Mozilla/5.0 (Linux; Android 10; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
  high: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36"
};

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();

  const [isActive, setIsActive] = useState(true);
  const [isAutoSkipping, setIsAutoSkipping] = useState(false);
  const [shortsLoading, setShortsLoading] = useState(true);
  const [uaReady, setUaReady] = useState(false); 

  // শুধুমাত্র কোনো নির্দিষ্ট ভিডিও লিংক ছাড়া (Directly) ঢুকলেই মিউট আইকন দেখানোর লজিক
  const [showMuteIcon, setShowMuteIcon] = useState(!initialVideoId && !route?.params?.videoId);

  const [showActionBtns, setShowActionBtns] = useState(false);
  const [deviceUserAgent, setDeviceUserAgent] = useState(UAS.normal);
  const [webviewKey, setWebviewKey] = useState(Date.now().toString());
  const [hardwareMockScript, setHardwareMockScript] = useState('');

  const [currentUrl, setCurrentUrl] = useState(`https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId || ''}`);
  const [currentChannel, setCurrentChannel] = useState({ name: 'Unknown Channel', isSubscribed: false });

  // dynamic styles
  const styles = getDynamicStyles(isDarkMode);

  const subscribeTimerRef = useRef(null);
  const currentChannelNameRef = useRef(''); 
  const shortsWebViewRef = useRef(null);

  const targetUri = initialVideoId || route?.params?.videoId ? `https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId}` : "https://m.youtube.com/shorts";

  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      return () => {
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
      setShowMuteIcon(!initialVideoId && !route?.params?.videoId); // নিশ্চিতকরণ

      const qualityVal = global.shortVideoQuality || 'Normal Video Quality';
      let newUA = UAS.normal;
      let mockJS = '';

      if (qualityVal === 'Anti Data Saver Mode' || qualityVal === 'Low Video Quality') {
        newUA = qualityVal === 'Anti Data Saver Mode' ? UAS.anti : UAS.low;
        mockJS = `
          Object.defineProperty(navigator, 'connection', { get: function() { return { effectiveType: '2g', saveData: true, downlink: 0.1, rtt: 600 }; } });
          Object.defineProperty(window, 'devicePixelRatio', { get: function() { return 1; } });
        `;
      } 
      else if (qualityVal === 'High Video Quality 4k-8k') {
        newUA = UAS.high;
        mockJS = `
          Object.defineProperty(navigator, 'connection', { get: function() { return { effectiveType: '4g', saveData: false, downlink: 10.0, rtt: 50 }; } });
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
  }, [isFocused, isActive, initialVideoId, route]);

  const restartActionTimer = () => {
    setShowActionBtns(false);
    if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    subscribeTimerRef.current = setTimeout(() => {
      setShowActionBtns(true);
    }, 15000); 
  };

  useEffect(() => {
    if (uaReady && isActive) {
      const timerLoading = setTimeout(() => setShortsLoading(false), 2000);
      restartActionTimer();
      return () => { clearTimeout(timerLoading); };
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

      try { await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs)); } catch (e) { console.log('AsyncStorage set subscribedChannels error', e); }
      setCurrentChannel(prev => ({ ...prev, isSubscribed: !isSubbed }));
    } catch (e) { console.log('AsyncStorage get subscribedChannels error', e); }
  };

  const handleShare = async () => {
    try { await Share.share({ message: `Check out this amazing short video: ${currentUrl}` }); } catch (error) {}
  };

  const shortsInjectScript = `
    (function() {
        try { window.localStorage.clear(); window.sessionStorage.clear(); } catch(e) {}

        var executeHideProtocol = function() {
            var css = 'ytm-mobile-topbar-renderer, ytm-pivot-bar-renderer, header, .ytm-bottom-sheet { display: none !important; height: 0 !important; opacity: 0 !important; visibility: hidden !important; } ' +
                      'ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-like-button-renderer, ' +
                      'ytm-dislike-button-renderer, ytm-comment-button-renderer, ytm-share-button-renderer, ' +
                      'ytm-remix-button-renderer, [aria-label*="Like"], [aria-label*="Comment"], [aria-label*="Share"], ' +
                      '[aria-label*="লাইক"], [aria-label*="কমেন্ট"], ' +
                      'ytm-reel-player-overlay-main-content, .reel-player-overlay-main-content, ' + 
                      'ytp-ad-module, .ytp-ad-overlay-container, ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer, ad-slot, [id^="ad-"] ' +
                      '{ display: none !important; opacity: 0 !important; width: 0 !important; height: 0 !important; visibility: hidden !important; pointer-events: none !important; z-index: -9999 !important; }';
            
            var head = document.head || document.getElementsByTagName('head')[0];
            var styleNode = document.getElementById('my-tube-adblock-style');
            if (!styleNode) {
                var style = document.createElement('style');
                style.id = 'my-tube-adblock-style';
                style.type = 'text/css';
                style.appendChild(document.createTextNode(css));
                head.appendChild(style);
            }

            var elementsToHide = document.querySelectorAll('ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-reel-player-overlay-main-content, .reel-player-overlay-main-content');
            for (var i = 0; i < elementsToHide.length; i++) {
                if (elementsToHide[i]) {
                    elementsToHide[i].style.display = 'none';
                    elementsToHide[i].style.opacity = '0';
                    elementsToHide[i].innerHTML = ''; 
                }
            }
        };

        executeHideProtocol();

        // ইউজার ইন্টারেকশন ট্র্যাকিং (যেকোনো টাচে মিউট আইকন গায়েব করার জন্য)
        document.addEventListener('touchstart', function() {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'USER_INTERACTION' }));
            }
        }, { passive: true });
        
        document.addEventListener('click', function() {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'USER_INTERACTION' }));
            }
        }, { passive: true });

        var observer = new MutationObserver(function(mutations) {
            executeHideProtocol(); 
            try {
                var skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
                if (skipBtn) skipBtn.click();
                
                var adVideo = document.querySelector('.ad-showing video');
                if (adVideo && adVideo.duration) { adVideo.currentTime = adVideo.duration; }
            } catch(e) {}
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });

        setInterval(function() {
            executeHideProtocol();
            try {
                var activeReel = document.querySelector('ytm-reel-video-renderer[is-active]');
                if (activeReel && window.ReactNativeWebView) {
                    var linkElem = activeReel.querySelector('a[href^="/@"]');
                    if (linkElem) {
                        var channelName = linkElem.getAttribute('href').split('?')[0].replace('/', '');
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHANNEL_SYNC', name: channelName }));
                    }
                }
            } catch(err) {}
        }, 500); 
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
          if (data.type === 'USER_INTERACTION') {
              setShowMuteIcon(false); // যেকোনো টাচ হলে মিউট আইকন গায়েব হয়ে যাবে
          }
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

  if (!isActive || !isFocused) {
    return <View style={styles.container} />; 
  }

  if (!uaReady) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#FF0000" />
      </View>
    );
  }

  return (
    <View 
      style={styles.container}
      onTouchStart={() => setShowMuteIcon(false)} // নেটিভ ভিউ এর উপর টাচ করলেও যেন আইকন গায়েব হয়
    >
      <StatusBar backgroundColor={isDarkMode ? '#0F0F0F' : '#FFFFFF'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <View style={styles.logoContainer}>
           <Ionicons name="logo-youtube" size={28} color="#FF0000" />
           <Text style={styles.logoText}>{__translate('MyTube')}</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: isDarkMode ? '#888' : '#666', fontSize: 14 }}>{t('search') || 'সার্চ...'}</Text>
          <Ionicons name="search" size={18} color={isDarkMode ? '#AAA' : '#555'} />
        </TouchableOpacity>
      </View>

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
      />

      {showMuteIcon && (
        <View style={styles.muteIconContainer} pointerEvents="none">
          <Ionicons name="volume-mute" size={24} color={isDarkMode ? '#FFF' : '#111'} />
        </View>
      )}

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
              <Ionicons name="arrow-redo-outline" size={18} color={isDarkMode ? '#FFF' : '#111'} />
              <Text style={styles.nativeShareText}>{__translate('Share')}</Text>
            </TouchableOpacity>
        </View>
      )}

      {isAutoSkipping && (
        <View style={styles.skipOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.skipText}>{__translate('অ্যাড ফিল্টার হচ্ছে...')}</Text>
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

function getDynamicStyles(isDark) {
  return StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: isDark ? '#000' : '#F9F9F9', 
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 
    },
    header: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      paddingHorizontal: 12, 
      height: 52, 
      borderBottomWidth: 1, 
      borderBottomColor: isDark ? '#222' : '#EAEAEA', 
      width: '100%', 
      backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF' 
    },
    logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
    logoText: { color: isDark ? '#FFF' : '#000', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    searchBar: { flex: 1, flexDirection: 'row', backgroundColor: isDark ? '#222' : '#F0F0F0', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? '#000' : 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    skipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    skipText: { color: isDark ? '#FFF' : '#000', marginTop: 15, fontWeight: 'bold' },
    actionRowContainer: { position: 'absolute', bottom: "20%", left: 15, flexDirection: 'row', alignItems: 'center', zIndex: 99999, elevation: 100 },
    nativeSubBtn: { backgroundColor: '#FF0000', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)' },
    nativeSubbedBtn: { backgroundColor: isDark ? '#333' : '#EEE', borderColor: isDark ? '#555' : '#DDD' },
    nativeSubText: { color: isDark ? '#FFF' : '#000', fontWeight: 'bold', fontSize: 13 },
    nativeSubbedText: { color: isDark ? '#AAA' : '#666' },
    nativeShareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.05)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 25, marginLeft: 10, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)' },
    nativeShareText: { color: isDark ? '#FFF' : '#000', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
    muteIconContainer: {
      position: 'absolute',
      top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 65 : 100, // হেডারের ঠিক নিচে ডান সাইডে
      right: 15,
      backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)',
      padding: 8,
      borderRadius: 20,
      zIndex: 99999,
    }
  });
}
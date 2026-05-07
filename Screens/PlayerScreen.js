import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, BackHandler, Platform } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // AsyncStorage যুক্ত করা হলো

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

global.appSettings = global.appSettings || {};
global.playerBridge = global.playerBridge || { videoId: null, videoData: null, currentTime: 0 };

// কোয়ালিটি স্ট্রিং থেকে সঠিক রেজোলিউশন বের করার ফাংশন
const getNumericQuality = (q) => {
    if (!q) return '720';
    if (q.includes('Auto') || q.includes('Normal')) return '720';
    if (q.includes('75p') || q.includes('Anti') || q.includes('Low')) return '144'; 
    if (q.includes('144p')) return '144';
    if (q.includes('240p')) return '240';
    if (q.includes('360p')) return '360';
    if (q.includes('480p')) return '480';
    if (q.includes('720p')) return '720';
    if (q.includes('1080p')) return '1080';
    if (q.includes('1440p') || q.includes('2K')) return '1440';
    if (q.includes('2160p') || q.includes('4K') || q.toLowerCase().includes('4k')) return '2160';
    if (q.includes('4320p') || q.includes('8K') || q.toLowerCase().includes('8k')) return '4320';
    return '720'; 
};

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};
  
  const [videoUrl, setVideoUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null); 
  const [streamMode, setStreamMode] = useState('combined'); 

  const [loadingUrl, setLoadingUrl] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  
  const [currentQuality, setCurrentQuality] = useState(global.appSettings?.normalVideo || '720p');
  const [actualPlayingQuality, setActualPlayingQuality] = useState('Loading...'); 

  const [captions, setCaptions] = useState([]); 
  const [selectedCC, setSelectedCC] = useState(null);
  const [showCCMenu, setShowCCMenu] = useState(false);

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false); // সাবস্ক্রিপশন স্টেট

  const videoPlayerRef = useRef(null);
  const audioPlayerRef = useRef(new Audio.Sound()); 

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    return () => {
      if (audioPlayerRef.current) audioPlayerRef.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    setVideoUrl(null);
    setAudioUrl(null);
    setLoadingUrl(true);
    setErrorMessage(null);
    setSelectedCC(null);
    setCaptions([]);
    checkSubscriptionStatus(); // সাবস্ক্রিপশন চেক
    if (audioPlayerRef.current) audioPlayerRef.current.unloadAsync();
    
    const initialQuality = global.appSettings?.normalVideo || '720p';
    setCurrentQuality(initialQuality);
    fetchVideoFromLocalServer(initialQuality);
    fetchRelatedVideos(false);
  }, [videoId]);

  // সাবস্ক্রিপশন স্ট্যাটাস চেক করার ফাংশন
  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      const subbed = parsedSubs.some(s => s.name === videoData.channel);
      setIsSubscribed(subbed);
    } catch (e) {}
  };

  // সাবস্ক্রাইব বাটন হ্যান্ডলার
  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      
      if (exists) {
        subs = subs.filter(s => s.name !== videoData.channel);
      } else {
        subs.push({ 
          id: Date.now().toString(), 
          name: videoData.channel, 
          avatar: videoData.avatar 
        });
      }
      
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const savedQuality = global.appSettings?.normalVideo || '720p';
      if (savedQuality !== currentQuality) {
        setCurrentQuality(savedQuality);
        setVideoUrl(null); 
        setAudioUrl(null);
        if (audioPlayerRef.current) audioPlayerRef.current.unloadAsync();
        setLoadingUrl(true);
        setActualPlayingQuality('Switching...');
        fetchVideoFromLocalServer(savedQuality);
      }
    });
    return unsubscribe;
  }, [navigation, currentQuality, videoId]);

  useEffect(() => {
    const backAction = async () => {
      if (videoUrl && videoPlayerRef.current) {
        try {
          const status = await videoPlayerRef.current.getStatusAsync();
          global.playerBridge = {
            videoId: videoId,
            videoData: videoData,
            currentTime: status.positionMillis || 0
          };
          await videoPlayerRef.current.pauseAsync();
        } catch (e) {
          console.log("Error getting status:", e);
        }
      }
      navigation.navigate('Home');
      return true; 
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove(); 
  }, [videoUrl, videoId, videoData]);

  const fetchVideoFromLocalServer = async (qualityStr) => {
    try {
      const numericQuality = getNumericQuality(qualityStr);
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&quality=${numericQuality}&t=${Date.now()}`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.success && data.url) {
        setStreamMode(data.streamType);
        setVideoUrl(data.url);
        
        if(qualityStr.includes('75p') || qualityStr.includes('Anti')) {
             setActualPlayingQuality('Data Saver Mode (Lowest)');
        } else {
             setActualPlayingQuality(data.actualQuality || `${numericQuality}p`);
        }
        
        setCaptions(data.captions || []);

        if (data.streamType === 'separate' && data.audioUrl) {
            setAudioUrl(data.audioUrl);
            await audioPlayerRef.current.loadAsync({ uri: data.audioUrl });
        }
      } else {
        setErrorMessage(data.error || "লিংক বের করতে সমস্যা হয়েছে।");
      }
    } catch (error) {
      setErrorMessage("টারমাক্স সার্ভার কানেক্ট করা যাচ্ছে না।");
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleVideoPlaybackStatusUpdate = async (status) => {
    if (streamMode === 'separate' && audioPlayerRef.current && status.isLoaded) {
        const audioStatus = await audioPlayerRef.current.getStatusAsync();
        if (!audioStatus.isLoaded) return;

        if (status.isPlaying && !audioStatus.isPlaying) {
            await audioPlayerRef.current.playAsync();
        } else if (!status.isPlaying && audioStatus.isPlaying) {
            await audioPlayerRef.current.pauseAsync();
        }

        if (status.isPlaying && Math.abs(status.positionMillis - audioStatus.positionMillis) > 500) {
            await audioPlayerRef.current.setPositionAsync(status.positionMillis);
        }
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      let query = videoData.channel || "trending bangla";
      if (isLoadMore && videoData.title) {
         const words = videoData.title.split(' ');
         query = words.slice(0, 3).join(' ') + " " + Math.floor(Math.random() * 100);
      }
      
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      const htmlText = await response.text();
      const match = htmlText.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match || !match[1]) return;
      
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId && node.videoRenderer.videoId !== videoId) {
            const vid = node.videoRenderer;
            extractedVids.push({ 
              id: vid.videoId, 
              title: vid.title?.runs?.[0]?.text, 
              channel: vid.ownerText?.runs?.[0]?.text || 'Channel', 
              views: vid.viewCountText?.simpleText, 
              thumbnail: `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`,
              avatar: vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      extractNodes(jsonData);
      
      if (isLoadMore) {
          setRelatedVideos(prev => [...prev, ...extractedVids.filter(v => !prev.find(p => p.id === v.id)).slice(0, 10)]);
      } else {
          setRelatedVideos(extractedVids.slice(0, 15));
      }
    } catch (e) {} finally {
      setIsLoadingMore(false);
    }
  };

  const handleCCSelect = (track) => {
    setSelectedCC(track);
    setShowCCMenu(false);
  };

  const AppHeader = () => (
    <View style={styles.appHeader}>
      <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.logoContainer}>
         <Ionicons name="logo-youtube" size={28} color="#FF0000" />
         <Text style={styles.logoText}>MyTube</Text>
      </TouchableOpacity>
      <View style={{flex: 1}} />
      <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerIconBtn}>
        <Ionicons name="search" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <Text style={styles.mainTitle}>{videoData?.title || "Video Title"}</Text>
      <Text style={styles.mainViews}>{videoData?.views || "N/A views"} • {actualPlayingQuality}</Text>
      
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="thumbs-up-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Like</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="download-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Download</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="share-social-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Share</Text></TouchableOpacity>
      </View>
      
      <View style={styles.divider} />
      
      {/* চ্যানেল ইনফো সেকশন - এখানে চাপ দিলে চ্যানেল স্ক্রিনে যাবে */}
      <View style={styles.channelRow}>
        <TouchableOpacity 
          style={styles.channelLeft} 
          onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar })}
        >
          <Image source={{ uri: videoData.avatar }} style={styles.channelAvatar} />
          <View>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>1.2M subscribers</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} 
          onPress={toggleSubscription}
        >
          <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={false} />
      
      <AppHeader />

      <View style={styles.playerWrapper}>
        {loadingUrl ? (
          <View style={{alignItems: 'center'}}>
             <ActivityIndicator size="large" color="#FF0000" />
             <Text style={{color: '#AAA', marginTop: 10, fontSize: 12}}>Loading {currentQuality} Video...</Text>
          </View>
        ) : errorMessage ? (
          <View style={{alignItems: 'center'}}>
            <Ionicons name="alert-circle" size={40} color="#FF4444" />
            <Text style={{color: '#FF4444', textAlign: 'center', marginTop: 10}}>{errorMessage}</Text>
          </View>
        ) : videoUrl ? (
          <Video 
            ref={videoPlayerRef}
            source={{ 
              uri: videoUrl,
              textTracks: selectedCC ? [{ title: selectedCC.label, language: selectedCC.language, type: 'text/vtt', uri: selectedCC.uri }] : []
            }} 
            style={styles.video} 
            useNativeControls 
            resizeMode="contain" 
            shouldPlay 
            isMuted={streamMode === 'separate'} 
            onPlaybackStatusUpdate={handleVideoPlaybackStatusUpdate}
            selectedTextTrack={selectedCC ? { type: "language", value: selectedCC.language } : { type: "disabled" }}
          />
        ) : null}

        {!loadingUrl && captions.length > 0 && (
          <TouchableOpacity style={styles.ccBtn} onPress={() => setShowCCMenu(!showCCMenu)}>
            <Ionicons name="subtitles" size={24} color={selectedCC ? "#3EA6FF" : "#FFF"} />
          </TouchableOpacity>
        )}
      </View>

      {showCCMenu && (
        <View style={styles.ccMenu}>
          <Text style={styles.menuTitle}>Captions / Translation</Text>
          <ScrollView>
            <TouchableOpacity style={styles.menuItem} onPress={() => handleCCSelect(null)}>
              <Text style={{color: !selectedCC ? '#3EA6FF' : '#FFF'}}>Off</Text>
            </TouchableOpacity>
            {captions.map((track, idx) => (
              <TouchableOpacity key={idx} style={styles.menuItem} onPress={() => handleCCSelect(track)}>
                <Text style={{color: selectedCC?.language === track.language ? '#3EA6FF' : '#FFF'}}>{track.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList 
        ListHeaderComponent={renderHeader}
        data={relatedVideos} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        renderItem={({item}) => (
          <TouchableOpacity style={styles.recCard} onPress={() => navigation.push('Player', { videoId: item.id, videoData: item })}>
            <Image source={{ uri: item.thumbnail }} style={styles.recThumb} />
            <View style={styles.recInfo}>
              <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.recMeta}>{item.channel} • {item.views}</Text>
            </View>
          </TouchableOpacity>
        )}
        onEndReached={() => fetchRelatedVideos(true)}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator size="large" color="#FF0000" style={{margin: 20}} /> : null}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F0F' },
    appHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 55, backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#222' },
    logoContainer: { flexDirection: 'row', alignItems: 'center' },
    logoText: { color: '#FFF', fontSize: 19, fontWeight: 'bold', marginLeft: 6, letterSpacing: -0.5 },
    headerIconBtn: { padding: 10 },
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    video: { width: '100%', height: '100%' },
    ccBtn: { position: 'absolute', top: 10, right: 15, zIndex: 20, padding: 5, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
    ccMenu: { position: 'absolute', top: 50, right: 10, width: 200, maxHeight: 250, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, zIndex: 100, elevation: 10, borderWidth: 1, borderColor: '#333' },
    menuTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
    menuItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
    detailsContainer: { padding: 15 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', lineHeight: 24 },
    mainViews: { color: '#AAA', fontSize: 13, marginTop: 5, marginBottom: 15 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
    actionBtn: { alignItems: 'center', backgroundColor: '#222', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
    actionText: { color: '#FFF', fontSize: 12, marginTop: 4 },
    divider: { height: 1, backgroundColor: '#222', marginTop: 15 },
    
    // চ্যানেল ইনফো স্টাইল
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12 },
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    subscribeText: { color: '#000', fontSize: 13, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#222' },
    subscribedText: { color: '#FFF' },

    recCard: { flexDirection: 'row', padding: 10 },
    recThumb: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    recTitle: { color: '#FFF', fontSize: 14, marginBottom: 4 },
    recMeta: { color: '#AAA', fontSize: 11 }
});
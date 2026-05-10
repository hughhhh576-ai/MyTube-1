import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // 2D Side-Sheet Modal States
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState('fetching'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('video'); 

  const [isDownloading, setIsDownloading] = useState(false);
  const [isAudioMode, setIsAudioMode] = useState(videoData?.type === 'audio');

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('maximizeVideo');
      if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync("hidden");
      }
      return () => {
          DeviceEventEmitter.emit('minimizeVideo');
      };
    }, [])
  );

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);

    if (videoId && videoData) {
        DeviceEventEmitter.emit('playVideo', { videoId: videoId, videoData: videoData });
        setIsAudioMode(videoData?.type === 'audio');

        setIsInitialLoading(true);
        const timer = setTimeout(() => {
            setIsInitialLoading(false);
        }, 3000);

        return () => clearTimeout(timer);
    }
  }, [videoId]);

  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      setIsSubscribed(parsedSubs.some(s => s.name === videoData.channel));
    } catch (e) {}
  };

  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      if (exists) subs = subs.filter(s => s.name !== videoData.channel);
      else subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: videoData.avatar });

      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  const handleBackgroundPlay = () => {
    const newMode = !isAudioMode;
    setIsAudioMode(newMode);
    DeviceEventEmitter.emit('toggleAudioMode', newMode);
  };

  const handleDownloadExecute = async (item) => {
    try {
      setShowDownloadModal(false);
      setIsDownloading(true);
      setTimeout(() => setIsDownloading(false), 2000);

      const downloadId = Date.now().toString(); 
      const safeTitle = (videoData.title || 'video').replace(/[<>:"\/\\|?*]+/g, '').trim();
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const dlApiUrl = `${MY_API_SERVER}/api/aria-download?id=${downloadId}&url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(item.quality)}&type=${downloadType}&title=${encodeURIComponent(safeTitle)}`;

      const response = await fetch(dlApiUrl);
      const resJson = await response.json();

      if (resJson.success) {
          // সাইলেন্ট ডাউনলোড
      }
    } catch (error) {
      Alert.alert("সার্ভার এরর", "সার্ভারের সাথে কানেক্ট করা যায়নি।");
    }
  };

  const openDownloadWindow = () => {
      setShowDownloadModal(true);
      setDownloadType('video'); 
      setDownloadStep('fetching');
      fetchDownloadLinks('video');
  };

  const changeDownloadType = (type) => {
      if(downloadType === type) return;
      setDownloadType(type);
      setDownloadStep('fetching');
      fetchDownloadLinks(type);
  };

  const fetchDownloadLinks = async (type) => {
    try {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&action=download&type=${type}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.success && data.availableLinks) {
        setDownloadLinks(data.availableLinks);
        setDownloadStep('list');
      } else {
        Alert.alert("ত্রুটি", "কোনো লিংক পাওয়া যায়নি।");
        setShowDownloadModal(false);
      }
    } catch (error) {
      setShowDownloadModal(false);
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      if (videoData.localUri || videoData.channel === 'Downloaded File') {
        const stored = await AsyncStorage.getItem('recorded_downloads');
        if (stored) {
          const parsed = JSON.parse(stored);
          const offlineVids = parsed
            .filter(item => item.videoId !== videoId && item.isCompleted)
            .map(item => ({
              id: item.videoId, title: item.title, channel: 'Downloaded File',
              views: `অফলাইন • ${item.quality}`, thumbnail: item.thumbnail, localUri: item.localUri, type: item.type
            }));
          setRelatedVideos(offlineVids);
        }
        setIsLoadingMore(false);
        return;
      }
      
      let searchQuery = "trending bangla";
      if (videoData?.title) {
          searchQuery = videoData.title.split(' ').slice(0, 4).join(' ');
      }

      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`);
      const text = await response.text();
      const match = text.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match) return;
      
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId !== videoId) {
            extractedVids.push({ 
              id: node.videoRenderer.videoId, 
              title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text, 
              views: node.videoRenderer.viewCountText?.simpleText || node.videoRenderer.shortViewCountText?.simpleText || '', 
              publishedTime: node.videoRenderer.publishedTimeText?.simpleText || '',
              duration: node.videoRenderer.lengthText?.simpleText || '',
              thumbnail: `https://i.ytimg.com/vi/${node.videoRenderer.videoId}/hqdefault.jpg`,
              avatar: node.videoRenderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      
      extractNodes(jsonData);
      setRelatedVideos(isLoadMore ? [...relatedVideos, ...extractedVids] : extractedVids.slice(0, 15));
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  // লিংকগুলোকে ছোট থেকে বড় আকারে সাজানোর লজিক
  const getSortedLinks = () => {
      if(!downloadLinks) return [];
      return [...downloadLinks].sort((a, b) => {
          const valA = parseInt(a.quality.replace(/[^0-9]/g, '')) || 0;
          const valB = parseInt(b.quality.replace(/[^0-9]/g, '')) || 0;
          return valA - valB; // Ascending order
      });
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <View style={styles.titleRow}>
         <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpandedDesc(!isExpandedDesc)} style={styles.titleTextContainer}>
            <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         </TouchableOpacity>
      </View>
      
      <View style={styles.metaActionRow}>
         <View style={styles.metaLeft}>
             <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
             <Text style={styles.moreText}>...more</Text>
         </View>
         
         <View style={styles.actionRight}>
            {!videoData.localUri && (
              <TouchableOpacity style={styles.iconOnlyBtn} onPress={openDownloadWindow} activeOpacity={0.6}>
                 <Ionicons name="download-outline" size={24} color="#FFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconOnlyBtn} onPress={handleBackgroundPlay} activeOpacity={0.6}>
               <Ionicons name={isAudioMode ? "headset" : "headset-outline"} size={24} color={isAudioMode ? "#00BFA5" : "#FFF"} />
            </TouchableOpacity>
         </View>
      </View>

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar })}>
          <Image source={{ uri: videoData.avatar || 'https://via.placeholder.com/40' }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>{videoData.localUri ? 'Offline Storage' : 'Subscriber Info'}</Text>
          </View>
        </TouchableOpacity>
        {!videoData.localUri && (
          <TouchableOpacity style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} onPress={toggleSubscription}>
            <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} /> 
      
      <View style={styles.header}>
        <View style={styles.logoContainer}>
           <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 10}}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
           </TouchableOpacity>
           <Ionicons name="logo-youtube" size={28} color="#FF0000" />
           <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={styles.playerWrapper}>
          {isInitialLoading && (
              <View style={styles.initialPlayerLoader}>
                  <ActivityIndicator size="large" color="#00BFA5" />
                  <Text style={styles.initialLoaderText}>ভিডিওটি লোড হচ্ছে...</Text>
              </View>
          )}
      </View>
      
      {isInitialLoading ? (
          <View style={styles.fullScreenLoader}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonMeta} />
              <View style={styles.skeletonChannel} />
          </View>
      ) : (
          <FlatList 
            ListHeaderComponent={renderHeader}
            data={relatedVideos} 
            keyExtractor={(item, index) => item.id + index.toString()} 
            renderItem={({item}) => (
              <TouchableOpacity style={styles.recCard} onPress={() => navigation.push('Player', { videoId: item.id, videoData: item })}>
                <View style={styles.thumbWrapper}>
                   <Image source={{ uri: item.thumbnail }} style={styles.recThumb} />
                   {item.duration ? (
                     <View style={styles.durationBadge}>
                       <Text style={styles.durationText}>{item.duration}</Text>
                     </View>
                   ) : null}
                </View>
                <View style={styles.recInfo}>
                  <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.recMeta}>{item.channel}</Text>
                  <Text style={styles.recViewsInfo}>
                     {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            onEndReached={() => { if(!videoData.localUri) fetchRelatedVideos(true); }}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
      )}

      {/* 2D Half-Screen (50% Width) Right-Aligned Modal */}
      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          
          {/* বামদিকের খালি অংশ - এখানে ক্লিক করলে মডাল কেটে যাবে */}
          <TouchableOpacity 
              style={styles.modalBackdrop} 
              activeOpacity={1} 
              onPress={() => setShowDownloadModal(false)} 
          />
          
          {/* ডানদিকের অর্ধেক স্কিনের প্যানেল */}
          <View style={styles.modalContent}>
            
            <View style={styles.modalDragIndicator} />
            
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>ডাউনলোড</Text>
                <Text style={styles.modalSubtitle}>ছোট থেকে বড়</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDownloadModal(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Video/Audio Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tabButton, downloadType === 'video' && styles.activeTabButton]} 
                    onPress={() => changeDownloadType('video')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="videocam" size={16} color={downloadType === 'video' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'video' && styles.activeTabText]}>Video</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.tabButton, downloadType === 'audio' && styles.activeTabButton]} 
                    onPress={() => changeDownloadType('audio')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="musical-notes" size={16} color={downloadType === 'audio' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'audio' && styles.activeTabText]}>Audio</Text>
                </TouchableOpacity>
            </View>
            
            {/* List Content */}
            {downloadStep === 'fetching' ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00BFA5" />
                <Text style={styles.loadingText}>লিঙ্ক তৈরি হচ্ছে...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.qualityListContainer}>
                {getSortedLinks().map((item, index) => (
                  <TouchableOpacity key={index} style={styles.qualityCard} activeOpacity={0.7} onPress={() => handleDownloadExecute(item)}>
                    <View style={styles.qualityInfoLeft}>
                      <View style={styles.qualityIconBg}>
                          <Ionicons name={downloadType === 'audio' ? "headset" : "videocam"} size={18} color="#00BFA5" />
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.qualityText}>{item.quality}</Text>
                        <Text style={styles.qualitySubText}>{item.size || (downloadType === 'video' ? 'MP4' : 'MP3')}</Text>
                      </View>
                    </View>
                    <View style={styles.downloadIconBtn}>
                        <Ionicons name="download-outline" size={18} color="#00BFA5" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F0F' },
    logoContainer: { flexDirection: 'row', alignItems: 'center', width: 130 },
    logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', height: 38 },
    
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    initialPlayerLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    initialLoaderText: { color: '#00BFA5', marginTop: 10, fontSize: 14, fontWeight: '500' },

    fullScreenLoader: { padding: 15 },
    skeletonTitle: { height: 20, backgroundColor: '#1A1A1A', width: '90%', borderRadius: 4, marginBottom: 10 },
    skeletonMeta: { height: 12, backgroundColor: '#1A1A1A', width: '60%', borderRadius: 4, marginBottom: 20 },
    skeletonChannel: { height: 40, backgroundColor: '#1A1A1A', width: '100%', borderRadius: 8 },

    detailsContainer: { padding: 12, backgroundColor: '#0F0F0F' },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    titleTextContainer: { flex: 1 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    
    metaActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 15 },
    metaLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    mainViews: { color: '#AAA', fontSize: 12 },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
    
    actionRight: { flexDirection: 'row', alignItems: 'center' },
    iconOnlyBtn: { padding: 8, marginLeft: 15 }, 
    
    divider: { height: 1, backgroundColor: '#222', marginVertical: 10 },
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelTextCol: { flex: 1 },
    channelName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12 },
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    subscribeText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#222' },
    subscribedText: { color: '#FFF' },
    
    recCard: { flexDirection: 'row', padding: 10, backgroundColor: '#0F0F0F' },
    thumbWrapper: { position: 'relative' },
    recThumb: { width: 150, height: 85, borderRadius: 10, backgroundColor: '#222' },
    durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    durationText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'flex-start', paddingTop: 2 },
    recTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', lineHeight: 20 },
    recMeta: { color: '#AAA', fontSize: 12, marginTop: 4 },
    recViewsInfo: { color: '#888', fontSize: 11, marginTop: 2 },
    
    // ==========================================
    // 2D Half-Screen Modal Styles
    // ==========================================
    modalOverlay: { 
        flex: 1, 
        flexDirection: 'row', 
        justifyContent: 'flex-end', // ডানদিকে অ্যালাইন করা
        alignItems: 'flex-end'      // নিচে অ্যালাইন করা
    },
    modalBackdrop: { 
        ...StyleSheet.absoluteFillObject, 
        backgroundColor: 'rgba(0,0,0,0.4)' // ট্রান্সপারেন্ট ব্ল্যাক, পেছনের অ্যাপ দেখা যাবে
    },
    modalContent: { 
        width: '50%', // স্ক্রিনের ঠিক অর্ধেক সাইজ
        backgroundColor: '#1E1E1E', 
        borderTopLeftRadius: 25, 
        borderTopRightRadius: 0, // ডানদিকে কোনো রাউন্ড থাকবে না, কারণ এটি সাইডে লাগানো
        paddingHorizontal: 12, 
        paddingTop: 10, 
        paddingBottom: Platform.OS === 'ios' ? 40 : 20, 
        maxHeight: height * 0.75,
        minHeight: 350,
        elevation: 15,
        shadowColor: '#000',
        shadowOffset: { width: -5, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        zIndex: 10
    },
    modalDragIndicator: { width: 35, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 15 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    modalTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }, // সাইজ কমানো হয়েছে
    modalSubtitle: { color: '#888', fontSize: 10, marginTop: 3 }, // সাইজ কমানো হয়েছে
    modalCloseBtn: { padding: 6, backgroundColor: '#2A2A2A', borderRadius: 15, marginLeft: 5 },
    
    tabContainer: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 10, padding: 3, marginBottom: 15 },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
    activeTabButton: { backgroundColor: '#2A2A2A' },
    tabText: { color: '#888', fontSize: 12, fontWeight: 'bold', marginLeft: 6 }, // সাইজ কমানো হয়েছে
    activeTabText: { color: '#FFF' },

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#AAA', marginTop: 12, fontSize: 13 },
    
    qualityListContainer: { paddingBottom: 10 },
    qualityCard: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        backgroundColor: '#282828', padding: 10, borderRadius: 12, marginBottom: 10, 
        borderWidth: 1, borderColor: '#383838' 
    },
    qualityInfoLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    qualityIconBg: { backgroundColor: 'rgba(0, 191, 165, 0.1)', padding: 8, borderRadius: 10 },
    qualityText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' }, // সাইজ কমানো হয়েছে
    qualitySubText: { color: '#888', fontSize: 10, marginTop: 2 }, // সাইজ কমানো হয়েছে
    downloadIconBtn: { padding: 5 }
});
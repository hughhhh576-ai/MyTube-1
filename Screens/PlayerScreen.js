import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState('selection'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [isAudioMode, setIsAudioMode] = useState(videoData?.type === 'audio');

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('maximizeVideo');
      return () => DeviceEventEmitter.emit('minimizeVideo');
    }, [])
  );

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);
    if (videoId && videoData) {
        DeviceEventEmitter.emit('playVideo', { videoId: videoId, videoData: videoData });
        setIsAudioMode(videoData?.type === 'audio');
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
      // [FIXED]: অরিজিনাল নাম ঠিক রাখার জন্য লজিক আপডেট করা হয়েছে (স্পেস এবং বাংলা ঠিক থাকবে)
      const safeTitle = (videoData.title || 'video').replace(/[<>:"\/\\|?*]+/g, '').trim();
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const dlApiUrl = `${MY_API_SERVER}/api/aria-download?id=${downloadId}&url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(item.quality)}&type=${downloadType}&title=${encodeURIComponent(safeTitle)}`;

      const response = await fetch(dlApiUrl);
      const resJson = await response.json();

      if (resJson.success) {
          Alert.alert("ডাউনলোড শুরু হয়েছে", "ফাইলটি সার্ভারের মাধ্যমে সেভ হচ্ছে।");
      }
    } catch (error) {
      Alert.alert("সার্ভার এরর", "সার্ভারের সাথে কানেক্ট করা যায়নি।");
    }
  };

  const handleDownloadInit = (type) => {
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
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(videoData.channel || "trending bangla")}`);
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
              id: node.videoRenderer.videoId, title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text, views: node.videoRenderer.viewCountText?.simpleText, 
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

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <View style={styles.titleRow}>
         <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpandedDesc(!isExpandedDesc)} style={styles.titleTextContainer}>
            <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         </TouchableOpacity>
         <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionIconBtn, isAudioMode ? {backgroundColor: '#00BFA5'} : {}]} onPress={handleBackgroundPlay}>
               <Ionicons name="headset-outline" size={24} color={isAudioMode ? "#000" : "#00BFA5"} />
            </TouchableOpacity>
            {!videoData.localUri && (
              <TouchableOpacity style={[styles.actionIconBtn, {marginLeft: 10}]} onPress={() => { setShowDownloadModal(true); setDownloadStep('selection'); }}>
                 <Ionicons name="download-outline" size={24} color="#FFF" />
              </TouchableOpacity>
            )}
         </View>
      </View>
      <View style={styles.metaRow}>
         <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
         <Text style={styles.moreText}>...more</Text>
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
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      <View style={styles.appHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
           <Ionicons name="chevron-down" size={32} color="#FFF" />
        </TouchableOpacity>
        <View style={{flex: 1}} />
        <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerIconBtn}>
           <Ionicons name="search" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.playerWrapper}></View>
      {isDownloading && (
        <View style={styles.toastContainer}><Text style={styles.toastText}>প্রক্রিয়া শুরু হচ্ছে...</Text></View>
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
            {item.localUri && (
              <View style={styles.offlineTypeIndicator}>
                <Ionicons name={item.type === 'audio' ? "musical-notes" : "videocam"} size={14} color="#00BFA5" />
              </View>
            )}
          </TouchableOpacity>
        )}
        onEndReached={() => { if(!videoData.localUri) fetchRelatedVideos(true); }}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>ফাইল ডাউনলোড</Text>
                <Text style={styles.modalSubtitle}>যেকোনো একটি ফরম্যাট বেছে নিন</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDownloadModal(false)}>
                <Ionicons name="close" size={24} color="#AAA" />
              </TouchableOpacity>
            </View>
            {downloadStep === 'selection' && (
              <View style={styles.selectionRow}>
                <TouchableOpacity style={styles.selectCard} activeOpacity={0.8} onPress={() => handleDownloadInit('video')}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 68, 68, 0.15)' }]}>
                    <Ionicons name="videocam" size={36} color="#FF4444" />
                  </View>
                  <Text style={styles.selectCardTitle}>ভিডিও</Text>
                  <Text style={styles.selectCardSub}>HD কোয়ালিটি</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectCard} activeOpacity={0.8} onPress={() => handleDownloadInit('audio')}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 191, 165, 0.15)' }]}>
                    <Ionicons name="musical-notes" size={36} color="#00BFA5" />
                  </View>
                  <Text style={styles.selectCardTitle}>অডিও</Text>
                  <Text style={styles.selectCardSub}>MP3 ফরম্যাট</Text>
                </TouchableOpacity>
              </View>
            )}
            {downloadStep === 'fetching' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={downloadType === 'audio' ? '#00BFA5' : '#FF4444'} />
                <Text style={styles.loadingText}>সার্ভার থেকে লিংক তৈরি হচ্ছে...</Text>
              </View>
            )}
            {downloadStep === 'list' && (
              <View style={{ flex: 1, marginTop: 10 }}>
                <Text style={styles.listHeaderTitle}>{downloadType === 'audio' ? 'অডিও কোয়ালিটি' : 'ভিডিও কোয়ালিটি'}</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.qualityListContainer}>
                  {downloadLinks.map((item, index) => (
                    <TouchableOpacity key={index} style={styles.qualityCard} activeOpacity={0.7} onPress={() => handleDownloadExecute(item)}>
                      <View style={styles.qualityInfoLeft}>
                        <Ionicons name={downloadType === 'audio' ? "musical-note" : "videocam-outline"} size={22} color={downloadType === 'audio' ? '#00BFA5' : '#FFF'} />
                        <View style={{ marginLeft: 15 }}>
                          <Text style={styles.qualityText}>{item.quality}</Text>
                          <Text style={styles.qualitySubText}>{downloadType === 'audio' ? 'High Quality Audio' : 'MP4 Format'}</Text>
                        </View>
                      </View>
                      <View style={styles.downloadIconWrapper}><Ionicons name="cloud-download" size={20} color="#00BFA5" /></View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F0F' },
    appHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 50 },
    headerIconBtn: { padding: 10 },
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: 'transparent' },
    toastContainer: { backgroundColor: '#00BFA5', padding: 10, alignItems: 'center', justifyContent: 'center' },
    toastText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
    detailsContainer: { padding: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    titleTextContainer: { flex: 1, paddingRight: 10 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    actionRow: { flexDirection: 'row', alignItems: 'center' },
    actionIconBtn: { padding: 8, backgroundColor: '#272727', borderRadius: 20 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 15 },
    mainViews: { color: '#AAA', fontSize: 12 },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
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
    recCard: { flexDirection: 'row', padding: 10, position: 'relative' },
    recThumb: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    recTitle: { color: '#FFF', fontSize: 14 },
    recMeta: { color: '#AAA', fontSize: 11, marginTop: 4 },
    offlineTypeIndicator: { position: 'absolute', bottom: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', padding: 4, borderRadius: 12 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, maxHeight: height * 0.7, minHeight: 350 },
    modalDragIndicator: { width: 40, height: 5, backgroundColor: '#444', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
    modalSubtitle: { color: '#888', fontSize: 13, marginTop: 3 },
    modalCloseBtn: { padding: 6, backgroundColor: '#2A2A2A', borderRadius: 20 },
    selectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
    selectCard: { backgroundColor: '#242424', borderRadius: 16, width: '47%', alignItems: 'center', paddingVertical: 30, borderWidth: 1, borderColor: '#333' },
    iconContainer: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    selectCardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    selectCardSub: { color: '#888', fontSize: 12, marginTop: 5 },
    loadingContainer: { paddingVertical: 50, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#AAA', marginTop: 20, fontSize: 15 },
    listHeaderTitle: { color: '#AAA', fontSize: 14, fontWeight: 'bold', marginBottom: 15, marginLeft: 5 },
    qualityListContainer: { paddingBottom: 20 },
    qualityCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#242424', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
    qualityInfoLeft: { flexDirection: 'row', alignItems: 'center' },
    qualityText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    qualitySubText: { color: '#888', fontSize: 12, marginTop: 2 },
    downloadIconWrapper: { backgroundColor: 'rgba(0, 191, 165, 0.1)', padding: 8, borderRadius: 12 }
});
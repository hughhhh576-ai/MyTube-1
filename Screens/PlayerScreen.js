import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import { WebView } from 'react-native-webview'; 

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Modals States
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showDescModal, setShowDescModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);

  // Download States
  const [downloadStep, setDownloadStep] = useState('fetching'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('video'); 
  const [isDownloading, setIsDownloading] = useState(false);

  // Live Description & Comments States
  const [description, setDescription] = useState('');
  const [isDescLoading, setIsDescLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  
  // 🚨 [NEW]: কমেন্ট বাটনে চাপলে তবেই এটি true হবে এবং ওয়েবসাইট লোড হবে 🚨
  const [loadCommentWebView, setLoadCommentWebView] = useState(false);

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
        
        // ডাটা রিসেট
        setDescription('');
        setComments([]);
        setIsCommentsLoading(false);
        setLoadCommentWebView(false); // 🚨 নতুন ভিডিও আসলে ওয়েবভিউ পুরোপুরি বন্ধ থাকবে

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

  const handleLinkPress = (url) => {
      setShowDescModal(false); 
      
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
          navigation.navigate('searchsettings', { initialSearch: url });
      } else {
          Linking.openURL(url).catch(err => console.error("URL খুলতে সমস্যা হচ্ছে", err));
      }
  };

  const renderDescriptionWithLinks = (text) => {
      if (!text) return null;
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = text.split(urlRegex);

      return parts.map((part, index) => {
          if (part.match(urlRegex)) {
              return (
                  <Text key={index} style={styles.clickableLink} onPress={() => handleLinkPress(part)}>
                      {part}
                  </Text>
              );
          }
          return <Text key={index} style={styles.descText}>{part}</Text>;
      });
  };

  const loadDescription = async () => {
      setShowDescModal(true);
      if (description) return; 
      
      setIsDescLoading(true);
      try {
          const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
          const text = await response.text();
          const match = text.match(/"shortDescription":"(.*?)"/);
          
          if (match && match[1]) {
              let cleanDesc = match[1].replace(/\\n/g, '\n').replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              setDescription(cleanDesc);
          } else {
              setDescription("এই ভিডিওতে কোনো ডিসক্রিপশন দেওয়া হয়নি।");
          }
      } catch (error) {
          setDescription("ইন্টারনেট সমস্যা! ডিসক্রিপশন লোড করা যায়নি।");
      }
      setIsDescLoading(false);
  };

  // 🚨 [MODIFIED]: কমেন্ট বাটনে চাপ দিলেই শুধুমাত্র ওয়েবভিউ লোড হবে 🚨
  const loadComments = () => {
      setShowCommentModal(true);
      if (comments.length === 0 && !loadCommentWebView) {
          setIsCommentsLoading(true);
          setLoadCommentWebView(true); // ওয়েবসাইট লোডিং শুরু হলো
      }
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

      await fetch(dlApiUrl);
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

  const getSortedLinks = () => {
      if(!downloadLinks) return [];
      return [...downloadLinks].sort((a, b) => {
          const valA = parseInt(a.quality.replace(/[^0-9]/g, '')) || 0;
          const valB = parseInt(b.quality.replace(/[^0-9]/g, '')) || 0;
          return valA - valB; 
      });
  };

  const safeAvatar = (videoData?.avatar && videoData.avatar.trim() !== '') 
      ? (videoData.avatar.startsWith('//') ? `https:${videoData.avatar}` : videoData.avatar) 
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(videoData?.channel || 'YT')}&background=random&color=fff&size=100`;

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <Text style={styles.mainTitle}>{videoData?.title}</Text>
      <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRowContainer}>
          <TouchableOpacity style={styles.actionPill} onPress={loadDescription}>
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.actionPillText}>ডিসক্রিপশন</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={loadComments}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFF" />
              <Text style={styles.actionPillText}>কমেন্ট</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionPill, isAudioMode && {backgroundColor: '#00BFA5', borderColor: '#00BFA5'}]} onPress={handleBackgroundPlay}>
              <Ionicons name={isAudioMode ? "headset" : "headset-outline"} size={18} color="#FFF" />
              <Text style={styles.actionPillText}>অডিও</Text>
          </TouchableOpacity>

          {!videoData.localUri && (
              <TouchableOpacity style={styles.actionPill} onPress={openDownloadWindow}>
                  <Ionicons name="download-outline" size={18} color="#FFF" />
                  <Text style={styles.actionPillText}>ডাউনলোড</Text>
              </TouchableOpacity>
          )}
      </ScrollView>

      <View style={styles.divider} />

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: safeAvatar })}>
          <Image source={{ uri: safeAvatar }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>{videoData.localUri ? 'Offline Storage' : 'YouTube Channel'}</Text>
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

  const handleWebViewMessage = (event) => {
      try {
          const parsed = JSON.parse(event.nativeEvent.data);
          if (parsed.type === 'comments') {
              if (parsed.data && parsed.data.length > 0) {
                  setComments(parsed.data);
              }
              setIsCommentsLoading(false);
          }
      } catch (e) {}
  };

  // 🚨 [MODIFIED]: ডাটা বাঁচানোর জন্য ভিডিও প্লেয়ার ধ্বংস করার স্ক্রিপ্ট যুক্ত করা হয়েছে 🚨
  const INJECTED_JS = `
    try {
        // ভিডিও প্লেয়ারকে পুরোপুরি ধ্বংস করে দেওয়া হচ্ছে যাতে ডাটা না কাটে
        var stopVideo = function() {
            var v = document.querySelector('video');
            if(v) { 
                v.pause(); 
                v.removeAttribute('src'); 
                v.load(); 
            }
        };
        stopVideo();
        setInterval(stopVideo, 500);

        var attempt = 0;
        var scrapeInterval = setInterval(function() {
            window.scrollTo(0, Math.max(document.body.scrollHeight, 2000) + (attempt * 500));
            var nodes = document.querySelectorAll('ytd-comment-thread-renderer');
            if(nodes.length > 0) {
                clearInterval(scrapeInterval);
                var results = [];
                nodes.forEach(function(el, i) {
                    if(i < 30) {
                        var author = el.querySelector('#author-text') ? el.querySelector('#author-text').innerText.trim() : 'User';
                        var text = el.querySelector('#content-text') ? el.querySelector('#content-text').innerText.trim() : '';
                        var avatarImg = el.querySelector('#author-thumbnail img');
                        var avatar = avatarImg ? avatarImg.src : '';
                        if(text) results.push({ id: String(i), author: author, text: text, avatar: avatar });
                    }
                });
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'comments', data: results }));
            } else if (attempt > 15) {
                clearInterval(scrapeInterval);
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'comments', data: [] }));
            }
            attempt++;
        }, 2000);
    } catch(e) {}
    true;
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} /> 
      
      {/* 🚨 [MODIFIED]: loadCommentWebView True হলে তবেই এই ওয়েবসাইটটি লোড হবে 🚨 */}
      {loadCommentWebView && videoId && !videoData.localUri && (
          <View style={{ width: 0, height: 0, opacity: 0, overflow: 'hidden' }}>
              <WebView
                  source={{ uri: `https://www.youtube.com/watch?v=${videoId}` }}
                  userAgent={DESKTOP_AGENT}
                  mediaPlaybackRequiresUserAction={true}
                  injectedJavaScript={INJECTED_JS}
                  onMessage={handleWebViewMessage}
                  javaScriptEnabled={true}
              />
          </View>
      )}

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

      {/* 1. ডিসক্রিপশন Modal */}
      <Modal visible={showDescModal} transparent animationType="slide" onRequestClose={() => setShowDescModal(false)}>
        <View style={styles.bottomSheetOverlayFull}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDescModal(false)} />
          <View style={styles.bottomSheetContentFull}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ডিসক্রিপশন</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDescModal(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                <Text style={styles.descTitle}>{videoData?.title}</Text>
                <View style={styles.descMetaRow}>
                    <Text style={styles.descMetaText}>{videoData?.views}</Text>
                    <Text style={styles.descMetaText}>{videoData?.publishedTime}</Text>
                </View>
                <View style={styles.divider} />
                
                {isDescLoading ? (
                    <View style={{paddingVertical: 40, alignItems: 'center'}}>
                        <ActivityIndicator size="large" color="#00BFA5" />
                        <Text style={{color: '#AAA', marginTop: 15}}>ডিসক্রিপশন লোড হচ্ছে...</Text>
                    </View>
                ) : (
                    <Text style={styles.descText}>
                        {renderDescriptionWithLinks(description)}
                    </Text>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. কমেন্টস Modal */}
      <Modal visible={showCommentModal} transparent animationType="slide" onRequestClose={() => setShowCommentModal(false)}>
        <View style={styles.bottomSheetOverlayFull}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCommentModal(false)} />
          <View style={styles.bottomSheetContentFull}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>কমেন্টস</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, marginTop: 5 }}>
                {isCommentsLoading ? (
                    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50}}>
                        <ActivityIndicator size="large" color="#00BFA5" />
                        <Text style={{color: '#AAA', marginTop: 15}}>কমেন্ট লোড হচ্ছে...</Text>
                    </View>
                ) : comments.length > 0 ? (
                    <FlatList 
                        data={comments}
                        keyExtractor={(item, idx) => item.id + idx.toString()}
                        showsVerticalScrollIndicator={false}
                        renderItem={({item}) => (
                            <View style={styles.commentItem}>
                                <Image source={{uri: item.avatar}} style={styles.commentAvatar} />
                                <View style={styles.commentTextCol}>
                                    <Text style={styles.commentAuthor}>{item.author}</Text>
                                    <Text style={styles.commentText}>{item.text}</Text>
                                </View>
                            </View>
                        )}
                    />
                ) : (
                    <View style={styles.commentPlaceholder}>
                        <Ionicons name="chatbubble-ellipses-outline" size={60} color="#444" />
                        <Text style={styles.commentPlaceholderText}>কোনো কমেন্ট পাওয়া যায়নি</Text>
                    </View>
                )}
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Download Modal */}
      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDownloadModal(false)} />
          <View style={styles.modalContent}>
            
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDownloadModal(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabButton, downloadType === 'video' && styles.activeTabButton]} onPress={() => changeDownloadType('video')} activeOpacity={0.8}>
                    <Ionicons name="videocam" size={16} color={downloadType === 'video' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'video' && styles.activeTabText]}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, downloadType === 'audio' && styles.activeTabButton]} onPress={() => changeDownloadType('audio')} activeOpacity={0.8}>
                    <Ionicons name="musical-notes" size={16} color={downloadType === 'audio' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'audio' && styles.activeTabText]}>Audio</Text>
                </TouchableOpacity>
            </View>
            
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

    detailsContainer: { padding: 15, backgroundColor: '#0F0F0F' },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
    mainViews: { color: '#AAA', fontSize: 13, marginBottom: 15 },
    
    actionRowContainer: { flexDirection: 'row', alignItems: 'center', paddingBottom: 5 },
    actionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#262626', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#333' },
    actionPillText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginLeft: 6 },
    
    divider: { height: 1, backgroundColor: '#222', marginVertical: 15 },
    
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#333' },
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
    
    bottomSheetOverlayFull: { flex: 1, justifyContent: 'flex-end' },
    bottomSheetContentFull: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 40 : 20, maxHeight: height * 0.75, minHeight: 400, elevation: 15, shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.3, shadowRadius: 10, zIndex: 10 },
    
    descTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    descMetaRow: { flexDirection: 'row', marginBottom: 10 },
    descMetaText: { color: '#AAA', fontSize: 13, marginRight: 15, fontWeight: 'bold' },
    descText: { color: '#CCC', fontSize: 14, lineHeight: 22 },
    clickableLink: { color: '#00BFA5', textDecorationLine: 'underline', fontWeight: 'bold' },

    commentItem: { flexDirection: 'row', marginBottom: 18, paddingHorizontal: 5 },
    commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
    commentTextCol: { flex: 1 },
    commentAuthor: { color: '#AAA', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
    commentText: { color: '#FFF', fontSize: 14, lineHeight: 20 },
    commentPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 30 },
    commentPlaceholderText: { color: '#AAA', fontSize: 16, marginTop: 15 },

    modalOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { width: '50%', backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 0, paddingHorizontal: 12, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 40 : 20, maxHeight: height * 0.75, minHeight: 350, elevation: 15, shadowColor: '#000', shadowOffset: { width: -5, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, zIndex: 10 },
    modalDragIndicator: { width: 35, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 15 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    modalCloseBtn: { padding: 6, backgroundColor: '#2A2A2A', borderRadius: 15, marginLeft: 5 },
    
    tabContainer: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 10, padding: 3, marginBottom: 15 },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
    activeTabButton: { backgroundColor: '#2A2A2A' },
    tabText: { color: '#888', fontSize: 12, fontWeight: 'bold', marginLeft: 6 }, 
    activeTabText: { color: '#FFF' },

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#AAA', marginTop: 12, fontSize: 13 },
    
    qualityListContainer: { paddingBottom: 10 },
    qualityCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#282828', padding: 10, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#383838' },
    qualityInfoLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    qualityIconBg: { backgroundColor: 'rgba(0, 191, 165, 0.1)', padding: 8, borderRadius: 10 },
    qualityText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' }, 
    qualitySubText: { color: '#888', fontSize: 10, marginTop: 2 }, 
    downloadIconBtn: { padding: 5 }
});
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import * as Clipboard from 'expo-clipboard'; // 🎯 লিংক কপি করার জন্য এক্সপো ক্লিপবোর্ড ইম্পোর্ট

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

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

  // Live Data States (Server Fetched)
  const [liveAvatar, setLiveAvatar] = useState(null);
  const [description, setDescription] = useState('');
  const [isLinkLoading, setIsLinkLoading] = useState(false); 
  
  // Comments States
  const [comments, setComments] = useState([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [commentNextToken, setCommentNextToken] = useState(null);
  const [isMoreCommentsLoading, setIsMoreCommentsLoading] = useState(false);
  const [commentReplies, setCommentReplies] = useState({}); 
  const [loadingReplyId, setLoadingReplyId] = useState(null);

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

        setLiveAvatar(null);
        setDescription('');
        setComments([]);
        setCommentReplies({});
        setCommentNextToken(null);

        fetch(`${MY_API_SERVER}/api/video-details?videoId=${videoId}`)
            .then(res => res.json())
            .then(data => {
                if(data.success) {
                    if(data.avatar) setLiveAvatar(data.avatar);
                    if(data.description) setDescription(data.description);
                }
            }).catch(err => console.log(err));

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
      else subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: displayAvatar });

      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  const handleBackgroundPlay = () => {
    const newMode = !isAudioMode;
    setIsAudioMode(newMode);
    DeviceEventEmitter.emit('toggleAudioMode', newMode);
  };

  // 🎯 🚀 [UPDATED]: লিংক প্রেস হ্যান্ডলার (ভিডিও ও চ্যানেল হ্যান্ডলিং ফিক্স)
  const handleLinkPress = async (url) => {
      const cleanUrl = url.replace(/\s/g, ''); 
      const videoIdMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/|watch\s*\?v=))([^&?\s]{11})/);

      // ১. ভিডিও লিংক রেন্ডারার
      if (videoIdMatch && videoIdMatch[1]) {
          setShowDescModal(false); 
          setIsLinkLoading(true); 
          
          try {
              const response = await fetch(`${MY_API_SERVER}/api/resolve-url?url=${encodeURIComponent(cleanUrl)}`);
              const data = await response.json();
              setIsLinkLoading(false);
              if (data.success && data.videoData) {
                  navigation.push('Player', { videoId: data.videoData.id, videoData: data.videoData });
              } else {
                  navigation.navigate('searchsettings', { initialSearch: videoIdMatch[1] });
              }
          } catch (e) {
              setIsLinkLoading(false);
              navigation.navigate('searchsettings', { initialSearch: videoIdMatch[1] });
          }
          return;
      }

      // ২. 🎯 চ্যানেল ইউআরএল ফিল্টার (@username, /channel/, /c/, /user/)
      const channelMatch = cleanUrl.match(/(?:youtube\.com\/(?:@|channel\/|c\/|user\/))([^\s/?#]+)/);
      if (channelMatch) {
          setShowDescModal(false);
          const chName = channelMatch[1];
          // ব্রাউজারে না পাঠিয়ে সরাসরি অ্যাপের নেটিভ চ্যানেল স্ক্রিনে ওপেন হবে
          navigation.navigate('Channel', { 
              channelName: chName, 
              channelAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(chName)}&background=random&color=fff&size=100`,
              channelUrl: `/${chName}`
          });
          return;
      }

      // ৩. সাধারণ এক্সটার্নাল লিংক
      Linking.openURL(cleanUrl).catch(err => console.error(err));
  };

  // 🎯 [NEW]: লিংক লং-প্রেস কপি করার হ্যান্ডলার
  const handleLinkLongPress = async (url) => {
      const cleanUrl = url.replace(/\s/g, '');
      await Clipboard.setStringAsync(cleanUrl);
      Alert.alert("Success", "Link copied to clipboard!");
  };

  const renderDescriptionWithLinks = (text) => {
      if (!text) return null;
      const urlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^\s]*\s*\?v=[^\s]+|https?:\/\/[^\s]+)/g;
      const parts = text.split(urlRegex);

      return parts.map((part, index) => {
          if (part.match(urlRegex)) {
              return (
                  // 🎯 ক্লিকেবল এবং লং-প্রেস কপি অপশন দুটোই যুক্ত করা হলো
                  <Text 
                    key={index} 
                    style={styles.clickableLink} 
                    onPress={() => handleLinkPress(part)}
                    onLongPress={() => handleLinkLongPress(part)}
                  >
                      {part.replace(/\s/g, '')}
                  </Text>
              );
          }
          return <Text key={index} style={styles.descText}>{part}</Text>;
      });
  };

  const loadDescription = () => setShowDescModal(true); 

  const loadComments = async () => {
      setShowCommentModal(true);
      if (comments.length > 0) return;
      setIsCommentsLoading(true);
      try {
          const response = await fetch(`${MY_API_SERVER}/api/comments?videoId=${videoId}`);
          const data = await response.json();
          if (data.success && data.comments) {
              setComments(data.comments);
              setCommentNextToken(data.nextContinuationToken || null);
          }
      } catch (error) { setComments([]); }
      setIsCommentsLoading(false);
  };

  const loadMoreComments = async () => {
      if (!commentNextToken || isMoreCommentsLoading) return;
      setIsMoreCommentsLoading(true);
      try {
          const response = await fetch(`${MY_API_SERVER}/api/comments?continuation=${encodeURIComponent(commentNextToken)}`);
          const data = await response.json();
          if (data.success && data.comments) {
              setComments(prev => [...prev, ...data.comments]);
              setCommentNextToken(data.nextContinuationToken || null);
          }
      } catch (error) { }
      setIsMoreCommentsLoading(false);
  };

  const fetchCommentReplies = async (commentId, replyToken) => {
      if (!replyToken || loadingReplyId) return;
      if (commentReplies[commentId]) {
          const updatedReplies = { ...commentReplies };
          delete updatedReplies[commentId];
          setCommentReplies(updatedReplies);
          return;
      }
      setLoadingReplyId(commentId);
      try {
          const response = await fetch(`${MY_API_SERVER}/api/comments?continuation=${encodeURIComponent(replyToken)}`);
          const data = await response.json();
          if (data.success && data.comments) {
              setCommentReplies(prev => ({ ...prev, [commentId]: data.comments }));
          }
      } catch (error) { }
      setLoadingReplyId(null);
  };

  const navigateToChannel = (channelName, channelAvatar, channelId) => {
      setShowCommentModal(false); 
      navigation.navigate('Channel', { channelName, channelAvatar, channelId });
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
    } catch (error) { Alert.alert("Error", "Could not connect to server."); }
  };

  const openDownloadWindow = () => {
      setShowDownloadModal(true); setDownloadType('video'); setDownloadStep('fetching'); fetchDownloadLinks('video');
  };

  const changeDownloadType = (type) => {
      if(downloadType === type) return;
      setDownloadType(type); setDownloadStep('fetching'); fetchDownloadLinks(type);
  };

  const fetchDownloadLinks = async (type) => {
    try {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&action=download&type=${type}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.success && data.availableLinks) {
        setDownloadLinks(data.availableLinks); setDownloadStep('list');
      } else { Alert.alert("Error", "No links found."); setShowDownloadModal(false); }
    } catch (error) { setShowDownloadModal(false); }
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
              views: `Offline • ${item.quality}`, thumbnail: item.thumbnail, localUri: item.localUri, type: item.type
            }));
          setRelatedVideos(offlineVids);
        }
        setIsLoadingMore(false);
        return;
      }
      let searchQuery = "trending bangla";
      if (videoData?.title) searchQuery = videoData.title.split(' ').slice(0, 4).join(' ');
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
              id: node.videoRenderer.videoId, title: node.videoRenderer.title?.runs?.[0]?.text, channel: node.videoRenderer.ownerText?.runs?.[0]?.text, 
              views: node.videoRenderer.viewCountText?.simpleText || '', 
              publishedTime: node.videoRenderer.publishedTimeText?.simpleText || '', duration: node.videoRenderer.lengthText?.simpleText || '',
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

  const formatQualityText = (text) => {
      if (!text) return "";
      return text.replace(/(\d+)p/, (match, heightStr) => {
          const height = parseInt(heightStr);
          if (height >= 1000) {
              if (height === 1440) return '2K';
              if (height === 2160) return '4K'; 
              return (height / 1000).toFixed(1) + 'K'; 
          }
          return match; 
      });
  };

  const displayAvatar = liveAvatar 
      || (videoData?.avatar && videoData.avatar.trim() !== '' ? (videoData.avatar.startsWith('//') ? `https:${videoData.avatar}` : videoData.avatar) : null) 
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(videoData?.channel || 'YT')}&background=random&color=fff&size=100`;

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <Text style={styles.mainTitle}>{videoData?.title}</Text>
      <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRowContainer}>
          <TouchableOpacity style={styles.actionPill} onPress={loadDescription}>
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.actionPillText}>Description</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={loadComments}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFF" />
              <Text style={styles.actionPillText}>Comments</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionPill} onPress={handleBackgroundPlay}>
              <Ionicons name={isAudioMode ? "headset" : "headset-outline"} size={18} color={isAudioMode ? "#00BFA5" : "#FFF"} />
              <Text style={[styles.actionPillText, isAudioMode && {color: '#00BFA5'}]}>Audio</Text>
          </TouchableOpacity>

          {!videoData.localUri && (
              <TouchableOpacity style={styles.actionPill} onPress={openDownloadWindow}>
                  <Ionicons name="download-outline" size={18} color="#FFF" />
                  <Text style={styles.actionPillText}>Download</Text>
              </TouchableOpacity>
          )}
      </ScrollView>

      <View style={styles.divider} />

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigateToChannel(videoData.channel, displayAvatar, null)}>
          <Image source={{ uri: displayAvatar }} style={styles.channelAvatar} />
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} /> 

      {isLinkLoading && (
        <View style={styles.linkLoadingOverlay}>
            <ActivityIndicator size="large" color="#00BFA5" />
            <Text style={styles.linkLoadingText}>Fetching video details via MyTube Server...</Text>
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
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>Search...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={styles.playerWrapper}>
          {isInitialLoading && (
              <View style={styles.initialPlayerLoader}>
                  <ActivityIndicator size="large" color="#00BFA5" />
                  <Text style={styles.initialLoaderText}>Loading Video...</Text>
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

      {/* 1. Description Modal */}
      <Modal visible={showDescModal} transparent animationType="slide" onRequestClose={() => setShowDescModal(false)}>
        <View style={styles.bottomSheetOverlayFull}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDescModal(false)} />
          <View style={styles.bottomSheetContentFull}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Description</Text>
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
                {!description ? (
                    <View style={{paddingVertical: 40, alignItems: 'center'}}>
                        <ActivityIndicator size="large" color="#00BFA5" />
                        <Text style={{color: '#AAA', marginTop: 15}}>Loading Description...</Text>
                    </View>
                ) : (
                    <Text style={styles.descText}>{renderDescriptionWithLinks(description)}</Text>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. Comments Modal */}
      <Modal visible={showCommentModal} transparent animationType="slide" onRequestClose={() => setShowCommentModal(false)}>
        <View style={styles.bottomSheetOverlayFull}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCommentModal(false)} />
          <View style={styles.bottomSheetContentFull}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, marginTop: 5 }}>
                {isCommentsLoading ? (
                    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50}}>
                        <ActivityIndicator size="large" color="#00BFA5" />
                        <Text style={{color: '#AAA', marginTop: 15}}>Loading Comments...</Text>
                    </View>
                ) : comments.length > 0 ? (
                    <FlatList 
                        data={comments}
                        keyExtractor={(item, idx) => item.id + idx.toString()}
                        showsVerticalScrollIndicator={false}
                        onEndReached={loadMoreComments} 
                        onEndReachedThreshold={0.5} 
                        ListFooterComponent={isMoreCommentsLoading ? <ActivityIndicator size="small" color="#00BFA5" style={{ marginVertical: 15 }} /> : null}
                        renderItem={({item}) => (
                            <View style={styles.commentContainerBlock}>
                                <View style={styles.commentItem}>
                                    <TouchableOpacity onPress={() => navigateToChannel(item.author, item.avatar, item.channelId)}>
                                        <Image source={{uri: item.avatar}} style={styles.commentAvatar} />
                                    </TouchableOpacity>

                                    <View style={styles.commentTextCol}>
                                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 4}}>
                                            <Text style={styles.commentAuthor}>{item.author}</Text>
                                            {item.time && <Text style={styles.commentTime}> • {item.time}</Text>}
                                        </View>
                                        <Text style={styles.commentText}>{item.text}</Text>
                                        
                                        <View style={styles.commentActionRow}>
                                            {item.replyToken && (
                                                <TouchableOpacity style={styles.actionBtnItem} onPress={() => fetchCommentReplies(item.id, item.replyToken)}>
                                                    <Ionicons name="chatbubbles-outline" size={14} color="#00BFA5" />
                                                    <Text style={styles.actionBtnText}>
                                                        {loadingReplyId === item.id ? "Loading..." : commentReplies[item.id] ? "Hide Replies" : "View Replies"}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                {commentReplies[item.id] && (
                                    <View style={styles.nestedRepliesBox}>
                                        {commentReplies[item.id].map((reply, rIdx) => (
                                            <View key={reply.id + rIdx} style={styles.replyItemRow}>
                                                <TouchableOpacity onPress={() => navigateToChannel(reply.author, reply.avatar, reply.channelId)}>
                                                    <Image source={{uri: reply.avatar}} style={styles.replyAvatar} />
                                                </TouchableOpacity>
                                                <View style={styles.commentTextCol}>
                                                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 2}}>
                                                        <Text style={styles.replyAuthor}>{reply.author}</Text>
                                                        {reply.time && <Text style={styles.commentTime}> • {reply.time}</Text>}
                                                    </View>
                                                    <Text style={styles.replyText}>{reply.text}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                    />
                ) : (
                    <View style={styles.commentPlaceholder}>
                        <Ionicons name="chatbubble-ellipses-outline" size={60} color="#444" />
                        <Text style={styles.commentPlaceholderText}>No comments found</Text>
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
                <TouchableOpacity style={[styles.tabButton, downloadType === 'video' && styles.activeTabButton]} onPress={() => changeDownloadType('video')}>
                    <Ionicons name="videocam" size={16} color={downloadType === 'video' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'video' && styles.activeTabText]}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, downloadType === 'audio' && styles.activeTabButton]} onPress={() => changeDownloadType('audio')}>
                    <Ionicons name="musical-notes" size={16} color={downloadType === 'audio' ? '#FFF' : '#888'} />
                    <Text style={[styles.tabText, downloadType === 'audio' && styles.activeTabText]}>Audio</Text>
                </TouchableOpacity>
            </View>

            {downloadStep === 'fetching' ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00BFA5" />
                <Text style={styles.loadingText}>Fetching links...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.qualityListContainer}>
                {getSortedLinks().map((item, index) => (
                  <TouchableOpacity key={index} style={styles.qualityCard} onPress={() => handleDownloadExecute(item)}>
                    <View style={styles.qualityInfoLeft}>
                      <View style={styles.qualityIconBg}>
                          <Ionicons name={downloadType === 'audio' ? "headset" : "videocam"} size={18} color="#00BFA5" />
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.qualityText}>{formatQualityText(item.quality)}</Text>
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
    actionPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginRight: 20 },
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
    bottomSheetContentFull: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 15, maxHeight: height * 0.75, minHeight: 450, elevation: 15, zIndex: 10 },

    descTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    descMetaRow: { flexDirection: 'row', marginBottom: 10 },
    descMetaText: { color: '#AAA', fontSize: 13, marginRight: 15, fontWeight: 'bold' },
    descText: { color: '#CCC', fontSize: 14, lineHeight: 22 },
    clickableLink: { color: '#00BFA5', textDecorationLine: 'underline', fontWeight: 'bold' },

    commentContainerBlock: { borderBottomWidth: 1, borderBottomColor: '#2A2A2A', paddingVertical: 6 },
    commentItem: { flexDirection: 'row', paddingHorizontal: 5, marginTop: 6 },
    commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
    commentTextCol: { flex: 1 },
    commentAuthor: { color: '#AAA', fontSize: 13, fontWeight: 'bold' },
    commentTime: { color: '#777', fontSize: 11 },
    commentText: { color: '#FFF', fontSize: 14, lineHeight: 20, marginTop: 2 },
    commentActionRow: { flexDirection: 'row', marginTop: 8, alignItems: 'center' },
    actionBtnItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    actionBtnText: { color: '#00BFA5', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },

    nestedRepliesBox: { marginLeft: 48, marginTop: 5, backgroundColor: '#161616', borderRadius: 8, padding: 8 },
    replyItemRow: { flexDirection: 'row', marginTop: 10, borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 8 },
    replyAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 10, backgroundColor: '#333' },
    replyAuthor: { color: '#999', fontSize: 12, fontWeight: 'bold' },
    replyText: { color: '#DDD', fontSize: 13, lineHeight: 18, marginTop: 1 },

    commentPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 30 },
    commentPlaceholderText: { color: '#AAA', fontSize: 16, marginTop: 15 },

    modalOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { width: '50%', backgroundColor: '#1E1E1E', paddingHorizontal: 12, paddingTop: 10, maxHeight: height * 0.75, minHeight: 350, zIndex: 10 },
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
    qualityCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#282828', padding: 10, borderRadius: 12, marginBottom: 10 },
    qualityInfoLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    qualityIconBg: { backgroundColor: 'rgba(0, 191, 165, 0.1)', padding: 8, borderRadius: 10 },
    qualityText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' }, 
    qualitySubText: { color: '#888', fontSize: 10, marginTop: 2 }, 
    downloadIconBtn: { padding: 5 },

    linkLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    linkLoadingText: { color: '#00BFA5', fontSize: 14, fontWeight: 'bold', marginTop: 10 }
});
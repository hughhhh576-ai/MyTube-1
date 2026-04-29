import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, SafeAreaView, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramChannelName, channelAvatar: paramAvatar } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'YouTube Channel';
  const channelAvatar = channelData?.avatar || paramAvatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLiveChannel, setIsLiveChannel] = useState(false); 
  const [liveVideoData, setLiveVideoData] = useState(null); // নির্দিষ্ট লাইভ ভিডিওর ডেটা সংরক্ষণের জন্য
  const [thumbQuality, setThumbQuality] = useState('High');
  const [channelBanner, setChannelBanner] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
  const [subscriberCount, setSubscriberCount] = useState('N/A');

  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });

  useEffect(() => {
    fetchChannelData();
  }, [channelName]);

  useEffect(() => {
    const loadGlobals = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) {
          const parsedSubs = JSON.parse(subs);
          setIsSubscribed(parsedSubs.some(sub => sub.name === channelName));
        }
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
      } catch (e) {}
    };
    if (isFocused) loadGlobals();
  }, [channelName, isFocused]);

  const extractChannelDataRecursively = (node, categorizedData) => {
    const parseVid = (vid) => {
      const duration = vid.lengthText?.simpleText || '';
      const publishedTime = vid.publishedTimeText?.simpleText || ''; 
      const title = vid.title?.runs?.[0]?.text || vid.title?.simpleText || 'No Title';
      const views = vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || '';
      // ভিডিওটি লাইভ কিনা তা চেক করে স্ট্যাটাস সেভ করা হচ্ছে
      const isLive = JSON.stringify(vid).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');

      return {
        id: String(vid.videoId),
        title: String(title),
        views: String(views),
        publishedTime: String(publishedTime),
        duration: String(duration),
        thumbnail: thumbQuality === 'Data Saver' ? `https://i.ytimg.com/vi/${vid.videoId}/mqdefault.jpg` : `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`,
        channel: channelName,
        avatar: channelAvatar,
        isLive: isLive
      };
    };

    if (Array.isArray(node)) {
      node.forEach(child => extractChannelDataRecursively(child, categorizedData));
    } else if (node !== null && typeof node === 'object') {
      if ((node.videoRenderer && node.videoRenderer.videoId) || (node.gridVideoRenderer && node.gridVideoRenderer.videoId)) {
        const target = node.videoRenderer || node.gridVideoRenderer;
        const parsedVid = parseVid(target);
        categorizedData.Videos.push(parsedVid);
      } else if (node.reelItemRenderer && node.reelItemRenderer.videoId) {
        const title = node.reelItemRenderer.headline?.simpleText || node.reelItemRenderer.title?.simpleText || 'Short Video';
        const views = node.reelItemRenderer.viewCountText?.simpleText || 'N/A';
        const parsedShort = {
          id: String(node.reelItemRenderer.videoId), 
          title: String(title),
          views: String(views),
          thumbnail: thumbQuality === 'Data Saver' ? `https://i.ytimg.com/vi/${node.reelItemRenderer.videoId}/mqdefault.jpg` : `https://i.ytimg.com/vi/${node.reelItemRenderer.videoId}/hqdefault.jpg`,
          channel: channelName, 
          avatar: channelAvatar, 
          duration: 'Short'
        };
        categorizedData.Shorts.push(parsedShort);
      } else {
        Object.values(node).forEach(child => extractChannelDataRecursively(child, categorizedData));
      }
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const searchHtml = await searchResponse.text();
      let searchMatch = searchHtml.match(/ytInitialData\s*=\s*({.+?});/) || searchHtml.match(/var ytInitialData = (.*?);<\/script>/);

      let targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`;
      let channelUrl = null;

      if (searchMatch && searchMatch[1]) {
        const searchData = JSON.parse(searchMatch[1]);
        const findChannelUrl = (node) => {
          if (channelUrl) return;
          if (node?.channelRenderer) {
            const title = node.channelRenderer.title?.simpleText || "";
            if (title.toLowerCase().includes(channelName.toLowerCase().split(' ')[0])) {
              channelUrl = node.channelRenderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
            }
          }
          if (node && typeof node === 'object') {
            Object.values(node).forEach(child => findChannelUrl(child));
          }
        };
        findChannelUrl(searchData);
      }

      let targetVideosUrl = targetUrl;
      let targetShortsUrl = targetUrl;

      if (channelUrl) {
        targetVideosUrl = `https://www.youtube.com${channelUrl}/videos`;
        targetShortsUrl = `https://www.youtube.com${channelUrl}/shorts`;
      }

      const [videosRes, shortsRes] = await Promise.all([
        fetch(targetVideosUrl, { headers: { 'User-Agent': DESKTOP_AGENT } }),
        fetch(targetShortsUrl, { headers: { 'User-Agent': DESKTOP_AGENT } })
      ]);

      const videosHtml = await videosRes.text();
      const shortsHtml = await shortsRes.text();

      let videosMatch = videosHtml.match(/ytInitialData\s*=\s*({.+?});/) || videosHtml.match(/var ytInitialData = (.*?);<\/script>/);
      let shortsMatch = shortsHtml.match(/ytInitialData\s*=\s*({.+?});/) || shortsHtml.match(/var ytInitialData = (.*?);<\/script>/);

      const categorizedData = { Videos: [], Shorts: [] };

      const processMatch = (match) => {
        if (match && match[1]) {
          const parsedData = JSON.parse(match[1]);
          extractChannelDataRecursively(parsedData, categorizedData);
          return parsedData;
        }
        return null;
      };

      const parsedVideosData = processMatch(videosMatch);
      processMatch(shortsMatch);

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

      // নির্দিষ্ট লাইভ ভিডিওটি খুঁজে বের করা হচ্ছে
      const currentLiveVideo = categorizedData.Videos.find(v => v.isLive);
      if (currentLiveVideo) {
         setIsLiveChannel(true);
         setLiveVideoData(currentLiveVideo);
      } else {
         setIsLiveChannel(false);
         setLiveVideoData(null);
      }

      setTabData(categorizedData);

      if (parsedVideosData) {
        const header = parsedVideosData?.header?.c4TabbedHeaderRenderer || parsedVideosData?.header?.pageHeaderRenderer;

        let bannerSrc = null;
        if (header?.banner?.thumbnails) {
            bannerSrc = header.banner.thumbnails;
        } else if (header?.pageHeaderBanner?.pageHeaderBannerImageViewModel?.image?.sources) {
            bannerSrc = header.pageHeaderBanner.pageHeaderBannerImageViewModel.image.sources;
        } else if (header?.content?.pageHeaderViewModel?.banner?.imageBannerViewModel?.image?.sources) {
            bannerSrc = header.content.pageHeaderViewModel.banner.imageBannerViewModel.image.sources;
        }

        if (bannerSrc && bannerSrc.length > 0) {
          setChannelBanner(bannerSrc[bannerSrc.length - 1].url);
        }

        const subs = header?.subscriberCountText?.simpleText || 
                     header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ||
                     header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[1]?.metadataParts?.[0]?.text?.content;
        if (subs) setSubscriberCount(subs);
      }

    } catch (error) {
      console.error(error);
    } finally { 
      setLoading(false); 
    }
  };

  const handleSubscriptionToggle = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      let parsedSubs = subs ? JSON.parse(subs) : [];

      if (isSubscribed) {
        parsedSubs = parsedSubs.filter(sub => sub.name !== channelName);
        setIsSubscribed(false);
      } else {
        parsedSubs.push({ id: Date.now().toString(), name: channelName, avatar: channelAvatar });
        setIsSubscribed(true);
      }
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs));
    } catch(e) {}
  };

  const handleVideoPress = (item) => {
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'Shorts') {
      return (
        <TouchableOpacity style={styles.shortGridItem} activeOpacity={0.8} onPress={() => navigation.navigate('ShortsScreen', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.shortGridImage} />
          <View style={styles.shortViewsOverlay}>
            <Ionicons name="play-outline" size={14} color="#FFF" />
            <Text style={styles.shortViewsText}>{item.views}</Text>
          </View>
          <View style={{ padding: 8, paddingBottom: 12 }}>
            <Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.videoCard}>
        <TouchableOpacity style={styles.thumbnailContainer} activeOpacity={0.8} onPress={() => handleVideoPress(item)}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
          {item.duration ? <Text style={styles.durationBadge}>{item.duration}</Text> : null}
        </TouchableOpacity>
        <View style={styles.videoInfoContainer}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => handleVideoPress(item)}>
            <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.videoMeta}>
              {item.views ? `${item.views}` : ''}
              {item.views && item.publishedTime ? ' • ' : ''}
              {item.publishedTime ? `${item.publishedTime}` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyStateContainer}>
        <Text style={styles.emptyStateText}>
          {activeTab === 'Shorts' ? 'No short video' : 'No videos found'}
        </Text>
      </View>
    );
  };

  const ChannelHeader = () => (
    <View>
      <Image source={{ uri: channelBanner }} style={styles.bannerImage} />
      <View style={styles.channelProfileSection}>
        {/* লোগো এবং লাইভ ব্যাজের অংশ (ক্লিকেবল) */}
        <TouchableOpacity 
          style={styles.avatarWrapper} 
          activeOpacity={isLiveChannel ? 0.7 : 1} 
          onPress={() => {
            if (isLiveChannel && liveVideoData) {
              DeviceEventEmitter.emit('playVideo', { videoId: liveVideoData.id, videoData: liveVideoData });
              navigation.navigate('Player', { videoId: liveVideoData.id, videoData: liveVideoData });
            }
          }}
        >
           <Image source={{ uri: channelAvatar }} style={styles.channelLogoLarge} />
           {isLiveChannel && (
             <View style={styles.liveBadge}>
               <Text style={styles.liveBadgeText}>LIVE</Text>
             </View>
           )}
        </TouchableOpacity>

        <View style={styles.channelTextInfo}>
          <Text style={styles.channelTitle}>{channelName}</Text>
          <Text style={styles.channelMeta}>@{(channelName).replace(/\s+/g, '').toLowerCase()} • {subscriberCount}</Text>
        </View>
      </View>

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={[styles.subscribeBtn, isSubscribed ? styles.subscribedState : styles.unsubscribedState]} onPress={handleSubscriptionToggle} activeOpacity={0.8}>
          <Ionicons name={isSubscribed ? "notifications-outline" : "notifications"} size={18} color={isSubscribed ? "#FFF" : "#0F0F0F"} />
          <Text style={[styles.subscribeText, isSubscribed ? {color: '#FFF'} : {color: '#0F0F0F'}]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabScrollContainer}>
        <FlatList 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          data={['Videos', 'Shorts']} 
          keyExtractor={(item) => item} 
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.tabButton, activeTab === item && styles.activeTabButton]} onPress={() => setActiveTab(item)}>
              <Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {loading && <View style={{ padding: 50, alignItems: 'center' }}><ActivityIndicator size="large" color="#FF0000" /></View>}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.headerIcon}>
           <Ionicons name="home" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FlatList 
        key={activeTab === 'Shorts' ? 'grid-2' : 'list-1'} 
        numColumns={activeTab === 'Shorts' ? 2 : 1} 
        data={tabData[activeTab] || []} 
        renderItem={renderItem} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        ListHeaderComponent={ChannelHeader}
        ListEmptyComponent={renderEmptyComponent} 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 80 }} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10 },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  bannerImage: { width: width, height: width * 0.25, resizeMode: 'cover', backgroundColor: '#222' },
  channelProfileSection: { flexDirection: 'row', padding: 15, alignItems: 'center' },

  avatarWrapper: { position: 'relative', marginRight: 15 },
  channelLogoLarge: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  liveBadge: { position: 'absolute', bottom: -5, alignSelf: 'center', backgroundColor: '#FF0000', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 2, borderColor: '#0F0F0F' },
  liveBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  channelTextInfo: { flex: 1 },
  channelTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  channelMeta: { fontSize: 12, color: '#AAA', marginTop: 2, marginBottom: 8 },
  actionButtonsContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 15 },
  subscribeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5 },
  subscribedState: { backgroundColor: '#272727' },
  unsubscribedState: { backgroundColor: '#F1F1F1' },
  subscribeText: { fontSize: 14, fontWeight: 'bold' },
  tabScrollContainer: { borderBottomWidth: 1, borderBottomColor: '#222' },
  tabButton: { paddingVertical: 15, paddingHorizontal: 20 },
  activeTabButton: { borderBottomWidth: 2, borderBottomColor: '#FFF' },
  tabText: { color: '#AAA', fontSize: 15, fontWeight: '500' },
  activeTabText: { color: '#FFF', fontWeight: 'bold' },

  videoCard: { marginBottom: 20 },
  thumbnailContainer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111', position: 'relative' },
  thumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', color: '#FFF', fontSize: 12, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, fontWeight: 'bold' },
  videoInfoContainer: { paddingHorizontal: 12, paddingTop: 10 },
  videoTitle: { color: '#FFF', fontSize: 15, fontWeight: '500', marginBottom: 4, lineHeight: 22 },
  videoMeta: { color: '#AAA', fontSize: 13 },

  shortGridItem: { width: (width / 2) - 10, margin: 5, position: 'relative', backgroundColor: '#111', borderRadius: 8, overflow: 'hidden' },
  shortGridImage: { width: '100%', height: 250, resizeMode: 'cover' },
  shortViewsOverlay: { position: 'absolute', bottom: 55, left: 5, flexDirection: 'row', alignItems: 'center' },
  shortViewsText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 3, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  shortTitle: { color: '#FFF', fontSize: 13, fontWeight: '500', lineHeight: 18 },

  emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#AAA', fontSize: 16, fontWeight: '500' }
});
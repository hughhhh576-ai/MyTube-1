import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const [isLoadingMore, setIsLoadingMore] = useState(false); 
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLiveChannel, setIsLiveChannel] = useState(false); 
  const [liveVideoData, setLiveVideoData] = useState(null);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [channelBanner, setChannelBanner] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
  const [subscriberCount, setSubscriberCount] = useState('N/A');

  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });
  const [videoToken, setVideoToken] = useState(null);
  const [shortToken, setShortToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

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

  const extractChannelDataRecursively = (node, categorizedData, tabType) => {
    const getThumbnail = (thumbnailsObject) => {
      if (thumbnailsObject && thumbnailsObject.thumbnails && thumbnailsObject.thumbnails.length > 0) {
        const thumbs = thumbnailsObject.thumbnails;
        const selectedThumb = thumbQuality === 'Data Saver' ? thumbs[0] : thumbs[thumbs.length - 1];
        let url = selectedThumb.url;
        
        if (url.startsWith('//')) {
          url = 'https:' + url;
        }
        
        if(url.includes('?')) {
            url = url.split('?')[0];
        }
        return url;
      }
      return null;
    };

    const parseVid = (vid) => {
      const duration = vid.lengthText?.simpleText || '';
      const publishedTime = vid.publishedTimeText?.simpleText || ''; 
      const title = vid.title?.runs?.[0]?.text || vid.title?.simpleText || 'No Title';
      const views = vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || '';
      const isLive = JSON.stringify(vid).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');
      const videoId = vid.videoId;

      let thumbnailUrl = getThumbnail(vid.thumbnail);
      if (!thumbnailUrl) {
         thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      return {
        id: String(videoId),
        title: String(title),
        views: String(views),
        publishedTime: String(publishedTime),
        duration: String(duration),
        thumbnail: thumbnailUrl,
        channel: channelName,
        avatar: channelAvatar,
        isLive: isLive
      };
    };

    if (Array.isArray(node)) {
      node.forEach(child => extractChannelDataRecursively(child, categorizedData, tabType));
    } else if (node !== null && typeof node === 'object') {
      
      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }

      if ((node.videoRenderer && node.videoRenderer.videoId) || (node.gridVideoRenderer && node.gridVideoRenderer.videoId)) {
        const target = node.videoRenderer || node.gridVideoRenderer;
        categorizedData.Videos.push(parseVid(target));
      } else if (node.reelItemRenderer && node.reelItemRenderer.videoId) {
        const title = node.reelItemRenderer.headline?.simpleText || node.reelItemRenderer.title?.simpleText || 'Short Video';
        const views = node.reelItemRenderer.viewCountText?.simpleText || 'N/A';
        const videoId = node.reelItemRenderer.videoId;

        let shortThumbnailUrl = getThumbnail(node.reelItemRenderer.thumbnail);
        if (!shortThumbnailUrl) {
            shortThumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }

        categorizedData.Shorts.push({
          id: String(videoId), 
          title: String(title),
          views: String(views),
          thumbnail: shortThumbnailUrl,
          channel: channelName, 
          avatar: channelAvatar, 
          duration: 'Short'
        });
      } else {
        Object.values(node).forEach(child => extractChannelDataRecursively(child, categorizedData, tabType));
      }
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const searchHtml = await searchResponse.text();
      let searchMatch = searchHtml.match(/ytInitialData\s*=\s*({.+?});/) || searchHtml.match(/var ytInitialData = (.*?);<\/script>/);

      let channelUrl = null;

      if (searchMatch && searchMatch[1]) {
        try {
          const searchData = JSON.parse(searchMatch[1]);
          // আপডেট করা লজিক: প্রথম যে চ্যানেল লিংক পাবে, সেটিই নিয়ে নেবে
          const findChannelUrl = (node) => {
            if (channelUrl) return; // একবার পেয়ে গেলে আর খুঁজবে না
            
            if (node?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
               channelUrl = node.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
               return;
            }
            if (node && typeof node === 'object') {
              Object.values(node).forEach(child => findChannelUrl(child));
            }
          };
          findChannelUrl(searchData);
        } catch (err) {
           console.log("Search Parsing Error", err);
        }
      }

      console.log("Found Channel URL:", channelUrl); // টার্মিনালে চেক করার জন্য

      // যদি কোনো চ্যানেল লিংক না পায়, তবে এখানে আটকে দেবে (ভুল লিংকে রিকোয়েস্ট পাঠাবে না)
      if (!channelUrl) {
        console.log("Error: Could not extract exact channel URL.");
        setLoading(false);
        return; 
      }

      let targetVideosUrl = `https://www.youtube.com${channelUrl}/videos`;
      let targetShortsUrl = `https://www.youtube.com${channelUrl}/shorts`;

      const [videosRes, shortsRes] = await Promise.all([
        fetch(targetVideosUrl, { headers: { 'User-Agent': DESKTOP_AGENT } }),
        fetch(targetShortsUrl, { headers: { 'User-Agent': DESKTOP_AGENT } })
      ]);

      const videosHtml = await videosRes.text();
      const shortsHtml = await shortsRes.text();

      const apiMatch = videosHtml.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiMatch && apiMatch[1]) {
          setApiKey(apiMatch[1]);
      }

      let videosMatch = videosHtml.match(/ytInitialData\s*=\s*({.+?});/) || videosHtml.match(/var ytInitialData = (.*?);<\/script>/);
      let shortsMatch = shortsHtml.match(/ytInitialData\s*=\s*({.+?});/) || shortsHtml.match(/var ytInitialData = (.*?);<\/script>/);

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };

      const processMatch = (match, tabType) => {
        if (match && match[1]) {
          try {
            const parsedData = JSON.parse(match[1]);
            extractChannelDataRecursively(parsedData, categorizedData, tabType);
            return parsedData;
          } catch (error) { return null; }
        }
        return null;
      };

      const parsedVideosData = processMatch(videosMatch, 'Videos');
      processMatch(shortsMatch, 'Shorts');

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

      setVideoToken(categorizedData.VideosToken);
      setShortToken(categorizedData.ShortsToken);

      setTabData({ Videos: categorizedData.Videos, Shorts: categorizedData.Shorts });

      if (parsedVideosData) {
        const header = parsedVideosData?.header?.c4TabbedHeaderRenderer || parsedVideosData?.header?.pageHeaderRenderer;
        let bannerSrc = null;
        if (header?.banner?.thumbnails) bannerSrc = header.banner.thumbnails;
        else if (header?.pageHeaderBanner?.pageHeaderBannerImageViewModel?.image?.sources) bannerSrc = header.pageHeaderBanner.pageHeaderBannerImageViewModel.image.sources;
        if (bannerSrc && bannerSrc.length > 0) setChannelBanner(bannerSrc[bannerSrc.length - 1].url);
        
        const subs = header?.subscriberCountText?.simpleText || header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;
        if (subs) setSubscriberCount(subs);
      }

    } catch (error) {} finally { setLoading(false); }
  };

  const fetchMoreData = async () => {
    const currentToken = activeTab === 'Videos' ? videoToken : shortToken;
    if (!currentToken || isLoadingMore || !apiKey) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
          continuation: currentToken
        })
      });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch (err) { setIsLoadingMore(false); return; }
      
      const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      extractChannelDataRecursively(data, newData, activeTab);

      const filteredNewItems = newData[activeTab].filter(newObj => !tabData[activeTab].some(existingObj => existingObj.id === newObj.id));
      setTabData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], ...filteredNewItems] }));

      if (activeTab === 'Videos') setVideoToken(newData.VideosToken || null);
      else setShortToken(newData.ShortsToken || null);

    } catch (error) {} finally { setIsLoadingMore(false); }
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
            
            <Text style={{ color: '#FFD700', fontSize: 11, marginTop: 4, fontWeight: 'bold' }}>
              Link: {item.thumbnail ? item.thumbnail : 'No Link Found'}
            </Text>

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
        <Text style={styles.emptyStateText}>{activeTab === 'Shorts' ? 'No short video' : 'No videos found'}</Text>
      </View>
    );
  };
  
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return <View style={{ paddingVertical: 20 }}><ActivityIndicator size="large" color="#FF0000" /></View>;
  };

  const ChannelHeader = () => (
    <View>
      <Image source={{ uri: channelBanner }} style={styles.bannerImage} />
      <View style={styles.channelProfileSection}>
        <View style={styles.avatarWrapper}>
           <Image source={{ uri: channelAvatar }} style={styles.channelLogoLarge} />
        </View>
        <View style={styles.channelTextInfo}>
          <Text style={styles.channelTitle}>{channelName}</Text>
          <Text style={styles.channelMeta}>@{(channelName).replace(/\s+/g, '').toLowerCase()} • {subscriberCount}</Text>
        </View>
      </View>
      <View style={styles.tabScrollContainer}>
        <FlatList 
          horizontal={true} 
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
      </View>
      <FlatList 
        key={activeTab === 'Shorts' ? 'grid-2' : 'list-1'} 
        numColumns={activeTab === 'Shorts' ? 2 : 1} 
        data={tabData[activeTab] || []} 
        renderItem={renderItem} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        ListHeaderComponent={ChannelHeader}
        ListEmptyComponent={renderEmptyComponent}
        ListFooterComponent={renderFooter}
        onEndReached={fetchMoreData}
        onEndReachedThreshold={0.5} 
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
  avatarWrapper: { marginRight: 15 },
  channelLogoLarge: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  channelTextInfo: { flex: 1 },
  channelTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  channelMeta: { fontSize: 12, color: '#AAA', marginTop: 2, marginBottom: 8 },
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
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

  const { channelData = {}, channelName: paramChannelName, channelAvatar: paramAvatar, channelUrl: paramChannelUrl } = route.params || {};

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

  // 🧠 স্মার্ট স্ক্যানার: এখন শুধু আসল ভিডিও বক্স থেকে ডেটা নেবে
  const extractDataIteratively = (rootNode, categorizedData, tabType) => {
    const stack = [{ node: rootNode, currentTitle: 'No Title Found' }];
    const seenIds = new Set();

    while (stack.length > 0) {
      const { node, currentTitle } = stack.pop();

      let newTitle = currentTitle;
      if (node && typeof node === 'object') {
        if (node.title?.runs?.[0]?.text) newTitle = node.title.runs[0].text;
        else if (node.title?.simpleText) newTitle = node.title.simpleText;
        else if (node.headline?.simpleText) newTitle = node.headline.simpleText;
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push({ node: node[i], currentTitle: newTitle });
        }
      } else if (node && typeof node === 'object') {

        if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
          categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }

        const vId = node.videoId;
        
        // 💡 মেইন ফিক্স: ভিডিও আইডি থাকার পাশাপাশি অবশ্যই টাইটেল বা ভিউ বা সময় থাকতে হবে
        const isRealVideoObj = vId && (node.title || node.lengthText || node.viewCountText || node.thumbnail || node.publishedTimeText);

        if (isRealVideoObj && !seenIds.has(vId)) {
          seenIds.add(vId);
          
          const duration = node.lengthText?.simpleText || node.lengthText?.runs?.[0]?.text || '';
          const publishedTime = node.publishedTimeText?.simpleText || node.publishedTimeText?.runs?.[0]?.text || '';
          const views = node.viewCountText?.simpleText || node.viewCountText?.runs?.[0]?.text || '';
          const isLive = JSON.stringify(node).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');
          
          const thumbnailUrl = thumbQuality === 'Data Saver' 
              ? `https://i.ytimg.com/vi/${vId}/mqdefault.jpg` 
              : `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

          // টাইটেল ভ্যালিডেশন
          let finalTitle = newTitle !== 'No Title Found' ? newTitle : 'YouTube Video';
          if (node.title?.runs?.[0]?.text) finalTitle = node.title.runs[0].text;
          else if (node.title?.simpleText) finalTitle = node.title.simpleText;

          categorizedData[tabType].push({
            id: String(vId),
            title: String(finalTitle),
            value: `https://www.youtube.com/watch?v=${vId}`, 
            channel: channelName,
            duration: duration || (tabType === 'Shorts' ? 'Short' : ''),
            publishedTime: publishedTime || (isLive ? 'Live Now' : ''),
            views: views,
            thumbnail: thumbnailUrl,
            isLive: isLive
          });
        }

        const values = Object.values(node);
        for (let i = 0; i < values.length; i++) {
          if (values[i] && typeof values[i] === 'object') stack.push({ node: values[i], currentTitle: newTitle });
        }
      }
    }
  };

  // 🎯 নতুন থেকে পুরাতন সর্টিং হেল্পার
  const extractAndSortChunk = (data, tabType, mainDataObj) => {
    const tempObj = { [tabType]: [], [`${tabType}Token`]: null };
    extractDataIteratively(data, tempObj, tabType);
    
    // ভিডিওর খণ্ডটিকে রিভার্স করে মেইন লিস্টে যোগ করা হচ্ছে
    const sortedChunk = tempObj[tabType].reverse();
    mainDataObj[tabType] = [...mainDataObj[tabType], ...sortedChunk];
    
    if (tempObj[`${tabType}Token`]) {
      mainDataObj[`${tabType}Token`] = tempObj[`${tabType}Token`];
    }
  };

  const parseYtData = (html) => {
    let match = html.match(/ytInitialData\s*=\s*({.+?});/) || 
                html.match(/var ytInitialData\s*=\s*(.*?);<\/script>/) ||
                html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/);
    if (match && match[1]) {
      try { return JSON.parse(match[1]); } catch(e) { return null; }
    }
    return null;
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      let extractedChannelUrl = paramChannelUrl || channelData?.channelUrl || null;

      if (!extractedChannelUrl) {
          const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
          const searchHtml = await searchResponse.text();
          const searchData = parseYtData(searchHtml);

          if (searchData) {
            const findChannelUrl = (node) => {
              if (extractedChannelUrl) return; 
              if (node?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 extractedChannelUrl = node.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node?.videoRenderer?.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 extractedChannelUrl = node.videoRenderer.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node && typeof node === 'object') Object.values(node).forEach(child => findChannelUrl(child));
            };
            findChannelUrl(searchData);
          }
      }

      if (!extractedChannelUrl) {
        setLoading(false);
        return; 
      }

      let targetVideosUrl = `https://www.youtube.com${extractedChannelUrl}/videos`;
      let targetShortsUrl = `https://www.youtube.com${extractedChannelUrl}/shorts`;

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

      let parsedVideosData = parseYtData(videosHtml);
      let parsedShortsData = parseYtData(shortsHtml);

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };

      // সর্টিং হেল্পার দিয়ে ডেটা লোড
      if (parsedVideosData) extractAndSortChunk(parsedVideosData, 'Videos', categorizedData);
      if (parsedShortsData) extractAndSortChunk(parsedShortsData, 'Shorts', categorizedData);

      // --- Fallback Logic: হোম পেজ চেক ---
      if (categorizedData.Videos.length === 0 && categorizedData.Shorts.length === 0) {
         try {
            const homeRes = await fetch(`https://www.youtube.com${extractedChannelUrl}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
            const homeHtml = await homeRes.text();
            const homeData = parseYtData(homeHtml);

            if (homeData) {
               if (!parsedVideosData) parsedVideosData = homeData; 
               extractAndSortChunk(homeData, 'Videos', categorizedData);
            }
         } catch (err) {}
      }

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

      setVideoToken(categorizedData.VideosToken);
      setShortToken(categorizedData.ShortsToken);

      setTabData({ Videos: categorizedData.Videos, Shorts: categorizedData.Shorts });

      // Header Data
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
      extractDataIteratively(data, newData, activeTab);

      // Load More এর নতুন ডেটাকেও রিভার্স করে সোজা করা হচ্ছে
      const sortedNewItems = newData[activeTab].reverse();
      const filteredNewItems = sortedNewItems.filter(newObj => !tabData[activeTab].some(existingObj => existingObj.id === newObj.id));
      
      setTabData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], ...filteredNewItems] }));

      if (activeTab === 'Videos') setVideoToken(newData.VideosToken || null);
      else setShortToken(newData.ShortsToken || null);

    } catch (error) {} finally { setIsLoadingMore(false); }
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

  // 🎯 VidMate স্টাইলের রেন্ডারার
  const renderItem = ({ item }) => {
    return (
      <TouchableOpacity style={styles.vidmateCard} activeOpacity={0.8} onPress={() => handleVideoPress(item)}>
        <View style={styles.thumbnailWrapper}>
          <Image source={{ uri: item.thumbnail }} style={styles.vidmateThumbnail} />
          {item.duration ? <Text style={styles.durationBadge}>{item.duration}</Text> : null}
        </View>

        <View style={styles.infoWrapper}>
          <Text style={styles.vidmateTitle} numberOfLines={2}>{item.title}</Text>

          <Text style={styles.vidmateMeta}>
            {item.views ? `${item.views}` : ''}
            {item.views && item.publishedTime ? ' • ' : ''}
            {item.publishedTime ? `${item.publishedTime}` : ''}
          </Text>

          <Text style={styles.vidmateLink} numberOfLines={1}>{item.value}</Text>
        </View>
      </TouchableOpacity>
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
        <TouchableOpacity 
          style={styles.avatarWrapper} 
          activeOpacity={isLiveChannel ? 0.7 : 1} 
          onPress={() => {}}
        >
           <Image source={{ uri: channelAvatar }} style={styles.channelLogoLarge} />
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
        key={activeTab === 'Shorts' ? 'list-shorts' : 'list-videos'} 
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

  vidmateCard: { 
    flexDirection: 'row', 
    padding: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#1A1A1A',
    backgroundColor: '#0F0F0F'
  },
  thumbnailWrapper: {
    width: 150, 
    height: 85, 
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222',
    position: 'relative'
  },
  vidmateThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#FFF',
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
  },
  infoWrapper: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  vidmateTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
    lineHeight: 20,
  },
  vidmateMeta: {
    color: '#AAA',
    fontSize: 12,
    marginBottom: 6,
  },
  vidmateLink: {
    color: '#0F0', 
    fontSize: 11,
  },

  emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#AAA', fontSize: 16, fontWeight: '500' }
});
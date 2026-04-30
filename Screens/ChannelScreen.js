import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 

const { width } = Dimensions.get('window');

// ইউটিউবকে বোঝানোর জন্য হেডার
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': 'CONSENT=YES+cb;' 
};

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
    console.log(`\n========== [CHANNEL SCREEN MOUNTED] ==========`);
    console.log(`Target Channel: ${channelName}`);
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
      } catch (e) {
        console.error('[AsyncStorage Error]:', e);
      }
    };
    if (isFocused) loadGlobals();
  }, [channelName, isFocused]);

  // থাম্বনেইল ফিক্স ও ডিবাগিং ফাংশন
  const getSafeImageUrl = (thumbnailsArray, fallbackVideoId = null, isShort = false) => {
    let finalUrl = '';
    
    try {
      if (thumbnailsArray && Array.isArray(thumbnailsArray) && thumbnailsArray.length > 0) {
        const index = thumbQuality === 'Data Saver' ? 0 : thumbnailsArray.length - 1;
        finalUrl = thumbnailsArray[index]?.url || thumbnailsArray[0]?.url;
      }

      if (!finalUrl && fallbackVideoId) {
        finalUrl = isShort 
          ? `https://i.ytimg.com/vi/${fallbackVideoId}/oardefault.jpg` 
          : `https://i.ytimg.com/vi/${fallbackVideoId}/hqdefault.jpg`;
        console.log(`[Thumbnail Backup] Using backup URL for VideoID: ${fallbackVideoId}`);
      }

      if (finalUrl && finalUrl.startsWith('//')) {
        finalUrl = `https:${finalUrl}`;
      } else if (finalUrl && finalUrl.startsWith('/')) {
        finalUrl = `https://www.youtube.com${finalUrl}`;
      }

      // টার্মিনালে থাম্বনেইল লিংক চেক করার জন্য লগ (শুধুমাত্র প্রথম কয়েকটির জন্য যেন টার্মিনাল ভরে না যায়)
      if (fallbackVideoId) {
         console.log(`[Thumbnail Created] VideoID: ${fallbackVideoId} -> Final URL: ${finalUrl}`);
      }

      return finalUrl || 'https://via.placeholder.com/640x360.png?text=No+Thumbnail'; 
    } catch (err) {
      console.error(`[Thumbnail Error] Failed to process thumbnail for VideoID: ${fallbackVideoId}`, err.message);
      return 'https://via.placeholder.com/640x360.png?text=Error';
    }
  };

  const extractDataIteratively = (rootNode, categorizedData, tabType) => {
    const stack = [rootNode];
    let extractedCount = 0;

    while (stack.length > 0) {
      const node = stack.pop();

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
        }
      } else if (node && typeof node === 'object') {

        if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
          categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }

        const target = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer || node.playlistVideoRenderer;

        if (target && target.videoId) {
          const duration = target.lengthText?.simpleText || target.lengthText?.runs?.[0]?.text || '';
          const publishedTime = target.publishedTimeText?.simpleText || target.publishedTimeText?.runs?.[0]?.text || ''; 
          const title = target.title?.runs?.[0]?.text || target.title?.simpleText || 'No Title';
          const views = target.shortViewCountText?.simpleText || target.viewCountText?.simpleText || target.videoInfo?.runs?.[0]?.text || '';
          const isLive = JSON.stringify(target).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');
          const videoId = target.videoId;

          const thumbnailUrl = getSafeImageUrl(target.thumbnail?.thumbnails, videoId, false);

          categorizedData.Videos.push({
            id: String(videoId), title: String(title), views: String(views),
            publishedTime: String(publishedTime), duration: String(duration),
            thumbnail: thumbnailUrl, channel: channelName, avatar: channelAvatar, isLive: isLive
          });
          extractedCount++;

        } else if (node.reelItemRenderer && node.reelItemRenderer.videoId) {
          const title = node.reelItemRenderer.headline?.simpleText || node.reelItemRenderer.title?.simpleText || 'Short Video';
          const views = node.reelItemRenderer.viewCountText?.simpleText || 'N/A';
          const videoId = node.reelItemRenderer.videoId;

          const shortThumbnailUrl = getSafeImageUrl(node.reelItemRenderer.thumbnail?.thumbnails, videoId, true);

          categorizedData.Shorts.push({
            id: String(videoId), title: String(title), views: String(views),
            thumbnail: shortThumbnailUrl, channel: channelName, avatar: channelAvatar, duration: 'Short'
          });
        } else {
          const values = Object.values(node);
          for (let i = 0; i < values.length; i++) {
            if (values[i] && typeof values[i] === 'object') stack.push(values[i]);
          }
        }
      }
    }
    console.log(`[Data Extractor] Extracted ${extractedCount} items for tab: ${tabType}`);
  };

  const extractYtData = (html, sourceName = "Unknown") => {
    try {
      let jsonStr = html.split('var ytInitialData =')[1] || html.split('window["ytInitialData"] =')[1];
      if (!jsonStr) {
         console.warn(`[JSON Extraction] String split failed for ${sourceName}. Trying Regex...`);
         const match = html.match(/ytInitialData\s*=\s*({.+?});/);
         if (match && match[1]) {
             console.log(`[JSON Extraction] Regex succeeded for ${sourceName}.`);
             return JSON.parse(match[1]);
         }
         console.error(`[JSON Extraction] Complete failure for ${sourceName}. No valid JSON found.`);
         return null;
      }
      jsonStr = jsonStr.split(';</script>')[0].trim();
      console.log(`[JSON Parse] Successfully parsed data for ${sourceName}.`);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error(`[JSON Parse Error] Failed at ${sourceName}:`, e.message);
      return null;
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    console.log(`[Network] Fetching initial channel data...`);
    
    try {
      let extractedChannelUrl = paramChannelUrl || channelData?.channelUrl || null;
      console.log(`[Routing] Initial Provided URL: ${extractedChannelUrl}`);
      
      let cleanPath = extractedChannelUrl;
      if (extractedChannelUrl && extractedChannelUrl.includes('youtube.com')) {
          try {
              cleanPath = new URL(extractedChannelUrl).pathname;
          } catch(e) {
              cleanPath = extractedChannelUrl.split('youtube.com')[1];
          }
      }

      if (!cleanPath) {
          console.log(`[Routing] No direct channel URL found. Searching on YouTube for: ${channelName}`);
          const searchResponse = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: HEADERS });
          const searchHtml = await searchResponse.text();
          const searchData = extractYtData(searchHtml, "Search API");

          if (searchData) {
            const findChannelUrl = (node) => {
              if (cleanPath) return; 
              if (node?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 cleanPath = node.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node?.videoRenderer?.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) {
                 cleanPath = node.videoRenderer.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
                 return;
              }
              if (node && typeof node === 'object') {
                Object.values(node).forEach(child => findChannelUrl(child));
              }
            };
            findChannelUrl(searchData);
            console.log(`[Routing] Extracted Path from Search: ${cleanPath}`);
          }
      }

      if (!cleanPath) {
        console.error(`[Routing Fatal] Could not determine channel path. Stopping execution.`);
        setLoading(false);
        return; 
      }

      let targetVideosUrl = `https://www.youtube.com${cleanPath}/videos`;
      let targetShortsUrl = `https://www.youtube.com${cleanPath}/shorts`;
      console.log(`[Network] Fetching Videos from: ${targetVideosUrl}`);

      const [videosRes, shortsRes] = await Promise.all([
        fetch(targetVideosUrl, { headers: HEADERS }),
        fetch(targetShortsUrl, { headers: HEADERS })
      ]);

      const videosHtml = await videosRes.text();
      const shortsHtml = await shortsRes.text();

      const apiMatch = videosHtml.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiMatch && apiMatch[1]) {
          setApiKey(apiMatch[1]);
          console.log(`[API Key] Found Innertube API Key: ${apiMatch[1].substring(0, 10)}...`);
      } else {
          console.warn(`[API Key] Innertube API Key not found! Load more might fail.`);
      }

      let parsedVideosData = extractYtData(videosHtml, "Videos Page");
      let parsedShortsData = extractYtData(shortsHtml, "Shorts Page");

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };

      if (parsedVideosData) extractDataIteratively(parsedVideosData, categorizedData, 'Videos');
      if (parsedShortsData) extractDataIteratively(parsedShortsData, categorizedData, 'Shorts');

      if (categorizedData.Videos.length === 0) {
          console.log(`[Fallback Strategy] /videos tab is empty. Fetching main channel page...`);
          try {
              const homeRes = await fetch(`https://www.youtube.com${cleanPath}`, { headers: HEADERS });
              const homeHtml = await homeRes.text();
              const parsedHomeData = extractYtData(homeHtml, "Home Page");
              if (parsedHomeData) {
                  extractDataIteratively(parsedHomeData, categorizedData, 'Videos');
                  if (!parsedVideosData) parsedVideosData = parsedHomeData; 
              }
          } catch(e) {
              console.error(`[Fallback Strategy Error] Failed to fetch home page:`, e.message);
          }
      }

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      
      console.log(`[Data Summary] Total Unique Videos: ${categorizedData.Videos.length}, Total Unique Shorts: ${categorizedData.Shorts.length}`);

      setVideoToken(categorizedData.VideosToken || null);
      setShortToken(categorizedData.ShortsToken || null);

      const currentLiveVideo = categorizedData.Videos.find(v => v.isLive);
      if (currentLiveVideo) {
         setIsLiveChannel(true);
         setLiveVideoData(currentLiveVideo);
      } else {
         setIsLiveChannel(false);
         setLiveVideoData(null);
      }

      setTabData({ Videos: categorizedData.Videos, Shorts: categorizedData.Shorts });

      if (parsedVideosData) {
        const header = parsedVideosData?.header?.c4TabbedHeaderRenderer || parsedVideosData?.header?.pageHeaderRenderer;
        
        let bannerSrcArray = header?.banner?.thumbnails || header?.pageHeaderBanner?.pageHeaderBannerImageViewModel?.image?.sources;
        let finalBanner = getSafeImageUrl(bannerSrcArray);
        if (finalBanner && !finalBanner.includes('placeholder')) setChannelBanner(finalBanner);

        const subs = header?.subscriberCountText?.simpleText || header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;
        if (subs) setSubscriberCount(subs);
      }

      console.log(`========== [FETCH COMPLETED] ==========\n`);
    } catch (error) {
       console.error(`[Fatal Fetch Error]`, error);
    } finally { 
       setLoading(false); 
    }
  };

  const fetchMoreData = async () => {
    const currentToken = activeTab === 'Videos' ? videoToken : shortToken;
    if (!currentToken || isLoadingMore || !apiKey) {
       if(!apiKey) console.warn(`[Load More] Blocked: No API Key available.`);
       return;
    }

    console.log(`[Network] Fetching more ${activeTab} with token...`);
    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
          continuation: currentToken
        })
      });
      const responseText = await response.text();
      let data;
      try { 
          data = JSON.parse(responseText); 
          console.log(`[Load More] Successfully parsed new data.`);
      } catch (err) { 
          console.error(`[Load More JSON Error] Failed to parse continuation data.`);
          setIsLoadingMore(false); 
          return; 
      }

      const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      extractDataIteratively(data, newData, activeTab);

      const filteredNewItems = newData[activeTab].filter(newObj => !tabData[activeTab].some(existingObj => existingObj.id === newObj.id));
      console.log(`[Load More] Added ${filteredNewItems.length} new items to UI.`);
      
      setTabData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], ...filteredNewItems] }));

      if (activeTab === 'Videos') setVideoToken(newData.VideosToken || null);
      else setShortToken(newData.ShortsToken || null);

    } catch (error) {
       console.error(`[Load More Network Error]`, error);
    } finally { 
       setIsLoadingMore(false); 
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
    } catch(e) {
      console.error('[AsyncStorage Update Error]:', e);
    }
  };

  const handleVideoPress = (item) => {
    console.log(`[Action] Video pressed: ${item.id}`);
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'Shorts') {
      return (
        <TouchableOpacity style={styles.shortGridItem} activeOpacity={0.8} onPress={() => navigation.navigate('ShortsScreen', { videoId: item.id, videoData: item })}>
          <Image 
             source={{ uri: item.thumbnail }} 
             style={styles.shortGridImage} 
             onError={(e) => console.log(`[Image Load Error] Shorts ID: ${item.id}`, e.nativeEvent.error)}
          />
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
          <Image 
             source={{ uri: item.thumbnail }} 
             style={styles.thumbnailImage} 
             onError={(e) => console.log(`[Image Load Error] Video ID: ${item.id} | URL: ${item.thumbnail}`, e.nativeEvent.error)}
          />
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
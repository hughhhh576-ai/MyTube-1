import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 

// Theme & Language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext'; 

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const styles = getDynamicStyles(isDarkMode);

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
  const [subscriberCount, setSubscriberCount] = useState('N/A');

  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });
  const [videoToken, setVideoToken] = useState(null);
  const [shortToken, setShortToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  // 🎯 ব্যানার এবং লোগো লোডিংয়ের স্টেট
  const [channelBanner, setChannelBanner] = useState(null);
  const [isBannerLoaded, setIsBannerLoaded] = useState(false);

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
      } catch (e) {
        console.error("❌ [MyTube Error] AsyncStorage লোড করতে সমস্যা:", e.message);
      }
    };
    if (isFocused) loadGlobals();
  }, [channelName, isFocused]);

  // 🧠 স্মার্ট স্ক্যানার (Views এবং Published Time ফিক্স সহ)
  const extractDataIteratively = (rootNode, categorizedData, tabType) => {
    try {
      const stack = [{ node: rootNode, currentTitle: 'Unknown Title' }];
      const seenIds = new Set();

      while (stack.length > 0) {
        const { node, currentTitle } = stack.pop();

        let newTitle = currentTitle;

        if (node && typeof node === 'object') {
          let possibleTitle = node.title?.runs?.[0]?.text || 
                              node.title?.simpleText || 
                              node.headline?.runs?.[0]?.text || 
                              node.headline?.simpleText ||
                              node.title?.content || 
                              node.metadata?.lockupMetadataViewModel?.title?.content || 
                              node.overlayMetadata?.primaryText?.content; 

          if (possibleTitle && typeof possibleTitle === 'string') {
              newTitle = possibleTitle;
          }
        }

        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) {
            if (node[i] && typeof node[i] === 'object') stack.push({ node: node[i], currentTitle: newTitle });
          }
        } else if (node && typeof node === 'object') {

          if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
            categorizedData[`${tabType}Token`] = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
          }

          const hasVideoId = !!node.videoId;
          if (hasVideoId && !seenIds.has(node.videoId)) {
            seenIds.add(node.videoId);
            const vId = node.videoId;

            let exactTitle = node.title?.runs?.[0]?.text || 
                             node.title?.simpleText || 
                             node.headline?.runs?.[0]?.text || 
                             node.headline?.simpleText || 
                             node.title?.content ||
                             newTitle;

            if (!exactTitle || exactTitle === 'Unknown Title') {
               console.warn(`⚠️ [MyTube Warning]: Title not found for video ID - ${vId}. Defaulting to 'Unknown Title'.`);
               exactTitle = 'Unknown Title'; 
            }

            // 🎯 Duration, Views এবং Published Time বের করার সাধারণ উপায়
            let duration = node.lengthText?.simpleText || node.lengthText?.runs?.[0]?.text || '';
            let publishedTime = node.publishedTimeText?.simpleText || node.publishedTimeText?.runs?.[0]?.text || '';
            let views = node.viewCountText?.simpleText || node.viewCountText?.runs?.[0]?.text || node.shortViewCountText?.simpleText || node.shortViewCountText?.runs?.[0]?.text || '';

            // 🎯 Duration এর অল্টারনেটিভ ফলব্যাক
            if (!duration && node.thumbnailOverlays) {
              const timeOverlay = node.thumbnailOverlays.find(o => o.thumbnailOverlayTimeStatusRenderer);
              if (timeOverlay) {
                duration = timeOverlay.thumbnailOverlayTimeStatusRenderer.text?.simpleText || '';
              }
            }

            // 🎯 YouTube এর নতুন ViewModel আর্কিটেকচার থেকে Views ও Time বের করা
            const metaContent = node.metadata?.lockupMetadataViewModel?.metadata?.content;
            if (metaContent && typeof metaContent === 'string') {
              // metaContent সাধারণত এমন হয়: "15K views • 2 days ago"
              const parts = metaContent.split('•').map(p => p.trim());

              if (parts.length > 1) {
                if (!views) views = parts[0]; // প্রথম অংশ Views
                if (!publishedTime) publishedTime = parts[1]; // দ্বিতীয় অংশ Published Time
              } else if (parts.length === 1) {
                if (parts[0].toLowerCase().includes('view') || parts[0].includes('ভিজ্যুয়াল')) {
                   if (!views) views = parts[0];
                } else {
                   if (!publishedTime) publishedTime = parts[0];
                }
              }
            }

            const isLive = JSON.stringify(node).includes('"BADGE_STYLE_TYPE_LIVE_NOW"');

            const thumbnailUrl = thumbQuality === 'Data Saver' 
                ? `https://i.ytimg.com/vi/${vId}/mqdefault.jpg` 
                : `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

            const videoUrl = tabType === 'Shorts' 
                ? `https://www.youtube.com/shorts/${vId}` 
                : `https://www.youtube.com/watch?v=${vId}`;

            categorizedData[tabType].unshift({
              id: String(vId),
              title: String(exactTitle),
              value: videoUrl,
              channel: channelName,
              avatar: channelAvatar, 
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
    } catch (error) {
      console.error(`❌ [MyTube Error] extractDataIteratively (${tabType}) তে সমস্যা:`, error.message);
    }
  };

  const parseYtData = (html) => {
    try {
      let match = html.match(/ytInitialData\s*=\s*({.+?});/) || 
                  html.match(/var ytInitialData\s*=\s*(.*?);<\/script>/) ||
                  html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/);
      if (match && match[1]) {
        return JSON.parse(match[1]); 
      }
    } catch(e) { 
      console.error("❌ [MyTube Error] JSON Data Parse করতে সমস্যা:", e.message);
    }
    return null;
  };

  const findBannerUrl = (data) => {
    let url = null;
    try {
      const search = (obj) => {
        if (url) return;
        if (!obj || typeof obj !== 'object') return;

        const bannerSources = obj.tvBanner?.thumbnails || 
                              obj.mobileBanner?.thumbnails || 
                              obj.banner?.thumbnails || 
                              obj.imageBannerViewModel?.image?.sources ||
                              obj.pageHeaderBannerImageViewModel?.image?.sources;

        if (bannerSources && Array.isArray(bannerSources) && bannerSources.length > 0) {
          let tempUrl = bannerSources[bannerSources.length - 1].url; 

          if (tempUrl.startsWith('//')) {
              tempUrl = 'https:' + tempUrl;
          }

          url = tempUrl;
          return;
        }

        Object.values(obj).forEach(search);
      };
      search(data);
    } catch (e) {
      console.warn("⚠️ [MyTube Warning] Banner URL খুঁজতে গিয়ে সমস্যা:", e.message);
    }
    return url;
  };

  const reFetchInitialViaApi = async (currentApiKey, vEndpoint, sEndpoint) => {
    try {
        const fetchTabViaApi = async (endpoint, tabName) => {
            if (!endpoint || !endpoint.browseId) return null;
            const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${currentApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
                body: JSON.stringify({
                    context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
                    browseId: endpoint.browseId,
                    params: endpoint.params
                })
            });
            const data = await response.json();
            const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
            extractDataIteratively(data, newData, tabName);

            newData[tabName] = newData[tabName].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
            return newData;
        };

        const [apiVideos, apiShorts] = await Promise.all([
            fetchTabViaApi(vEndpoint, 'Videos'),
            fetchTabViaApi(sEndpoint, 'Shorts')
        ]);

        setTabData(prev => ({
            Videos: apiVideos && apiVideos.Videos.length > 0 ? apiVideos.Videos : prev.Videos,
            Shorts: apiShorts && apiShorts.Shorts.length > 0 ? apiShorts.Shorts : prev.Shorts
        }));

        if (apiVideos && apiVideos.VideosToken) setVideoToken(apiVideos.VideosToken);
        if (apiShorts && apiShorts.ShortsToken) setShortToken(apiShorts.ShortsToken);

    } catch (error) {
      console.error("❌ [MyTube Error] API দিয়ে রি-ফেচ করতে সমস্যা:", error.message);
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    console.log(`📡 [MyTube Info] Fetching data for channel: ${channelName}`);
    try {
      let extractedChannelUrl = paramChannelUrl || channelData?.channelUrl || null;

      if (!extractedChannelUrl) {
          console.log(`🔍 [MyTube Info] Channel URL পাওয়া যায়নি, সার্চ করে খোঁজা হচ্ছে...`);
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
        console.error("❌ [MyTube Error] কোনোভাবেই Channel URL পাওয়া গেল না!");
        setLoading(false);
        return; 
      }

      console.log(`✅ [MyTube Info] Target Channel URL: ${extractedChannelUrl}`);

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
          console.log(`🔑 [MyTube Info] API Key পাওয়া গেছে.`);
      }

      let parsedVideosData = parseYtData(videosHtml);
      let parsedShortsData = parseYtData(shortsHtml);
      let homeData = null;

      const categorizedData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };

      if (parsedVideosData) extractDataIteratively(parsedVideosData, categorizedData, 'Videos');
      if (parsedShortsData) extractDataIteratively(parsedShortsData, categorizedData, 'Shorts');

      if (categorizedData.Videos.length === 0 && categorizedData.Shorts.length === 0) {
         try {
            console.log(`⚠️ [MyTube Warning] Videos/Shorts ট্যাবে ডাটা নেই, Home ট্যাব থেকে চেষ্টা করা হচ্ছে...`);
            const homeRes = await fetch(`https://www.youtube.com${extractedChannelUrl}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
            const homeHtml = await homeRes.text();
            homeData = parseYtData(homeHtml);

            if (homeData) {
               if (!parsedVideosData) parsedVideosData = homeData; 
               extractDataIteratively(homeData, categorizedData, 'Videos');
            }
         } catch (err) {
            console.error("❌ [MyTube Error] Home ট্যাব থেকে ডাটা আনতেও সমস্যা:", err.message);
         }
      }

      categorizedData.Videos = categorizedData.Videos.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
      categorizedData.Shorts = categorizedData.Shorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

      setVideoToken(categorizedData.VideosToken);
      setShortToken(categorizedData.ShortsToken);

      setTabData({ Videos: categorizedData.Videos, Shorts: categorizedData.Shorts });
      console.log(`✅ [MyTube Info] Total Videos: ${categorizedData.Videos.length}, Total Shorts: ${categorizedData.Shorts.length}`);

      let extractedBanner = null;
      if (parsedVideosData) extractedBanner = findBannerUrl(parsedVideosData);
      if (!extractedBanner && parsedShortsData) extractedBanner = findBannerUrl(parsedShortsData);
      if (!extractedBanner && homeData) extractedBanner = findBannerUrl(homeData);

      if (extractedBanner) {
        setChannelBanner(extractedBanner);
      }

      if (parsedVideosData) {
        const header = parsedVideosData?.header?.c4TabbedHeaderRenderer || parsedVideosData?.header?.pageHeaderRenderer;
        const subs = header?.subscriberCountText?.simpleText || header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;
        if (subs) setSubscriberCount(subs);
      }

      const currentApiKey = apiMatch ? apiMatch[1] : null;
      if (currentApiKey) {
          let vEndpoint = null;
          let sEndpoint = null;

          const extractEndpoints = (data) => {
              const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || 
                           data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
              tabs.forEach(t => {
                  const title = String(t?.tabRenderer?.title).toLowerCase();
                  if (title.includes('video') || title.includes('ভিডিও')) {
                      vEndpoint = vEndpoint || t?.tabRenderer?.endpoint?.browseEndpoint;
                  }
                  if (title.includes('short') || title.includes('শর্ট')) {
                      sEndpoint = sEndpoint || t?.tabRenderer?.endpoint?.browseEndpoint;
                  }
              });
          };

          extractEndpoints(parsedVideosData); 
          extractEndpoints(parsedShortsData); 

          reFetchInitialViaApi(currentApiKey, vEndpoint, sEndpoint);
      }

    } catch (error) {
      console.error("❌ [MyTube Fatal Error] fetchChannelData সম্পূর্ণ ফেইল করেছে:", error.message);
    } finally { 
      setLoading(false); 
    }
  };

  const fetchMoreData = async () => {
    const currentToken = activeTab === 'Videos' ? videoToken : shortToken;
    if (!currentToken || isLoadingMore || !apiKey) return;

    setIsLoadingMore(true);
    console.log(`📡 [MyTube Info] Pagination: আরও ${activeTab} লোড করা হচ্ছে...`);

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
      try { 
        data = JSON.parse(responseText); 
      } catch (err) { 
        console.error("❌ [MyTube Error] Pagination JSON Parse ফেইল করেছে:", err.message);
        setIsLoadingMore(false); 
        return; 
      }

      const newData = { Videos: [], Shorts: [], VideosToken: null, ShortsToken: null };
      extractDataIteratively(data, newData, activeTab);

      const filteredNewItems = newData[activeTab].filter(newObj => !tabData[activeTab].some(existingObj => existingObj.id === newObj.id));

      setTabData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], ...filteredNewItems] }));
      console.log(`✅ [MyTube Info] আরও ${filteredNewItems.length} টি ${activeTab} যুক্ত করা হলো।`);

      if (activeTab === 'Videos') setVideoToken(newData.VideosToken || null);
      else setShortToken(newData.ShortsToken || null);

    } catch (error) {
      console.error("❌ [MyTube Error] fetchMoreData (Pagination) ফেইল করেছে:", error.message);
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
      console.error("❌ [MyTube Error] Subscription টগল করতে সমস্যা:", e.message);
    }
  };

  const handleVideoPress = (item) => {
    const videoInfo = { ...item, avatar: channelAvatar };
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: videoInfo, channelAvatar: channelAvatar });
    navigation.navigate('Player', { videoId: item.id, videoData: videoInfo, channelAvatar: channelAvatar });
  };

  const handleShortPress = (item, index) => {
    const videoInfo = { ...item, avatar: channelAvatar };
    navigation.navigate('Shorts', { 
        videoId: item.id, 
        url: item.value,
        title: item.title,
        videoData: videoInfo,
        channelAvatar: channelAvatar,
        shortsList: tabData.Shorts, 
        initialIndex: index 
    });
  };

  const renderVideoItem = ({ item }) => {
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
        </View>
      </TouchableOpacity>
    );
  };

  const renderShortItem = ({ item, index }) => {
    return (
      <TouchableOpacity style={styles.shortCard} activeOpacity={0.8} onPress={() => handleShortPress(item, index)}>
        <View style={styles.shortThumbnailWrapper}>
          <Image source={{ uri: item.thumbnail }} style={styles.shortThumbnail} />
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
      <View style={styles.bannerContainer}>
        <Image 
            source={{ uri: 'https://via.placeholder.com/800x200/222222/FFFFFF?text=App+Logo' }} 
            style={[styles.bannerImage, { position: 'absolute' }]} 
            blurRadius={15} 
        />
        {channelBanner ? (
            <Image 
                source={{ uri: channelBanner }} 
                style={[styles.bannerImage, { opacity: isBannerLoaded ? 1 : 0 }]} 
                onLoad={() => setIsBannerLoaded(true)}
                onError={() => setIsBannerLoaded(true)} 
            />
        ) : null}
      </View>

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
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#0F0F0F' : '#F9F9F9' }]}>
      <StatusBar backgroundColor={isDarkMode ? '#0F0F0F' : '#FFFFFF'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#000' }]} numberOfLines={1}>{channelName}</Text>
      </View>

      <FlatList 
        key={activeTab === 'Shorts' ? 'list-shorts-grid' : 'list-videos'} 
        data={tabData[activeTab] || []} 
        renderItem={activeTab === 'Shorts' ? renderShortItem : renderVideoItem} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        numColumns={activeTab === 'Shorts' ? 3 : 1}
        columnWrapperStyle={activeTab === 'Shorts' ? styles.shortsColumnWrapper : undefined}
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

function getDynamicStyles(isDark) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0F0F0F' : '#F9F9F9' },
    header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10 },
    headerIcon: { padding: 10 },
    headerTitle: { flex: 1, color: isDark ? '#FFF' : '#000', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },

    bannerContainer: { width: width, height: width * 0.25, backgroundColor: isDark ? '#222' : '#eee', position: 'relative' },
    bannerImage: { width: '100%', height: '100%', resizeMode: 'cover' },

    channelProfileSection: { flexDirection: 'row', padding: 15, alignItems: 'center' },
    avatarWrapper: { marginRight: 15 },
    channelLogoLarge: { width: 70, height: 70, borderRadius: 35, backgroundColor: isDark ? '#333' : '#ccc' },
    channelTextInfo: { flex: 1 },
    channelTitle: { fontSize: 20, fontWeight: 'bold', color: isDark ? '#FFF' : '#000' },
    channelMeta: { fontSize: 12, color: isDark ? '#AAA' : '#666', marginTop: 2, marginBottom: 8 },
    actionButtonsContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 15 },
    subscribeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5 },
    subscribedState: { backgroundColor: isDark ? '#272727' : '#272727' },
    unsubscribedState: { backgroundColor: isDark ? '#272727' : '#F1F1F1' },
    subscribeText: { fontSize: 14, fontWeight: 'bold' },
    tabScrollContainer: { borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#e6e6e6' },
    tabButton: { paddingVertical: 15, paddingHorizontal: 20 },
    activeTabButton: { borderBottomWidth: 2, borderBottomColor: isDark ? '#FFF' : '#000' },
    tabText: { color: isDark ? '#AAA' : '#666', fontSize: 15, fontWeight: '500' },
    activeTabText: { color: isDark ? '#FFF' : '#000', fontWeight: 'bold' },

    vidmateCard: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#1A1A1A' : '#e6e6e6', backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF' },
    thumbnailWrapper: { width: 150, height: 85, borderRadius: 8, overflow: 'hidden', backgroundColor: isDark ? '#222' : '#ddd', position: 'relative' },
    vidmateThumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
    durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.06)', color: isDark ? '#FFF' : '#000', fontSize: 11, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, fontWeight: 'bold' },
    infoWrapper: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    vidmateTitle: { color: isDark ? '#FFF' : '#000', fontSize: 14, fontWeight: 'bold', marginBottom: 6, lineHeight: 20 },
    vidmateMeta: { color: isDark ? '#AAA' : '#666', fontSize: 12, marginBottom: 0 }, 

    shortsColumnWrapper: { 
      justifyContent: 'flex-start', 
      paddingHorizontal: 2,
      marginTop: 10 
    },
    shortCard: { 
      width: (width / 3) - 4, 
      marginHorizontal: 2, 
      marginBottom: 4, 
      backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF' 
    },
    shortThumbnailWrapper: {
      width: '100%',
      height: ((width / 3) - 4) * 1.77, 
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: isDark ? '#222' : '#ddd'
    },
    shortThumbnail: { 
      width: '100%', 
      height: '100%', 
      resizeMode: 'cover' 
    },

    emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
    emptyStateText: { color: isDark ? '#AAA' : '#666', fontSize: 16, fontWeight: '500' }
  });
}
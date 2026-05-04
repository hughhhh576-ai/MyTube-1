import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Platform } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LIVE_QUERIES = [
  "bangladesh live tv channel 24/7",
  "india live tv channel hindi news",
  "pakistan live tv channel news",
  "live sports channel 24/7",
  "live movie tv channel"
];

const TOP_BAR_QUERIES = [
  "bangladesh live tv channel 24/7",
  "bangladesh news live stream",
  "india live tv channel hindi news",
  "indian regional news live",
  "pakistan live tv channel news",
  "live sports channel 24/7",
  "world news live stream",
  "live entertainment tv channel",
  "live gaming stream"
];

export default function LiveScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeQuery, setActiveQuery] = useState(LIVE_QUERIES[0]);

  const [topChannels, setTopChannels] = useState([]);
  const [topQueryIndex, setTopQueryIndex] = useState(0);
  const [isFetchingTopChannels, setIsFetchingTopChannels] = useState(false);

  useEffect(() => {
    if (isFocused && Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync("hidden");
    }
  }, [isFocused]);

  useEffect(() => {
    const randomQuery = LIVE_QUERIES[Math.floor(Math.random() * LIVE_QUERIES.length)];
    setActiveQuery(randomQuery);
    fetchLiveVideos(randomQuery, true);
    
    fetchTopChannels(0);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTopChannels([]);
    fetchTopChannels(0);

    const randomQuery = LIVE_QUERIES[Math.floor(Math.random() * LIVE_QUERIES.length)];
    setActiveQuery(randomQuery);
    fetchLiveVideos(randomQuery, true);
  };

  const loadMoreVideos = () => {
    if (isFetchingMore || loading) return; 
    setIsFetchingMore(true);
    fetchLiveVideos(activeQuery, false);
  };

  const loadMoreTopChannels = () => {
    if (isFetchingTopChannels || topQueryIndex >= TOP_BAR_QUERIES.length) return;
    fetchTopChannels(topQueryIndex);
  };

  const getHighQualityThumbnail = (thumbnailObj, videoId) => {
    if (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) {
        return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'https://via.placeholder.com/150/333333/FFFFFF?text=TV';
    }
    let bestImgUrl = thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url;
    return bestImgUrl.startsWith('//') ? 'https:' + bestImgUrl : bestImgUrl;
  };

  // SearchSettingScreen এর হুবহু লজিক অনুযায়ী Channel স্ক্রিনে পুশ করার ফাংশন
  const navigateToChannel = (item) => {
    setTimeout(() => {
        navigation.navigate('Channel', { 
            channelName: item.channel || item.name, 
            channelAvatar: item.avatar || item.logo, 
            channelUrl: item.channelUrl,
            videoId: item.id || item.liveVideoId, 
            videoLink: `https://www.youtube.com/watch?v=${item.id || item.liveVideoId}` 
        });
    }, 0);
  };

  const fetchTopChannels = async (queryIndex) => {
    setIsFetchingTopChannels(true);
    try {
      const query = TOP_BAR_QUERIES[queryIndex];
      const liveFilter = '&sp=EgJAAQ%253D%253D';
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${liveFilter}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const newChannels = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                const vid = node.videoRenderer;
                const channelName = vid.ownerText?.runs?.[0]?.text;
                const channelId = vid.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
                
                // SearchSettingScreen এর মতো করে লোগো এক্সট্র্যাক্ট করা হয়েছে
                const rawAvatarUrl = vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url;
                const finalAvatar = rawAvatarUrl ? (rawAvatarUrl.startsWith('//') ? 'https:' + rawAvatarUrl : rawAvatarUrl) : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';
                
                // SearchSettingScreen এর মতো চ্যানেল ইউআরএল এক্সট্র্যাক্ট
                const channelUrl = vid.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
                
                const liveVideoId = vid.videoId;

                if (channelName && channelId && liveVideoId) {
                    if (!newChannels.some(c => c.id === channelId)) {
                        newChannels.push({
                            id: channelId,
                            name: channelName,
                            logo: finalAvatar,
                            channelUrl: channelUrl,
                            liveVideoId: liveVideoId
                        });
                    }
                }
            } else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        setTopChannels(prev => {
            const uniqueNewChannels = newChannels.filter(nc => !prev.some(pc => pc.id === nc.id));
            return queryIndex === 0 ? uniqueNewChannels : [...prev, ...uniqueNewChannels];
        });
        
        setTopQueryIndex(queryIndex + 1);
      }
    } catch (e) {
      console.error("Top Channels fetch error:", e);
    } finally {
      setIsFetchingTopChannels(false);
    }
  };

  const fetchLiveVideos = async (query, isNewSearch = false) => {
    if (isNewSearch) setLoading(true); 
    try {
      const liveFilter = '&sp=EgJAAQ%253D%253D';
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${liveFilter}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                extractedVideos.push(node.videoRenderer);
            } else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        const formattedVideos = extractedVideos.map(vid => {
            // SearchSettingScreen এর মতো করে লোগো ও URL এক্সট্র্যাক্ট করা হয়েছে
            const rawAvatarUrl = vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url;
            const finalAvatar = rawAvatarUrl ? (rawAvatarUrl.startsWith('//') ? 'https:' + rawAvatarUrl : rawAvatarUrl) : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';
            const channelUrl = vid.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';

            return {
              id: vid.videoId, 
              title: vid.title?.runs?.[0]?.text || 'No Title', 
              channel: vid.ownerText?.runs?.[0]?.text || 'Channel',
              channelId: vid.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
              channelUrl: channelUrl,
              views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || 'Live Now', 
              timeText: vid.publishedTimeText?.simpleText || vid.dateText?.simpleText || 'Started recently',
              thumbnail: getHighQualityThumbnail(vid.thumbnail, vid.videoId), 
              avatar: finalAvatar
            };
        });

        setVideos(isNewSearch ? formattedVideos : [...videos, ...formattedVideos]);
      }
    } catch (e) {
      console.error("Live fetch error:", e);
    } finally { 
      setLoading(false); 
      setRefreshing(false); 
      setIsFetchingMore(false);
    }
  };

  const playTopChannelLive = (channel) => {
    navigation.navigate('Player', { 
      videoId: channel.liveVideoId, 
      videoData: { id: channel.liveVideoId, title: channel.name, channel: channel.name, views: 'Live Now' } 
    });
  };

  const renderTopChannel = ({ item }) => (
    <TouchableOpacity style={styles.topChannelItem} onPress={() => playTopChannelLive(item)}>
      <Image source={{ uri: item.logo }} style={styles.topChannelLogo} />
      <Text style={styles.topChannelName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderVideoItem = ({ item }) => (
    <View style={styles.videoCard}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
        <View style={styles.thumbnailContainer}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
        </View>
      </TouchableOpacity>

      <View style={styles.videoInfo}>
        <TouchableOpacity onPress={() => navigateToChannel(item)}>
          <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
        </TouchableOpacity>
        
        <View style={styles.textContainer}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigateToChannel(item)}>
            <Text style={styles.meta}>{item.channel} • {item.views} • {item.timeText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      <View style={styles.header}>
        <View style={styles.logoContainer}>
            <Ionicons name="logo-youtube" size={28} color="#FF0000" />
            <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ লাইভ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      {loading && videos.length === 0 ? (
        <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0F0F0F' }} />
      ) : (
        <FlatList 
          data={videos} 
          renderItem={renderVideoItem} 
          keyExtractor={(item, index) => item.id + index.toString()} 
          ListHeaderComponent={
            <View style={styles.topChannelsContainer}>
              {topChannels.length === 0 && isFetchingTopChannels ? (
                <ActivityIndicator size="small" color="#FF0000" style={{ paddingVertical: 20 }} />
              ) : (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={topChannels}
                  keyExtractor={(item, index) => item.id + index.toString()}
                  renderItem={renderTopChannel}
                  contentContainerStyle={{ paddingHorizontal: 8 }}
                  onEndReached={loadMoreTopChannels}
                  onEndReachedThreshold={0.5}
                  ListFooterComponent={
                    isFetchingTopChannels && topChannels.length > 0 ? (
                      <View style={{ justifyContent: 'center', paddingHorizontal: 15 }}>
                        <ActivityIndicator size="small" color="#FF0000" />
                      </View>
                    ) : null
                  }
                />
              )}
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
          onEndReached={loadMoreVideos}
          onEndReachedThreshold={0.5} 
          ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#FF0000" style={{ marginVertical: 20 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', width: '100%', backgroundColor: '#0F0F0F' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  
  // Top Channels Styles
  topChannelsContainer: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222', marginBottom: 10 },
  topChannelItem: { alignItems: 'center', marginHorizontal: 8, width: 70 },
  topChannelLogo: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#333', borderWidth: 1, borderColor: '#444', resizeMode: 'cover' },
  topChannelName: { color: '#FFF', fontSize: 11, marginTop: 6, textAlign: 'center' },
  
  // Video Card Styles
  videoCard: { marginBottom: 15 },
  thumbnailContainer: { position: 'relative' },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  liveBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#FF0000', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  liveBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'flex-start' },
  channelAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 12, backgroundColor: '#333', resizeMode: 'cover' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  meta: { color: '#AAA', fontSize: 12 }
});
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, Platform, StatusBar, Keyboard, ActivityIndicator, Image, Dimensions, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = height / 12; 
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function SearchSettingScreen() {
  const navigation = useNavigation();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  
  const [continuationToken, setContinuationToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    // শুধুমাত্র অ্যাপ ওপেন হলে একবার হিস্ট্রি লোড হবে। ব্যাক করলে আর রিলোড হবে না (ফ্রিজ রোধ করতে)
    const loadData = async () => {
      try {
        const savedHistory = await AsyncStorage.getItem('myTubeSearchHistory');
        if (savedHistory) setHistory(JSON.parse(savedHistory));
      } catch (e) {}
    };
    loadData();

    if (!query) {
      InteractionManager.runAfterInteractions(() => {
        const timeout = setTimeout(() => { inputRef.current?.focus(); }, 100);
        return () => clearTimeout(timeout);
      });
    }
  }, []);

  const handleTextChange = async (text) => {
    setQuery(text);
    if (showResults) setShowResults(false);
    
    if (text.trim().length > 0) {
      try {
        const res = await fetch(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        setSuggestions(data[1] || []);
      } catch (e) { setSuggestions([]); }
    } else { setSuggestions([]); }
  };

  const saveHistory = async (text) => {
    const updatedHistory = [text, ...history.filter(item => item !== text)].slice(0, 15);
    setHistory(updatedHistory);
    await AsyncStorage.setItem('myTubeSearchHistory', JSON.stringify(updatedHistory));
  };

  const removeHistoryItem = async (itemToRemove) => {
    const updatedHistory = history.filter(item => item !== itemToRemove);
    setHistory(updatedHistory);
    await AsyncStorage.setItem('myTubeSearchHistory', JSON.stringify(updatedHistory));
  };

  const handleSearchSubmit = async (searchTerm) => {
    const text = typeof searchTerm === 'string' ? searchTerm : query;
    if (text.trim().length === 0) return;

    inputRef.current?.blur();
    Keyboard.dismiss();

    const ytLinkMatch = text.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/))([^&?\s]{11})/);
    if (ytLinkMatch && ytLinkMatch[1]) {
      const videoId = ytLinkMatch[1];
      navigation.navigate('Player', { videoId: videoId, videoData: { id: videoId, title: 'Playing from Link...' } });
      return;
    }

    saveHistory(text.trim());
    setQuery(text.trim());
    setSuggestions([]);
    setShowResults(true);
    
    // সার্চ অপটিমাইজেশন: কিবোর্ড নামার পর ডাটা ফেচ হবে
    InteractionManager.runAfterInteractions(() => {
      fetchSearchResults(text.trim());
    });
  };

  const fetchSearchResults = async (searchQuery) => {
    setIsSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      
      const apiMatch = htmlText.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiMatch && apiMatch[1]) setApiKey(apiMatch[1]);

      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const { finalFeed, nextToken } = processYouTubeData(jsonData);
        setSearchResults(finalFeed);
        setContinuationToken(nextToken);
      }
    } catch (e) {} finally { setIsSearching(false); }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !continuationToken || !apiKey) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
          continuation: continuationToken
        })
      });
      const data = await response.json();
      const { finalFeed, nextToken } = processYouTubeData(data);
      
      setSearchResults(prev => [...prev, ...finalFeed]);
      setContinuationToken(nextToken);
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const processYouTubeData = (jsonData) => {
    const extractedVideos = [];
    const extractedShorts = [];
    const extractedChannels = [];
    let nextToken = null;

    const extractNodes = (node) => {
      if (Array.isArray(node)) node.forEach(extractNodes);
      else if (node && typeof node === 'object') {
        
        if (node.reelItemRenderer) {
          extractedShorts.push(node.reelItemRenderer);
        } else if (node.videoRenderer) {
          const isShortBadge = node.videoRenderer.thumbnailOverlays?.some(overlay => overlay.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS');
          if (isShortBadge || !node.videoRenderer.lengthText) {
             extractedShorts.push({
                videoId: node.videoRenderer.videoId,
                headline: { simpleText: node.videoRenderer.title?.runs?.[0]?.text },
                viewCountText: { simpleText: node.videoRenderer.shortViewCountText?.simpleText || node.videoRenderer.viewCountText?.simpleText },
                thumbnail: node.videoRenderer.thumbnail 
             });
          } else {
             extractedVideos.push(node.videoRenderer);
          }
        } else if (node.channelRenderer) {
          extractedChannels.push(node.channelRenderer);
        } else if (node.continuationItemRenderer) {
          nextToken = node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
        } else {
          Object.values(node).forEach(extractNodes);
        }
      }
    };
    extractNodes(jsonData);

    const finalFeed = [];
    
    extractedChannels.forEach(ch => {
      const avatarUrl = ch.thumbnail?.thumbnails?.[ch.thumbnail.thumbnails.length - 1]?.url || ch.thumbnail?.thumbnails?.[0]?.url || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';
      const channelUrl = ch.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
      finalFeed.push({
        type: 'channel', id: ch.channelId, title: ch.title?.simpleText,
        avatar: avatarUrl.startsWith('//') ? 'https:' + avatarUrl : avatarUrl, 
        subscribers: ch.subscriberCountText?.simpleText,
        channelUrl: channelUrl
      });
    });

    const uniqueShortsMap = new Map();
    extractedShorts.forEach(s => {
      if (s.videoId && s.headline?.simpleText && !uniqueShortsMap.has(s.videoId)) {
        let thumbUrl = `https://i.ytimg.com/vi/${s.videoId}/oardefault.jpg`;
        if (s.thumbnail?.thumbnails?.length > 0) {
            thumbUrl = s.thumbnail.thumbnails[0].url.split('?')[0]; 
        }

        uniqueShortsMap.set(s.videoId, {
          id: s.videoId, title: s.headline.simpleText, views: s.viewCountText?.simpleText || 'N/A',
          thumbnail: thumbUrl,
          type: 'short'
        });
      }
    });
    
    const formattedShorts = Array.from(uniqueShortsMap.values()).slice(0, 15);

    if (formattedShorts.length > 0) {
      finalFeed.push({ type: 'shorts_shelf', id: 'shorts_' + Date.now(), shorts: formattedShorts });
    }

    const uniqueVideosMap = new Map();
    extractedVideos.forEach(v => {
      if (v.videoId && !uniqueVideosMap.has(v.videoId)) {
        const avatarUrl = v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url;
        const channelUrl = v.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';

        uniqueVideosMap.set(v.videoId, {
          type: 'video', id: v.videoId, title: v.title?.runs?.[0]?.text,
          channel: v.ownerText?.runs?.[0]?.text, views: v.shortViewCountText?.simpleText,
          duration: v.lengthText?.simpleText, publishedTime: v.publishedTimeText?.simpleText,
          thumbnail: v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url,
          avatar: avatarUrl ? (avatarUrl.startsWith('//') ? 'https:' + avatarUrl : avatarUrl) : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg',
          channelUrl: channelUrl
        });
      }
    });
    
    finalFeed.push(...Array.from(uniqueVideosMap.values()));
    return { finalFeed, nextToken };
  };

  const navigateToPlayer = (item) => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setTimeout(() => {
        navigation.navigate('Player', { videoId: item.id, videoData: item });
    }, 0);
  };

  // শর্টস স্ক্রিনের জন্য নেভিগেশন - সাথে সাথে বিচ্ছিন্ন করার জন্য setTimeout ব্যবহার করা হলো
  const navigateToShorts = (short) => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setTimeout(() => {
        navigation.navigate('Shorts', { initialVideoId: short.id, videoId: short.id, videoData: short });
    }, 0);
  };

  const navigateToChannel = (item) => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setTimeout(() => {
        navigation.navigate('Channel', { channelName: item.channel || item.title, channelAvatar: item.avatar, channelUrl: item.channelUrl });
    }, 0);
  };

  const renderItem = ({ item }) => {
    if (item.type === 'shorts_shelf') {
      return (
        <View style={styles.shortsShelf}>
          <View style={styles.shelfHeader}>
            <Ionicons name="play-circle" size={22} color="#FF0000" />
            <Text style={styles.shelfTitle}>Shorts</Text>
          </View>
          <FlatList 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            data={item.shorts} 
            keyExtractor={(short, index) => short.id + '_' + index.toString()} 
            renderItem={({item: short}) => (
              <TouchableOpacity style={styles.shortCard} activeOpacity={0.9} onPress={() => navigateToShorts(short)}>
                <Image source={{ uri: short.thumbnail }} style={styles.shortThumb} />
                <View style={styles.shortOverlay}>
                  <Text style={styles.shortTitle} numberOfLines={2}>{short.title}</Text>
                  <Text style={styles.shortViews}>{short.views}</Text>
                </View>
              </TouchableOpacity>
          )} />
        </View>
      );
    }

    if (item.type === 'video') {
      return (
        <View style={styles.videoCard}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => navigateToPlayer(item)}>
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
            {item.duration && <View style={styles.duration}><Text style={styles.durationText}>{item.duration}</Text></View>}
          </TouchableOpacity>
          <View style={styles.videoInfo}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigateToChannel(item)}>
              <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
            </TouchableOpacity>
            <View style={styles.textContainer}>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={() => navigateToChannel(item)}>
                <Text style={styles.videoMeta}>{item.channel} • {item.views} • {item.publishedTime}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (item.type === 'channel') {
      return (
        <TouchableOpacity style={styles.channelRow} onPress={() => navigateToChannel(item)}>
          <Image source={{ uri: item.avatar }} style={styles.channelBigAvatar} />
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.channelTitleMain}>{item.title}</Text>
            <Text style={styles.channelMetaMain}>{item.subscribers} • Channel</Text>
          </View>
        </TouchableOpacity>
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={true} />
      
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.logoBox}>
          <Ionicons name="logo-youtube" size={22} color="#FF0000" />
          <Text style={styles.logoText}>MyTube</Text>
        </View>

        <View style={styles.searchBar}>
          <TextInput 
            ref={inputRef} 
            style={styles.input} 
            placeholder="Search..." 
            placeholderTextColor="#888" 
            value={query} 
            onChangeText={handleTextChange} 
            onSubmitEditing={() => handleSearchSubmit(query)} 
            onTouchStart={() => {
              if (showResults) setShowResults(false);
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setShowResults(false); inputRef.current?.focus(); }}>
              <Ionicons name="close-circle" size={18} color="#AAA" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {!showResults ? (
          <FlatList 
            data={query ? suggestions : history} 
            keyExtractor={(item, index) => index.toString()} 
            renderItem={({item}) => (
              <View style={styles.historyRowContainer}>
                <TouchableOpacity style={styles.historyClickableArea} onPress={() => handleSearchSubmit(item)}>
                  <Ionicons name={query ? "search-outline" : "time-outline"} size={22} color="#AAA" />
                  <Text style={styles.historyText}>{item}</Text>
                </TouchableOpacity>
                
                {!query && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => removeHistoryItem(item)}>
                    <Ionicons name="close" size={22} color="#FFF" />
                  </TouchableOpacity>
                )}
              </View>
          )} keyboardShouldPersistTaps="handled" />
        ) : (
          <>
            {isSearching ? (
              <View style={styles.center}><ActivityIndicator size="large" color="#FF0000" /></View>
            ) : (
              <FlatList 
                data={searchResults} 
                keyExtractor={(item, index) => item.id + '_' + index.toString()} 
                renderItem={renderItem} 
                onEndReached={handleLoadMore} 
                onEndReachedThreshold={0.5} 
                ListFooterComponent={isLoadingMore && <ActivityIndicator color="#FF0000" style={{ margin: 20 }} />} 
                contentContainerStyle={{ paddingBottom: 20 }} 
                removeClippedSubviews={true} 
                initialNumToRender={10} 
                maxToRenderPerBatch={10} 
                windowSize={5} 
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: '#0F0F0F', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  iconBtn: { padding: 4, marginRight: 8 },
  logoBox: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 20, height: 38, paddingHorizontal: 15 },
  input: { flex: 1, color: '#FFF', fontSize: 14, paddingVertical: 0 },
  historyRowContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15 },
  historyClickableArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  historyText: { color: '#FFF', fontSize: 16, marginLeft: 15 },
  deleteBtn: { padding: 5, paddingLeft: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  duration: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', padding: 4, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 12 },
  videoInfo: { flexDirection: 'row', padding: 12 },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1 },
  videoTitle: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  videoMeta: { color: '#AAA', fontSize: 12, marginTop: 4 },
  shortsShelf: { paddingVertical: 15, borderBottomWidth: 4, borderBottomColor: '#222' },
  shelfHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 12 },
  shelfTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  shortCard: { width: Dimensions.get('window').width * 0.4, height: Dimensions.get('window').width * 0.72, marginRight: 12, borderRadius: 12, overflow: 'hidden', marginLeft: 12, backgroundColor: '#222' },
  shortThumb: { width: '100%', height: '100%' },
  shortOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
  shortTitle: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  shortViews: { color: '#CCC', fontSize: 11 },
  channelRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  channelBigAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333' },
  channelTitleMain: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  channelMetaMain: { color: '#AAA', fontSize: 12 }
});
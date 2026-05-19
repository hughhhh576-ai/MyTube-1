import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, Platform, StatusBar, Keyboard, ActivityIndicator, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

global.searchHistory = global.searchHistory || [ 'বাংলা খবর লাইভ', 'নতুন নাটক ২০২৪', 'ইসলামিক গজল', 'Tech review bangla' ];

export default function SearchSettingScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); 
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(global.searchHistory);
  const inputRef = useRef(null);

  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [subscribedChannels, setSubscribedChannels] = useState([]);

  useEffect(() => { const timeout = setTimeout(() => { inputRef.current?.focus(); }, 100); return () => clearTimeout(timeout); }, []);

  useEffect(() => {
    const loadSubscriptions = async () => { try { const subs = await AsyncStorage.getItem('subscribedChannels'); if (subs) setSubscribedChannels(JSON.parse(subs)); } catch (e) {} };
    if (isFocused) loadSubscriptions();
  }, [isFocused]);

  const handleTextChange = (text) => { setQuery(text); if (hasSearched) setHasSearched(false); };
  const getHighQualityThumbnail = (thumbnailObj, videoId) => (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) ? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg') : (thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url.startsWith('//') ? 'https:' + thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url : thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url);

  const toggleSubscription = async (channelName, avatarUrl) => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels'); subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === channelName);
      if (exists) subs = subs.filter(s => s.name !== channelName); else subs.push({ id: Date.now().toString(), name: channelName, avatar: avatarUrl }); 
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs)); setSubscribedChannels(subs); 
    } catch (e) {}
  };

  const fetchSearchResults = async (searchQuery) => {
    setIsSearching(true); setHasSearched(true); setSearchResults([]);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, { headers: { 'User-Agent': DESKTOP_AGENT, 'Accept-Language': 'en-US,en;q=0.9' } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = []; const extractedShorts = []; const extractedChannels = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) extractedVideos.push(node.videoRenderer); else if (node.reelItemRenderer) extractedShorts.push(node.reelItemRenderer); else if (node.channelRenderer) extractedChannels.push(node.channelRenderer); else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        const finalFeed = [];
        extractedChannels.forEach(ch => finalFeed.push({ id: ch.channelId, type: 'channel', title: ch.title?.simpleText || 'Channel', avatar: getHighQualityThumbnail(ch.thumbnail, null), subscribers: ch.subscriberCountText?.simpleText || ch.videoCountText?.simpleText || '', description: ch.descriptionSnippet?.runs?.map(r=>r.text).join('') || '' }));

        const formattedVideos = extractedVideos.map(vid => ({ id: vid.videoId, title: vid.title?.runs?.[0]?.text || 'No Title', channel: vid.ownerText?.runs?.[0]?.text || vid.longBylineText?.runs?.[0]?.text || 'Channel', views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || 'N/A', duration: vid.lengthText?.simpleText || '', publishedTime: vid.publishedTimeText?.simpleText || '', thumbnail: getHighQualityThumbnail(vid.thumbnail, vid.videoId), avatar: getHighQualityThumbnail(vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null), type: 'video' })).filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
        const formattedShorts = extractedShorts.map(short => ({ id: short.videoId, title: short.headline?.simpleText || 'Short Video', views: short.viewCountText?.simpleText || 'N/A', thumbnail: `https://i.ytimg.com/vi/${short.videoId}/oardefault.jpg`, type: 'short' })).filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

        if (formattedVideos.length > 0) finalFeed.push(formattedVideos[0]);
        if (formattedShorts.length > 0) finalFeed.push({ id: 'shorts_shelf_' + Date.now(), type: 'shorts_shelf', shorts: formattedShorts });
        if (formattedVideos.length > 1) finalFeed.push(...formattedVideos.slice(1));

        setSearchResults(finalFeed);
      }
    } catch (e) {} finally { setIsSearching(false); }
  };

  const handleSearchSubmit = (searchTerm) => {
    const text = typeof searchTerm === 'string' ? searchTerm : query; 
    if (text.trim().length > 0) {
      
      // [নতুন লজিক]: ইউটিউবের সাধারণ লিংক কিংবা শর্টস লিংক সনাক্ত করার রেজেক্স (Regex)
      const ytLinkMatch = text.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/|.*shorts\/))([^&?\s]{11})/);
      
      if (ytLinkMatch && ytLinkMatch[1]) {
        const videoId = ytLinkMatch[1];
        Keyboard.dismiss();
        setQuery(''); // সার্চ বক্স ক্লিয়ার করার জন্য
        
        // প্লেয়ার সার্ভারের নিকট অন্য সব সাধারণ ভিডিওর মতোই ডাটা স্ট্রাকচার করে পাঠানো হলো
        navigation.navigate('Player', { 
          videoId: videoId, 
          videoData: { 
            id: videoId, 
            title: 'Playing from Link...', 
            channel: 'YouTube Link', 
            views: 'N/A', 
            duration: '', 
            publishedTime: '',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            avatar: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg'
          } 
        });
        return; // এখানেই ফাংশন বন্ধ করে দেওয়া হলো যাতে নিচে সাধারণ সার্চে না যায়
      }

      const updatedHistory = [text.trim(), ...history.filter(item => item !== text.trim())].slice(0, 10);
      setHistory(updatedHistory); global.searchHistory = updatedHistory;
      Keyboard.dismiss(); setQuery(text.trim()); fetchSearchResults(text.trim());
    }
  };

  const removeHistoryItem = (itemToRemove) => { const updatedHistory = history.filter(item => item !== itemToRemove); setHistory(updatedHistory); global.searchHistory = updatedHistory; };

  const renderHistoryItem = ({ item }) => (
    <View style={styles.historyItemRow}>
      <TouchableOpacity style={styles.historyClickableArea} onPress={() => handleSearchSubmit(item)}><Ionicons name="time-outline" size={24} color="#AAA" style={styles.historyIcon} /><Text style={styles.historyText} numberOfLines={1}>{item}</Text></TouchableOpacity>
      <View style={styles.historyActions}>
        <TouchableOpacity style={styles.actionIcon} onPress={() => { setQuery(item); setHasSearched(false); }}><Ionicons name="arrow-up-left" size={22} color="#AAA" /></TouchableOpacity>
        <TouchableOpacity style={styles.actionIcon} onPress={() => removeHistoryItem(item)}><Ionicons name="close" size={22} color="#666" /></TouchableOpacity>
      </View>
    </View>
  );

  const renderFeedItem = ({ item }) => {
    if (item.type === 'channel') {
      const isSubbed = subscribedChannels.some(sub => sub.name === item.title); 
      return (
        <TouchableOpacity style={styles.channelCard} activeOpacity={0.8} onPress={() => navigation.navigate('Channel', { channelName: item.title, channelAvatar: item.avatar })}>
          <Image source={{ uri: item.avatar }} style={styles.channelBigAvatar} />
          <View style={styles.channelInfo}><Text style={styles.channelTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.channelSubText}>{item.subscribers}</Text><Text style={styles.channelDesc} numberOfLines={1}>{item.description}</Text></View>
          <TouchableOpacity style={[styles.subscribeBtn, isSubbed && styles.subscribedBtn]} onPress={() => toggleSubscription(item.title, item.avatar)}><Text style={[styles.subscribeText, isSubbed && styles.subscribedText]}>{isSubbed ? 'Subscribed' : 'Subscribe'}</Text></TouchableOpacity>
        </TouchableOpacity>
      );
    }
    if (item.type === 'shorts_shelf') {
      return (
        <View style={styles.shortsShelfContainer}>
          <View style={styles.shortsShelfHeader}><Image source={{uri: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/YouTube_play_buttom_icon_%282013-2017%29.svg'}} style={{width: 24, height: 24, tintColor: '#FF0000'}} /><Text style={styles.shortsShelfTitle}>Shorts</Text></View>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={item.shorts} keyExtractor={(s, index) => s.id + index.toString()} contentContainerStyle={{ paddingHorizontal: 12 }} renderItem={({item: short}) => (
              <TouchableOpacity style={styles.shortItemCard} activeOpacity={0.9} onPress={() => navigation.navigate('Shorts', { initialVideoId: short.id })}>
                <Image source={{ uri: short.thumbnail }} style={styles.shortThumbnailImage} />
                <View style={styles.shortTextOverlay}><Text style={styles.shortTitleText} numberOfLines={2}>{short.title}</Text><Text style={styles.shortViewsText}>{short.views}</Text></View>
              </TouchableOpacity>
            )} />
        </View>
      );
    }
    return (
      <View style={styles.videoCard}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          {item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{item.duration}</Text></View> : null}
        </TouchableOpacity>
        <View style={styles.videoInfo}>
          <TouchableOpacity onPress={() => navigation.navigate('Channel', { channelName: item.channel, channelAvatar: item.avatar })}><Image source={{ uri: item.avatar }} style={styles.channelAvatar} /></TouchableOpacity>
          <View style={styles.textContainer}>
            <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Channel', { channelName: item.channel, channelAvatar: item.avatar })}><Text style={styles.videoMeta}>{item.channel} • {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={{ paddingLeft: 10 }}><Ionicons name="ellipsis-vertical" size={16} color="#AAA" /></TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={false} />
      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <View style={styles.searchInputContainer}>
          <TextInput ref={inputRef} style={styles.searchInput} placeholder="Search YouTube" placeholderTextColor="#AAA" value={query} onChangeText={handleTextChange} onSubmitEditing={() => handleSearchSubmit(query)} returnKeyType="search" autoCapitalize="none" />
          {query.length > 0 && (<TouchableOpacity onPress={() => { setQuery(''); setHasSearched(false); inputRef.current?.focus(); }} style={styles.clearBtn}><Ionicons name="close-circle" size={20} color="#AAA" /></TouchableOpacity>)}
        </View>
      </View>

      {!hasSearched ? (
        <FlatList data={query.trim() === '' ? history : history.filter(item => item.toLowerCase().includes(query.toLowerCase()))} keyExtractor={(item, index) => item + index} renderItem={renderHistoryItem} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} ListEmptyComponent={ query.length > 0 ? ( <Text style={styles.emptyText}>No matching history. Press search to find videos.</Text> ) : null } />
      ) : isSearching ? (
         <View style={styles.centerLoading}><ActivityIndicator size="large" color="#FF0000" /><Text style={{color: '#AAA', marginTop: 10}}>Searching...</Text></View>
      ) : (
        <FlatList data={searchResults} keyExtractor={(item, index) => item.id + index.toString()} renderItem={renderFeedItem} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.emptyText}>No results found.</Text>} contentContainerStyle={{ paddingBottom: 70 }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', paddingTop: Platform.OS === 'android' ? 0 : 0 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F0F' },
  backBtn: { padding: 5, marginRight: 10 },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 20, paddingHorizontal: 15, height: 40 },
  searchInput: { flex: 1, color: '#FFF', fontSize: 16, paddingVertical: 0 },
  clearBtn: { padding: 5 },
  historyItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 15 },
  historyClickableArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  historyIcon: { marginRight: 15 },
  historyText: { color: '#FFF', fontSize: 16, flex: 1 },
  historyActions: { flexDirection: 'row', alignItems: 'center' },
  actionIcon: { padding: 10, marginLeft: 5 },
  emptyText: { color: '#AAA', textAlign: 'center', marginTop: 30, fontSize: 14 },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  channelCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  channelBigAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  channelInfo: { flex: 1, marginLeft: 15 },
  channelTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  channelSubText: { color: '#AAA', fontSize: 12, marginTop: 2 },
  channelDesc: { color: '#888', fontSize: 12, marginTop: 4 },
  subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 },
  subscribeText: { color: '#000', fontSize: 13, fontWeight: 'bold' },
  subscribedBtn: { backgroundColor: '#222' },
  subscribedText: { color: '#FFF' },
  shortsShelfContainer: { paddingVertical: 15, borderTopWidth: 4, borderBottomWidth: 4, borderColor: '#222', marginBottom: 15, backgroundColor: '#0F0F0F' },
  shortsShelfHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 15 },
  shortsShelfTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  shortItemCard: { width: width * 0.4, height: width * 0.7, marginRight: 12, borderRadius: 10, overflow: 'hidden', backgroundColor: '#222', position: 'relative' },
  shortThumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' }, 
  shortTextOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, paddingTop: 30, backgroundColor: 'rgba(0,0,0,0.6)' },
  shortTitleText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginBottom: 4, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2, lineHeight: 18 },
  shortViewsText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'flex-start' },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1, paddingRight: 10 },
  videoTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  videoMeta: { color: '#AAA', fontSize: 12 }
});
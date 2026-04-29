import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, SafeAreaView, StatusBar, Dimensions, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 
import * as NavigationBar from 'expo-navigation-bar';

const { width } = Dimensions.get('window');
const MOBILE_AGENT = 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

// --- Helper Functions (বাইরে রাখায় কোড পরিষ্কার এবং ফাস্ট হবে) ---
const getThumb = (id, q) => id ? `https://i.ytimg.com/vi/${id}/${q === 'Data Saver' ? 'mqdefault' : 'hqdefault'}.jpg` : 'https://i.ibb.co/QfWY8Zq/placeholder.jpg';

const extractYtData = (html) => {
  const match = html.match(/(var ytInitialData|window\["ytInitialData"\])\s*=\s*({.+?});/);
  return match ? JSON.parse(match[2]) : null;
};

const parseVid = (target, isShort, chName, chAvatar, quality) => ({
  id: String(target.videoId),
  title: target.title?.runs?.[0]?.text || target.title?.simpleText || target.headline?.simpleText || 'No Title',
  views: target.shortViewCountText?.simpleText || target.viewCountText?.simpleText || '',
  publishedTime: target.publishedTimeText?.simpleText || '',
  duration: isShort ? 'Short' : target.lengthText?.simpleText || '',
  thumbnail: getThumb(target.videoId, quality),
  channel: chName, avatar: chAvatar,
  isLive: JSON.stringify(target).includes('"BADGE_STYLE_TYPE_LIVE_NOW"')
});

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramName, channelAvatar: paramAvatar } = route.params || {};
  const channelName = channelData?.channel || paramName || 'YouTube Channel';
  const channelAvatar = channelData?.avatar || paramAvatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false); 
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [channelInfo, setChannelInfo] = useState({ banner: null, subs: 'N/A', isLive: false, liveVid: null });
  const [thumbQuality, setThumbQuality] = useState('High');
  const [tabData, setTabData] = useState({ Videos: [], Shorts: [], nextToken: null, apiKey: null, clientVer: '2.20240105.01.00' });
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => { if (isFocused && Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden"); }, [isFocused]);
  useEffect(() => { loadGlobals(); fetchChannelData(); }, [channelName]);

  const loadGlobals = async () => {
    try {
      const subs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
      setIsSubscribed(subs.some(sub => sub.name === channelName));
      setThumbQuality(await AsyncStorage.getItem('thumbnailQuality') || 'High');
    } catch (e) {}
  };

  const extractNodes = (node, dataObj) => {
    if (Array.isArray(node)) node.forEach(n => extractNodes(n, dataObj));
    else if (node && typeof node === 'object') {
      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) 
        dataObj.nextToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      
      const vNode = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
      if (vNode?.videoId) dataObj.Videos.push(parseVid(vNode, false, channelName, channelAvatar, thumbQuality));
      else if (node.reelItemRenderer?.videoId) dataObj.Shorts.push(parseVid(node.reelItemRenderer, true, channelName, channelAvatar, thumbQuality));
      else Object.values(node).forEach(n => extractNodes(n, dataObj));
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': MOBILE_AGENT } });
      const searchData = extractYtData(await searchRes.text());
      
      let channelUrl = null;
      JSON.stringify(searchData, (key, val) => {
        if (key === 'channelRenderer' && val.title?.simpleText?.toLowerCase().includes(channelName.split(' ')[0].toLowerCase())) 
          channelUrl = val.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
        return val;
      });

      const base = `https://www.youtube.com${channelUrl || '/results?search_query=' + encodeURIComponent(channelName)}`;
      const [vRes, sRes] = await Promise.all([fetch(`${base}/videos`, { headers: { 'User-Agent': MOBILE_AGENT } }), fetch(`${base}/shorts`, { headers: { 'User-Agent': MOBILE_AGENT } })]);
      
      const vHtml = await vRes.text();
      const sHtml = await sRes.text();
      const apiKey = (vHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
      const clientVer = (vHtml.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];

      const newData = { Videos: [], Shorts: [], nextToken: null, apiKey, clientVer };
      [extractYtData(vHtml), extractYtData(sHtml)].forEach(d => { if (d) extractNodes(d, newData); });

      const uniqueVids = [...new Map(newData.Videos.map(v => [v.id, v])).values()];
      const liveVid = uniqueVids.find(v => v.isLive);
      
      setChannelInfo({ ...channelInfo, isLive: !!liveVid, liveVid });
      setTabData({ ...newData, Videos: uniqueVids });

      const vData = extractYtData(vHtml);
      if (vData) {
        const header = vData.header?.c4TabbedHeaderRenderer || vData.header?.pageHeaderRenderer;
        const banner = header?.banner?.thumbnails?.pop()?.url || header?.pageHeaderBanner?.pageHeaderBannerImageViewModel?.image?.sources?.pop()?.url || null;
        const subs = header?.subscriberCountText?.simpleText || 'N/A';
        setChannelInfo(prev => ({ ...prev, banner, subs }));
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchMoreVideos = async () => {
    if (isFetchingMore || !tabData.nextToken || !tabData.apiKey || activeTab !== 'Videos') return;
    setIsFetchingMore(true);
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${tabData.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': MOBILE_AGENT },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: tabData.clientVer } }, continuation: tabData.nextToken })
      });
      const data = await res.json();
      const newData = { Videos: [], Shorts: [], nextToken: null };
      (data.onResponseReceivedActions || []).forEach(a => extractNodes(a, newData));

      setTabData(prev => {
        const combined = [...prev.Videos, ...newData.Videos];
        return { ...prev, Videos: [...new Map(combined.map(v => [v.id, v])).values()], nextToken: newData.nextToken || null };
      });
    } catch (e) { } finally { setIsFetchingMore(false); }
  };

  const toggleSub = async () => {
    let subs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
    if (isSubscribed) subs = subs.filter(s => s.name !== channelName);
    else subs.push({ id: Date.now().toString(), name: channelName, avatar: channelAvatar });
    setIsSubscribed(!isSubscribed);
    await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
  };

  // --- অপ্টিমাইজড ফোল্ডার লজিক (Array flatMap & Regex) ---
  const displayData = useMemo(() => {
    if (activeTab === 'Shorts') return tabData.Shorts;
    const groups = { 'This week video': [], 'This month video': [], 'This year video': [], 'Older videos': [] };
    
    tabData.Videos.forEach(v => {
      const t = (v.publishedTime || '').toLowerCase();
      if (/(day|দিন|hour|ঘণ্টা|minute|মিনিট|week|সপ্তাহ|now|এখন)/.test(t)) groups['This week video'].push(v);
      else if (/(month|মাস)/.test(t)) groups['This month video'].push(v);
      else if (/(1 year|১ বছর|1 বছর)/.test(t)) groups['This year video'].push(v);
      else groups['Older videos'].push(v);
    });

    return Object.entries(groups).flatMap(([title, vids]) => vids.length > 0 ? [
      { isHeader: true, id: `header-${title}`, title, count: vids.length },
      ...(expandedGroups[title] ? vids : vids.slice(0, title === 'This week video' ? 4 : 3)).map(v => ({ ...v, isListVideo: true }))
    ] : []);
  }, [tabData, activeTab, expandedGroups]);

  const renderItem = ({ item }) => {
    if (activeTab === 'Shorts') return (
      <TouchableOpacity style={styles.shortItem} onPress={() => navigation.navigate('ShortsScreen', { videoId: item.id, videoData: item })}>
        <Image source={{ uri: item.thumbnail }} style={styles.shortImg} />
        <View style={styles.shortOverlay}><Ionicons name="play-outline" size={14} color="#FFF" /><Text style={styles.shortTxt}>{item.views}</Text></View>
        <Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text>
      </TouchableOpacity>
    );
    if (item.isHeader) return (
      <TouchableOpacity style={styles.headerRow} onPress={() => setExpandedGroups(p => ({ ...p, [item.title]: !p[item.title] }))}>
        <Text style={styles.headerTxt}>{item.title}</Text>
        <Text style={styles.headerCount}>{item.count} videos <Ionicons name={expandedGroups[item.title] ? "chevron-up" : "chevron-down"} size={16} /></Text>
      </TouchableOpacity>
    );
    return (
      <View style={styles.vidList}>
        <TouchableOpacity style={styles.vidThumbWrap} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.vidImg} />
          {item.duration ? <Text style={styles.vidDur}>{item.duration}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.vidInfo} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Text style={styles.vidTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={styles.vidMeta}>{item.views} • {item.publishedTime}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <View style={styles.logoWrap}><Ionicons name="logo-youtube" size={24} color="#FF0000" /><Text style={styles.logoTxt}>MyTube</Text></View>
        <TouchableOpacity style={styles.searchBox} onPress={() => navigation.navigate('searchsettings')}><Text style={styles.searchTxt}>Search...</Text><Ionicons name="search" size={16} color="#AAA" /></TouchableOpacity>
      </View>

      <FlatList 
        key={activeTab} numColumns={activeTab === 'Shorts' ? 2 : 1} 
        data={displayData} renderItem={renderItem} keyExtractor={(it, i) => it.id || String(i)} 
        onEndReached={fetchMoreVideos} onEndReachedThreshold={0.5} showsVerticalScrollIndicator={false}
        ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#F00" style={{ margin: 20 }} /> : null}
        ListHeaderComponent={() => (
          <View>
            <View style={styles.bannerWrap}>{channelInfo.banner ? <Image source={{ uri: channelInfo.banner }} style={styles.banner} /> : <View style={styles.bannerPlc}><Ionicons name="logo-youtube" size={40} color="#F00" /><Text style={{ color: '#FFF' }}>MyTube</Text></View>}</View>
            <View style={styles.profileBox}>
              <TouchableOpacity onPress={() => channelInfo.isLive && navigation.navigate('Player', { videoId: channelInfo.liveVid.id, videoData: channelInfo.liveVid })}>
                <Image source={{ uri: channelAvatar }} style={styles.avatar} />
                {channelInfo.isLive && <Text style={styles.liveBadge}>LIVE</Text>}
              </TouchableOpacity>
              <View style={styles.chInfo}><Text style={styles.chTitle}>{channelName}</Text><Text style={styles.chMeta}>@{channelName.replace(/\s+/g, '').toLowerCase()} • {channelInfo.subs}</Text></View>
            </View>
            <TouchableOpacity style={[styles.subBtn, isSubscribed ? { backgroundColor: '#272727' } : { backgroundColor: '#FFF' }]} onPress={toggleSub}>
              <Ionicons name={isSubscribed ? "notifications-outline" : "notifications"} size={18} color={isSubscribed ? "#FFF" : "#000"} />
              <Text style={{ color: isSubscribed ? '#FFF' : '#000', fontWeight: 'bold' }}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
            </TouchableOpacity>
            <View style={styles.tabs}>
              {['Videos', 'Shorts'].map(t => (
                <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.activeTab]} onPress={() => setActiveTab(t)}><Text style={[styles.tabTxt, activeTab === t && { color: '#FFF' }]}>{t}</Text></TouchableOpacity>
              ))}
            </View>
            {loading && <ActivityIndicator size="large" color="#F00" style={{ margin: 50 }} />}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#222', gap: 10 },
  logoWrap: { flexDirection: 'row', alignItems: 'center' }, logoTxt: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginLeft: 4 },
  searchBox: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, padding: 10, justifyContent: 'space-between', alignItems: 'center' }, searchTxt: { color: '#888', fontSize: 13 },
  bannerWrap: { width, height: width * 0.25, backgroundColor: '#222' }, banner: { width: '100%', height: '100%' }, bannerPlc: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileBox: { flexDirection: 'row', padding: 15, alignItems: 'center', gap: 15 }, avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  liveBadge: { position: 'absolute', bottom: -5, alignSelf: 'center', backgroundColor: '#F00', color: '#FFF', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, borderRadius: 4, borderWidth: 2, borderColor: '#000' },
  chInfo: { flex: 1 }, chTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' }, chMeta: { fontSize: 12, color: '#AAA', marginTop: 2 },
  subBtn: { flexDirection: 'row', padding: 10, marginHorizontal: 15, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5, marginBottom: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222', paddingHorizontal: 10 }, tab: { padding: 15 }, activeTab: { borderBottomWidth: 2, borderBottomColor: '#FFF' }, tabTxt: { color: '#AAA', fontWeight: 'bold' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#1A1A1A', margin: 10, borderRadius: 8 }, headerTxt: { color: '#FFF', fontWeight: 'bold' }, headerCount: { color: '#888', fontSize: 12 },
  vidList: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15, gap: 12 }, vidThumbWrap: { width: 140, aspectRatio: 16/9, borderRadius: 8, overflow: 'hidden' }, vidImg: { width: '100%', height: '100%' }, vidDur: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.8)', color: '#FFF', fontSize: 10, padding: 3, borderRadius: 4 },
  vidInfo: { flex: 1 }, vidTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 6 }, vidMeta: { color: '#AAA', fontSize: 12 },
  shortItem: { width: width/2 - 10, margin: 5, backgroundColor: '#111', borderRadius: 8, overflow: 'hidden' }, shortImg: { width: '100%', height: 250 }, shortOverlay: { position: 'absolute', bottom: 45, left: 5, flexDirection: 'row' }, shortTxt: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 3 }, shortTitle: { color: '#FFF', fontSize: 13, padding: 8 }
});
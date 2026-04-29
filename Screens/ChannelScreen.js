import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, SafeAreaView, StatusBar, Dimensions, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; 
import * as NavigationBar from 'expo-navigation-bar';

const { width } = Dimensions.get('window');

// 🔴 এখানে আপনার সার্ভারের আইপি (IP) দিন
const MY_SERVER_URL = 'http://127.0.0.1:10000'; 

const getGroupName = (timeString) => {
  const t = (timeString || '').toLowerCase();
  if (t.includes('দিন') || t.includes('আজ') || t.includes('ঘণ্টা')) return 'চলতি মাসের ভিডিও';
  if (t.includes('মাস')) return `${timeString.split(' ')[0]} মাস পূর্বের ভিডিও`;
  if (t.includes('বছর')) return `${timeString.split(' ')[0]} বছর পূর্বের ভিডিও`;
  return 'অন্যান্য ভিডিও';
};

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramName, channelAvatar: paramAvatar } = route.params || {};
  const channelName = channelData?.channel || paramName || 'YouTube Channel';
  const channelAvatar = channelData?.avatar || paramAvatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [videos, setVideos] = useState([]);
  const [channelInfo, setChannelInfo] = useState({ banner: null, subs: 'N/A' });
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => { if (isFocused && Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden"); }, [isFocused]);
  useEffect(() => { loadGlobals(); fetchFromServer(); }, [channelName]);

  const loadGlobals = async () => {
    try {
      const subs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
      setIsSubscribed(subs.some(sub => sub.name === channelName));
    } catch (e) {}
  };

  // ✅ সার্ভারে চ্যানেলের নাম (Name) পাঠানো হচ্ছে
  const fetchFromServer = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${MY_SERVER_URL}/api/channel-data?name=${encodeURIComponent(channelName)}`);
      const data = await response.json();

      if (data.success) {
        if (data.videos) setVideos(data.videos);
        if (data.banner || data.subscriberCount) {
           setChannelInfo({ 
              banner: data.banner || null, 
              subs: data.subscriberCount || 'N/A' 
           });
        }
      }
    } catch (error) {
      console.error("Server Fetch Error: ", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSub = async () => {
    let subs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
    if (isSubscribed) subs = subs.filter(s => s.name !== channelName);
    else subs.push({ id: Date.now().toString(), name: channelName, avatar: channelAvatar });
    setIsSubscribed(!isSubscribed);
    await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
  };

  const displayData = useMemo(() => {
    if (activeTab === 'Shorts') return [];

    const groupsMap = new Map();
    videos.forEach(v => {
      const groupName = getGroupName(v.publishedTime);
      if (!groupsMap.has(groupName)) groupsMap.set(groupName, []);
      groupsMap.get(groupName).push(v);
    });

    let flatListReadyData = [];
    for (let [groupName, vids] of groupsMap) {
      flatListReadyData.push({ isHeader: true, id: `header-${groupName}`, title: groupName, count: vids.length });

      const isExpanded = expandedGroups[groupName];
      const vidsToShow = isExpanded ? vids : vids.slice(0, 3);
      vidsToShow.forEach(v => flatListReadyData.push({ ...v, isListVideo: true }));
    }

    return flatListReadyData;
  }, [videos, activeTab, expandedGroups]);

  const renderItem = ({ item }) => {
    if (item.isHeader) return (
      <TouchableOpacity style={styles.headerRow} activeOpacity={0.7} onPress={() => setExpandedGroups(p => ({ ...p, [item.title]: !p[item.title] }))}>
        <Text style={styles.headerTxt}>{item.title}</Text>
        <Text style={styles.headerCount}>{item.count} টি ভিডিও <Ionicons name={expandedGroups[item.title] ? "chevron-up" : "chevron-down"} size={16} /></Text>
      </TouchableOpacity>
    );
    
    return (
      <View style={styles.vidList}>
        <TouchableOpacity style={styles.vidThumbWrap} activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.vidImg} />
          {item.duration ? <Text style={styles.vidDur}>{item.duration}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.vidInfo} activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Text style={styles.vidTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={styles.vidMeta}>{item.views} • {item.publishedTime}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <View style={styles.logoWrap}><Ionicons name="logo-youtube" size={24} color="#FF0000" /><Text style={styles.logoTxt}>MyTube</Text></View>
        <TouchableOpacity style={styles.searchBox} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}><Text style={styles.searchTxt}>Search...</Text><Ionicons name="search" size={16} color="#AAA" /></TouchableOpacity>
      </View>

      <FlatList 
        key="videos" 
        data={displayData} 
        renderItem={renderItem} 
        keyExtractor={(it, i) => it.id ? it.id + i : String(i)} 
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={() => (
          <View>
            <View style={styles.bannerWrap}>
               {channelInfo.banner ? 
                  <Image source={{ uri: channelInfo.banner }} style={styles.banner} /> : 
                  <View style={styles.bannerPlc}><Ionicons name="logo-youtube" size={40} color="#F00" /><Text style={{ color: '#FFF' }}>MyTube</Text></View>
               }
            </View>
            <View style={styles.profileBox}>
              <TouchableOpacity activeOpacity={0.8}>
                <Image source={{ uri: channelAvatar }} style={styles.avatar} />
              </TouchableOpacity>
              <View style={styles.chInfo}>
                 <Text style={styles.chTitle}>{channelName}</Text>
                 <Text style={styles.chMeta}>{channelInfo.subs}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.subBtn, isSubscribed ? { backgroundColor: '#272727' } : { backgroundColor: '#FFF' }]} activeOpacity={0.8} onPress={toggleSub}>
              <Ionicons name={isSubscribed ? "notifications-outline" : "notifications"} size={18} color={isSubscribed ? "#FFF" : "#000"} />
              <Text style={{ color: isSubscribed ? '#FFF' : '#000', fontWeight: 'bold' }}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
            </TouchableOpacity>
            
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
  bannerWrap: { width, height: width * 0.25, backgroundColor: '#222' }, banner: { width: '100%', height: '100%', resizeMode: 'cover' }, bannerPlc: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileBox: { flexDirection: 'row', padding: 15, alignItems: 'center', gap: 15 }, avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#333' },
  chInfo: { flex: 1 }, chTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' }, chMeta: { fontSize: 12, color: '#AAA', marginTop: 2 },
  subBtn: { flexDirection: 'row', padding: 10, marginHorizontal: 15, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5, marginBottom: 15 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#1A1A1A', margin: 10, borderRadius: 8 }, headerTxt: { color: '#FFF', fontWeight: 'bold' }, headerCount: { color: '#888', fontSize: 12 },
  vidList: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15, gap: 12 }, vidThumbWrap: { width: 140, aspectRatio: 16/9, borderRadius: 8, overflow: 'hidden', backgroundColor: '#111' }, vidImg: { width: '100%', height: '100%', resizeMode: 'cover' }, vidDur: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.8)', color: '#FFF', fontSize: 10, padding: 3, borderRadius: 4 },
  vidInfo: { flex: 1 }, vidTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 6 }, vidMeta: { color: '#AAA', fontSize: 12 }
});
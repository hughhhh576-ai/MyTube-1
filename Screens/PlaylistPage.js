import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, Image, StatusBar, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

const { width, height } = Dimensions.get('window');

export default function PlaylistPage({ navigation }) {
  const [savedPlaylist, setSavedPlaylist] = useState([]); 

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    loadPlaylist();
    const sub = DeviceEventEmitter.addListener('playlistUpdated', loadPlaylist);
    return () => sub.remove();
  }, []);

  const loadPlaylist = async () => {
    try {
      const data = await AsyncStorage.getItem('my_saved_playlist');
      if (data) setSavedPlaylist(JSON.parse(data));
    } catch (e) {
      console.log("Error loading playlist", e);
    }
  };

  const removeVideo = async (id) => {
    try {
      const filtered = savedPlaylist.filter(v => v.id !== id);
      setSavedPlaylist(filtered);
      await AsyncStorage.setItem('my_saved_playlist', JSON.stringify(filtered));
    } catch(e) {}
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent={true} />

      <View style={styles.header}>
        <View style={styles.logoContainer}>
           <Ionicons name="logo-youtube" size={28} color="#FF0000" />
           <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={styles.playlistTitleBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Saved Playlist</Text>
        <Text style={styles.videoCount}>{savedPlaylist.length} Videos</Text>
      </View>

      <FlatList 
        data={savedPlaylist} 
        keyExtractor={(item, index) => item.id + index} 
        contentContainerStyle={{ paddingBottom: height / 6 }} // 🚨 এর কারণে নিচের কালো দাগ আর আসবে না 🚨
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.recVideoCard} 
            // 🚨 গ্লোবাল প্লেয়ারে ভিডিও প্লে করার লজিক 🚨
            onPress={() => DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item })}
          >
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
            <View style={styles.videoInfo}>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.videoMeta}>{item.channel}</Text>
              {/* 🚨 সময় এবং তারিখ দেখানো হচ্ছে 🚨 */}
              <Text style={styles.addedDateText}>
                  <Ionicons name="time-outline" size={12}/> Added: {item.addedAt || 'Unknown Date'}
              </Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => removeVideo(item.id)}>
                <Ionicons name="trash-outline" size={24} color="#FF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={70} color="#333" />
                <Text style={styles.emptyTitle}>প্লেলিস্ট একদম ফাঁকা!</Text>
                <Text style={styles.emptySubtitle}>ভিডিও চলাকালীন সেটিংস থেকে "Save to Playlist" এ ক্লিক করে ভিডিও সেভ করুন।</Text>
            </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000', 
    paddingTop: height / 32,    
    // 🚨 paddingBottom রিমুভ করা হয়েছে যাতে কালো দাগ না থাকে 🚨
  },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#222', 
    width: '100%', 
    backgroundColor: '#0F0F0F' 
  },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },

  playlistTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', flex: 1 },
  videoCount: { color: '#AAA', fontSize: 13, fontWeight: 'bold' },

  recVideoCard: { 
    flexDirection: 'row', 
    padding: 12, 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A'
  },
  thumbnailImage: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
  videoInfo: { flex: 1, marginLeft: 12 },
  videoTitle: { color: '#FFF', fontSize: 15, lineHeight: 20, fontWeight: '500' },
  videoMeta: { color: '#AAA', fontSize: 12, marginTop: 6 },
  
  // 🚨 তারিখ এবং সময়ের নতুন স্টাইল 🚨
  addedDateText: { color: '#4CAF50', fontSize: 11, marginTop: 4, fontWeight: '500' }, 
  
  deleteBtn: { padding: 10 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 15 },
  emptySubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
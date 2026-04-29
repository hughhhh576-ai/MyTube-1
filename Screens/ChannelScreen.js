import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, FlatList, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  
  const { channelName = 'MrBeast' } = route.params || {};
  const [extractedThumbnails, setExtractedThumbnails] = useState([]);

  // এই জাভাস্ক্রিপ্ট কোডটি আমাদের ব্রাউজারের ভেতরে ইনজেক্ট হবে এবং ডেটা চুরি করে আনবে
  const injectedScript = `
    setInterval(function() {
      try {
        // ব্রাউজারের সব ইমেজ ট্যাগ খুঁজে বের করো
        let images = document.querySelectorAll('img');
        let thumbUrls = [];

        images.forEach(img => {
          // যদি ইমেজের লিংকে ytimg (YouTube Image) থাকে
          if (img.src && img.src.includes('ytimg.com')) {
            // স্ক্রিনে বোঝার জন্য ছবিতে একটি লাল বর্ডার দিয়ে দাও
            img.style.border = '4px solid red'; 
            
            // লিংক থেকে অপ্রয়োজনীয় অংশ (?) কেটে ফেলে শুধু ফ্রেশ লিংকটি নাও
            let cleanUrl = img.src.split('?')[0];
            if (!thumbUrls.includes(cleanUrl)) {
              thumbUrls.push(cleanUrl);
            }
          }
        });

        // চুরি করা লিংকগুলো React Native অ্যাপে পাঠিয়ে দাও
        window.ReactNativeWebView.postMessage(JSON.stringify(thumbUrls));
      } catch (e) {}
    }, 3000); // প্রতি ৩ সেকেন্ড পরপর চেক করবে
    true;
  `;

  // ব্রাউজার থেকে মেসেজ (ডেটা) রিসিভ করার ফাংশন
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (Array.isArray(data) && data.length > 0) {
        setExtractedThumbnails(data);
      }
    } catch (e) {
      console.log("Parse error from WebView", e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      
      {/* হেডার */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
           <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName} (Visual Debugger)</Text>
      </View>

      {/* ওপরের অর্ধেক: লাইভ ব্রাউজার (WebView) */}
      <View style={styles.browserContainer}>
        <Text style={styles.sectionTitle}>🔴 Live Browser View (Top Half)</Text>
        <WebView 
          source={{ uri: `https://m.youtube.com/results?search_query=${encodeURIComponent(channelName)}` }}
          injectedJavaScript={injectedScript}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          userAgent="Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.115 Mobile Safari/537.36"
        />
      </View>

      {/* মাঝের ডিভাইডার */}
      <View style={styles.divider}>
         <Ionicons name="arrow-down" size={20} color="#0F0F0F" />
         <Text style={{fontWeight: 'bold'}}>Extracted Data Below</Text>
      </View>

      {/* নিচের অর্ধেক: আমাদের অ্যাপে রিসিভ হওয়া ডেটা */}
      <View style={styles.extractedContainer}>
        <Text style={styles.sectionTitle}>🟢 Extracted Thumbnails: {extractedThumbnails.length}</Text>
        
        <FlatList 
          data={extractedThumbnails}
          keyExtractor={(item, index) => index.toString()}
          numColumns={2}
          renderItem={({ item }) => (
            <View style={styles.thumbnailCard}>
              <Image 
                source={{ uri: item }} 
                style={styles.thumbnailImage} 
                onError={(e) => console.log("Failed to load:", item)}
              />
              <Text style={styles.linkText} numberOfLines={2}>{item}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{color: '#FFF', textAlign: 'center', marginTop: 20}}>
              Waiting for browser to load and extract images...
            </Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10, backgroundColor: '#0F0F0F' },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  
  // ব্রাউজার অংশ (অর্ধেক স্ক্রিন)
  browserContainer: { flex: 1.2, backgroundColor: '#FFF' },
  sectionTitle: { backgroundColor: '#333', color: '#FFF', padding: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  
  // ডিভাইডার
  divider: { backgroundColor: '#FFD700', padding: 5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  
  // এক্সট্র্যাক্ট করা ডেটার অংশ
  extractedContainer: { flex: 1, backgroundColor: '#222' },
  thumbnailCard: { flex: 1, margin: 5, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  thumbnailImage: { width: '100%', height: 100, resizeMode: 'cover' },
  linkText: { color: '#00FF00', fontSize: 9, padding: 5, textAlign: 'center' }
});
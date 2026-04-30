import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const route = useRoute();
  const { channelData = {}, channelName: paramChannelName, channelUrl: paramChannelUrl } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'Unknown Channel';

  const [loading, setLoading] = useState(true);
  const [debugData, setDebugData] = useState([]);

  useEffect(() => {
    fetchRawData();
  }, [channelName]);

  // একদম র ডাটা হাতড়ে যেকোনো আইডি বা লিংক বের করার লজিক (X-Ray Scanner)
  const aggressiveScanner = (rootNode) => {
    const stack = [rootNode];
    const foundItems = [];
    const seenIds = new Set(); // ডুপ্লিকেট এড়ানোর জন্য

    while (stack.length > 0) {
      const node = stack.pop();

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
        }
      } else if (node && typeof node === 'object') {
        
        // যদি সরাসরি videoId থাকে
        if (node.videoId && !seenIds.has(node.videoId)) {
          seenIds.add(node.videoId);
          foundItems.push({
            type: 'Video ID',
            value: node.videoId,
            renderer: Object.keys(node).join(', '), // কোন রেন্ডারারের ভেতর ছিল তা জানার জন্য
            title: node.title?.runs?.[0]?.text || node.title?.simpleText || 'No Title found'
          });
        } 
        // অথবা যদি কোনো URL থাকে (watch বা shorts লিংক)
        else if (node.url && (node.url.includes('/watch') || node.url.includes('/shorts')) && !seenIds.has(node.url)) {
           seenIds.add(node.url);
           foundItems.push({
            type: 'URL Link',
            value: node.url,
            renderer: 'URL Endpoint',
            title: node.title?.runs?.[0]?.text || 'No Title'
          });
        }

        const values = Object.values(node);
        for (let i = 0; i < values.length; i++) {
          if (values[i] && typeof values[i] === 'object') stack.push(values[i]);
        }
      }
    }
    return foundItems;
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

  const fetchRawData = async () => {
    setLoading(true);
    console.log(`\n================================================`);
    console.log(`🛠️ [DEBUG MODE] টার্গেট: ${channelName}`);
    
    try {
      let url = paramChannelUrl || channelData?.channelUrl || null;

      if (!url) {
         console.log(`🛠️ সার্চ থেকে URL খোঁজা হচ্ছে...`);
         const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
         const searchData = parseYtData(await searchRes.text());
         
         const findUrl = (n) => {
           if (url) return;
           if (n?.channelRenderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) url = n.channelRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;
           else if (n && typeof n === 'object') Object.values(n).forEach(findUrl);
         };
         if (searchData) findUrl(searchData);
      }

      if (!url) {
        console.log(`❌ চ্যানেল URL পাওয়া যায়নি!`);
        setLoading(false); return;
      }

      console.log(`🔗 লিংক পাওয়া গেছে: https://www.youtube.com${url}`);

      // সরাসরি হোম পেজ রিকোয়েস্ট করছি (কারণ এখানেই সমস্যা হচ্ছে)
      const res = await fetch(`https://www.youtube.com${url}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const html = await res.text();
      const rawJson = parseYtData(html);

      if (rawJson) {
        console.log(`✅ JSON ডাটা পার্স হয়েছে! এক্সট্রাক্ট করা হচ্ছে...`);
        const extracted = aggressiveScanner(rawJson);
        console.log(`🎯 মোট ${extracted.length} টি লিংক/আইডি পাওয়া গেছে!`);
        setDebugData(extracted);
      } else {
        console.log(`❌ ytInitialData পাওয়া যায়নি!`);
      }

    } catch (e) {
      console.log(`❌ Error:`, e.message);
    } finally {
      setLoading(false);
      console.log(`================================================\n`);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.debugCard}>
      <Text style={styles.debugType}>[{item.type}] : <Text style={styles.debugValue}>{item.value}</Text></Text>
      <Text style={styles.debugTitle}>Title: {item.title}</Text>
      <Text style={styles.debugRenderer}>Found in keys: {item.renderer.substring(0, 80)}...</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛠️ DEBUG MODE: {channelName}</Text>
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F0" />
          <Text style={{ color: '#0F0', marginTop: 10 }}>Scanning Raw Data...</Text>
        </View>
      ) : (
        <FlatList 
          data={debugData}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          ListEmptyComponent={<Text style={styles.emptyText}>Nothing found at all. No videos or links.</Text>}
          contentContainerStyle={{ padding: 10 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, // হ্যাকার স্টাইল ব্ল্যাক থিম
  header: { padding: 15, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#0F0', fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  debugCard: { backgroundColor: '#111', padding: 15, marginBottom: 10, borderRadius: 5, borderWidth: 1, borderColor: '#333' },
  debugType: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  debugValue: { color: '#0F0' }, // লিংক বা আইডি সবুজ রঙের হবে
  debugTitle: { color: '#FF0', marginTop: 5, fontSize: 13 },
  debugRenderer: { color: '#555', marginTop: 5, fontSize: 11, fontStyle: 'italic' },
  emptyText: { color: '#F00', textAlign: 'center', marginTop: 50, fontSize: 16 }
});
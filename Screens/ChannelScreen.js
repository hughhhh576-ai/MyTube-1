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

  // 🧠 স্মার্ট স্ক্যানার: এটি শুধু আসল ভিডিও কার্ডগুলো খুঁজবে (যেখানে টাইটেল ও আইডি একসাথে থাকে)
  const smartScanner = (rootNode) => {
    const foundItems = [];
    const seenIds = new Set(); 
    const stack = [rootNode];

    while (stack.length > 0) {
      const node = stack.pop();

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
        }
      } else if (node && typeof node === 'object') {
        
        // চেক করছি এটি কোনো আসল ভিডিও/শর্টস কার্ড কিনা (ভিডিও আইডি এবং টাইটেল দুটোই থাকতে হবে)
        const hasVideoId = !!node.videoId;
        const hasTitle = !!(node.title || node.headline);

        if (hasVideoId && hasTitle) {
          const vId = node.videoId;
          
          if (!seenIds.has(vId)) {
            seenIds.add(vId);
            
            let extractedTitle = 'No Title Found';
            if (node.title?.runs?.[0]?.text) {
              extractedTitle = node.title.runs[0].text;
            } else if (node.title?.simpleText) {
              extractedTitle = node.title.simpleText;
            } else if (node.headline?.simpleText) {
              extractedTitle = node.headline.simpleText;
            }

            foundItems.push({
              id: vId,
              value: `https://www.youtube.com/watch?v=${vId}`,
              title: extractedTitle,
            });
          }
        }

        // গভীরে যাওয়ার জন্য চাইল্ড নোডগুলোকে স্ট্যাকে পুশ করছি
        const values = Object.values(node);
        for (let i = 0; i < values.length; i++) {
          if (values[i] && typeof values[i] === 'object') {
            stack.push(values[i]);
          }
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
    setDebugData([]);
    console.log(`\n================================================`);
    console.log(`🛠️ [STEP 1] স্মার্ট স্ক্যান শুরু: ${channelName}`);
    
    try {
      let url = paramChannelUrl || channelData?.channelUrl || null;

      if (!url) {
         console.log(`🔍 চ্যানেল URL নেই। সার্চ করে বের করা হচ্ছে...`);
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
        console.log(`❌ চ্যানেল লিংক পাওয়া যায়নি! প্রসেস বাতিল।`);
        setLoading(false); 
        console.log(`================================================\n`);
        return;
      }

      console.log(`🔗 চ্যানেল লিংক পাওয়া গেছে: https://www.youtube.com${url}`);
      console.log(`📡 পেজ থেকে ডাটা ডাউনলোড করা হচ্ছে...`);

      const res = await fetch(`https://www.youtube.com${url}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const html = await res.text();
      const rawJson = parseYtData(html);

      if (rawJson) {
        console.log(`✅ JSON ডাটা সফলভাবে পার্স হয়েছে। ভিডিও খোঁজা হচ্ছে...`);
        const extracted = smartScanner(rawJson);
        console.log(`🎯 মোট ${extracted.length} টি ভিডিও (টাইটেল সহ) পাওয়া গেছে!`);
        setDebugData(extracted);
      } else {
         console.log(`❌ পেজ থেকে ytInitialData উদ্ধার করা সম্ভব হয়নি।`);
      }

    } catch (e) {
      console.log(`❌ ক্রিটিকাল এরর:`, e.message);
    } finally {
      setLoading(false);
      console.log(`================================================\n`);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.debugCard}>
      <Text style={styles.debugTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.debugType}>লিংক: <Text style={styles.debugValue}>{item.value}</Text></Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ধাপ ১: টাইটেল ও লিংক ({channelName})</Text>
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F0" />
          <Text style={{ color: '#0F0', marginTop: 10 }}>ডাটা স্ক্যান করা হচ্ছে...</Text>
        </View>
      ) : (
        <FlatList 
          data={debugData}
          renderItem={renderItem}
          keyExtractor={(item, index) => item.id + index.toString()}
          ListEmptyComponent={<Text style={styles.emptyText}>কোনো ভিডিও বা লিংক পাওয়া যায়নি।</Text>}
          contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, 
  header: { padding: 15, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#0F0', fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  debugCard: { backgroundColor: '#111', padding: 15, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  debugTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8, lineHeight: 22 },
  debugType: { color: '#AAA', fontSize: 13 },
  debugValue: { color: '#0F0' }, 
  emptyText: { color: '#F00', textAlign: 'center', marginTop: 50, fontSize: 16 }
});
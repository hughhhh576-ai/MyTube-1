import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme & Language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

export default function HistoryPage() {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); 
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const styles = getDynamicStyles(isDarkMode);
  
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFocused) {
      loadHistory();
    }
  }, [isFocused]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const storedHistory = await AsyncStorage.getItem('userHistory');
      if (storedHistory) {
        setHistoryData(JSON.parse(storedHistory));
      } else {
        setHistoryData([]);
      }
    } catch (error) {
      console.log("History Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearAllHistory = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to delete all watch history?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Delete", 
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('userHistory');
              setHistoryData([]);
            } catch (e) { console.log(e); }
          },
          style: "destructive"
        }
      ]
    );
  };

  const deleteSingleVideo = async (videoId) => {
    try {
      const updatedHistory = historyData.filter(item => item.id !== videoId);
      setHistoryData(updatedHistory);
      await AsyncStorage.setItem('userHistory', JSON.stringify(updatedHistory));
    } catch (e) {
      console.log("Delete Error:", e);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#0F0F0F' : '#F9F9F9' }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#000' }]}>{t('history') || 'Watch History'}</Text>
        
        {historyData.length > 0 && (
          <TouchableOpacity onPress={clearAllHistory} style={{ padding: 10 }}>
            <Ionicons name="trash-outline" size={24} color="#FF4444" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#FF0000" />
        </View>
      ) : historyData.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="time-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>{__translate('You have no watch history yet.')}</Text>
        </View>
      ) : (
        <FlatList
          data={historyData}
          keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
          contentContainerStyle={{ padding: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.historyCard}
              onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}
            >
              <View style={styles.infoContainer}>
                <Text style={styles.title} numberOfLines={2}>{item.title || 'Unknown Title'}</Text>
                
                {/* তারিখ এবং চ্যানেল */}
                <Text style={styles.meta}>
                  <Ionicons name="calendar-outline" size={12} color={isDarkMode ? '#AAA' : '#555'} /> {item.date || 'Unknown Date'}  •  {item.channel}
                </Text>
                
                {/* ইউটিউব লিংক */}
                <Text style={styles.linkText} numberOfLines={1}>
                  Link: https://youtube.com/watch?v={item.id}
                </Text>
              </View>
              
              <TouchableOpacity 
                style={styles.deleteBtn} 
                onPress={() => deleteSingleVideo(item.id)}
              >
                <Ionicons name="close-circle" size={24} color="#555" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function getDynamicStyles(isDark) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0F0F0F' : '#F9F9F9' },
    header: { flexDirection: 'row', alignItems: 'center', height: 55, borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#EAEAEA' },
    headerTitle: { flex: 1, color: isDark ? '#FFF' : '#000', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
    historyCard: { flexDirection: 'row', padding: 15, backgroundColor: isDark ? '#1A1A1A' : '#FFF', marginBottom: 10, borderRadius: 10, alignItems: 'center' },
    infoContainer: { flex: 1, justifyContent: 'center' },
    title: { color: isDark ? '#FFF' : '#000', fontSize: 15, fontWeight: 'bold', marginBottom: 6, lineHeight: 20 },
    meta: { color: isDark ? '#AAA' : '#666', fontSize: 13, marginBottom: 4 },
    linkText: { color: '#3EA6FF', fontSize: 12, fontStyle: 'italic' },
    deleteBtn: { paddingLeft: 10 },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: isDark ? '#888' : '#666', marginTop: 10, fontSize: 16 }
  });
}
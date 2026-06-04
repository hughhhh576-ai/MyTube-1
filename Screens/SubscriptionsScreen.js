import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use global theme and language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); 
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();

  const [subscribedChannels, setSubscribedChannels] = useState([]);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFocused) {
      loadSettingsAndSubs();
    }
  }, [isFocused]);

  const loadSettingsAndSubs = async () => {
    setLoading(true);
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      if (subs) setSubscribedChannels(JSON.parse(subs));
      
      const quality = await AsyncStorage.getItem('thumbnailQuality');
      if (quality) setThumbQuality(quality);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = (channelId, channelName) => {
    Alert.alert(
      t('unsubscribe'),
      t('unsubscribeConfirm').replace('%s', channelName),
      [
        { text: t('defaultTag') || 'Cancel', style: 'cancel' },
        { 
          text: t('unsubscribe'), 
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedSubs = subscribedChannels.filter(sub => sub.id !== channelId);
              setSubscribedChannels(updatedSubs);
              await AsyncStorage.setItem('subscribedChannels', JSON.stringify(updatedSubs));
            } catch (e) { console.log(e); }
          }
        }
      ]
    );
  };

  const toggleThumbnailQuality = async () => {
    const newQuality = thumbQuality === 'High' ? 'Data Saver' : 'High';
    setThumbQuality(newQuality);
    try {
      await AsyncStorage.setItem('thumbnailQuality', newQuality);
    } catch (e) { console.log('AsyncStorage set thumbnailQuality error', e); }
    Alert.alert(t('success') || 'Success', `${t('current') || 'Current'}: ${newQuality}`);
  };

  const renderItem = ({ item }) => (
    <View style={[styles.subItemCard, { backgroundColor: isDarkMode ? '#1A1A1A' : '#FFF' }]}>
      <TouchableOpacity 
        style={styles.subInfo} 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Channel', { channelName: item.name, channelAvatar: item.avatar })}
      >
        <Image source={{ uri: item.avatar || 'https://via.placeholder.com/150' }} style={[styles.subAvatar, { backgroundColor: isDarkMode ? '#333' : '#EEE' }]} />
        <Text style={[styles.subNameText, { color: isDarkMode ? '#FFF' : '#000' }]} numberOfLines={1}>{item.name}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.unsubBtn, { backgroundColor: isDarkMode ? '#333' : '#DDD' }]} onPress={() => handleUnsubscribe(item.id, item.name)}>
        <Text style={[styles.unsubBtnText, { color: isDarkMode ? '#FFF' : '#000' }]}>{t('unsubscribe') || 'Unsubscribe'}</Text>
      </TouchableOpacity>
    </View>
  );

  const styles = getDynamicStyles(isDarkMode);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={isDarkMode ? '#0F0F0F' : '#FFFFFF'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('subscriptions') || 'My Subscriptions'}</Text>
      </View>

      {/* --- Thumbnail Quality Controller --- */}
      <View style={styles.controlPanel}>
         <Text style={styles.controlTitle}>{t('thumbnailQualityControl') || 'Thumbnail Quality Control'}</Text>
         <TouchableOpacity style={[styles.qualityBtn, { backgroundColor: isDarkMode ? '#333' : '#EEE' }]} onPress={toggleThumbnailQuality}>
            <Ionicons name={thumbQuality === 'High' ? "image" : "image-outline"} size={20} color={isDarkMode ? '#FFF' : '#000'} />
            <Text style={[styles.qualityText, { color: isDarkMode ? '#FFF' : '#000' }]}>{`${t('current') || 'Current'}: ${thumbQuality}`}</Text>
         </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}><ActivityIndicator size="large" color="#FF0000" /></View>
      ) : subscribedChannels.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="notifications-off-outline" size={64} color={isDarkMode ? '#666' : '#333'} />
          <Text style={[styles.emptyText, { color: isDarkMode ? '#AAA' : '#666' }]}>{__translate('You haven\'t subscribed to any channel yet.')}</Text>
        </View>
      ) : (
        <FlatList 
          data={subscribedChannels} 
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10 }}
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
    controlPanel: { padding: 15, backgroundColor: isDark ? '#111' : '#FFF', borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#EAEAEA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    controlTitle: { color: isDark ? '#AAA' : '#666', fontSize: 14, fontWeight: 'bold' },
    qualityBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    qualityText: { fontSize: 12, marginLeft: 5, fontWeight: 'bold' },
    subItemCard: { flexDirection: 'row', alignItems: 'center', padding: 15, marginBottom: 10, borderRadius: 10 },
    subInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    subAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
    subNameText: { flex: 1, fontSize: 16, fontWeight: '500', paddingRight: 10 },
    unsubBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    unsubBtnText: { fontSize: 12, fontWeight: 'bold' },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { marginTop: 15, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }
  });
}
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

// Global theme & language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

global.appSettings = global.appSettings || {};
global.appSettings.normalVideo = global.appSettings.normalVideo || 'Auto'; 
global.shortVideoQuality = global.shortVideoQuality || 'Normal Video Quality';
global.appSettings.downloadLocation = global.appSettings.downloadLocation || '/storage/emulated/0/MyTube';
global.appSettings.shortsCacheLimit = global.appSettings.shortsCacheLimit || 3600000;

const MY_API_SERVER = "http://127.0.0.1:10000";

export default function SettingsScreen() {
  // 'main' | 'longVideo' | 'shortVideo' | 'location' | 'cacheLimit'
  const [currentView, setCurrentView] = useState('main'); 

  const [selectedMainQuality, setSelectedMainQuality] = useState(global.appSettings.normalVideo);
  const [selectedShortQuality, setSelectedShortQuality] = useState(global.shortVideoQuality);
  
  const [downloadLocations, setDownloadLocations] = useState([{ label: 'Phone Memory', path: '/storage/emulated/0/MyTube' }]);
  const [selectedLocation, setSelectedLocation] = useState(global.appSettings.downloadLocation);
  
  const [selectedCacheLimit, setSelectedCacheLimit] = useState(global.appSettings.shortsCacheLimit);
  const [isLoading, setIsLoading] = useState(false);

  // Theme & Language hooks
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const styles = getDynamicStyles(isDarkMode);

  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const savedShortQuality = await AsyncStorage.getItem('shortVideoQuality');
        if (savedShortQuality) {
          global.shortVideoQuality = savedShortQuality;
          setSelectedShortQuality(savedShortQuality);
        }
      } catch (e) {
        console.log(e);
      }
    };

    loadSavedSettings();

    fetch(`${MY_API_SERVER}/api/storage-info`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDownloadLocations(data.storages);
          setSelectedLocation(data.current);
        }
      }).catch(e => console.log(e));
  }, []);

  // হার্ডওয়্যার ব্যাক বাটন হ্যান্ডেল করার জন্য (Android)
  useEffect(() => {
    const backAction = () => {
      if (currentView !== 'main') {
        setCurrentView('main');
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [currentView]);

  const longVideoOptions = [
      'Auto', '75p', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p (2K)', '2160p (4K)', '4320p (8K)'
  ];

  const shortVideoOptions = [
      'Anti Data Saver Mode', 'Low Video Quality', 'Normal Video Quality', 'High Video Quality 4k-8k'
  ];

  const cacheLimitOptions = [
      { label: '30 Minutes', value: 1800000, chip: '30m' },
      { label: '1 Hour (Default)', value: 3600000, chip: '1h' },
      { label: '2 Hours', value: 7200000, chip: '2h' },
      { label: '3 Hours', value: 10800000, chip: '3h' },
      { label: '6 Hours', value: 21600000, chip: '6h' },
      { label: '12 Hours', value: 43200000, chip: '12h' },
      { label: '24 Hours', value: 86400000, chip: '24h' }
  ];

  // অপশন সিলেক্ট করার পর সেভ করে মেইন স্ক্রিনে ফিরে আসবে
  const handleMainQualitySelect = (res) => {
    setIsLoading(true); 
    setTimeout(() => {
      global.appSettings.normalVideo = res; 
      setSelectedMainQuality(res);
      DeviceEventEmitter.emit('qualityChanged', res);
      setIsLoading(false); 
      setCurrentView('main');
    }, 800);
  };

  const handleShortQualitySelect = async (res) => {
    setIsLoading(true); 
    try {
      global.shortVideoQuality = res; 
      setSelectedShortQuality(res);
      await AsyncStorage.setItem('shortVideoQuality', res); 
    } catch (e) {}

    setTimeout(() => {
      setIsLoading(false);
      setCurrentView('main');
    }, 800);
  };

  const handleLocationSelect = (path) => {
    setIsLoading(true);
    setTimeout(() => {
      fetch(`${MY_API_SERVER}/api/set-download-location?path=${encodeURIComponent(path)}`)
        .then(() => {
          global.appSettings.downloadLocation = path;
          setSelectedLocation(path);
          setIsLoading(false);
          setCurrentView('main');
        })
        .catch(() => {
          setIsLoading(false);
          setCurrentView('main');
        });
    }, 800);
  };

  const handleCacheLimitSelect = (val) => {
    setIsLoading(true);
    setTimeout(() => {
      global.appSettings.shortsCacheLimit = val;
      setSelectedCacheLimit(val);
      setIsLoading(false);
      setCurrentView('main');
    }, 800);
  };

  // UI Helpers
  const getBadgeStyle = (type) => {
    switch(type) {
      case 'auto': return { color: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.12)', borderColor: 'rgba(0,229,160,0.2)' };
      case 'low': return { color: '#ff8080', backgroundColor: 'rgba(255,100,100,0.1)', borderColor: 'rgba(255,100,100,0.15)' };
      case 'mid': return { color: '#ffc850', backgroundColor: 'rgba(255,180,50,0.1)', borderColor: 'rgba(255,180,50,0.15)' };
      case 'high': return { color: '#6aabff', backgroundColor: 'rgba(61,139,255,0.12)', borderColor: 'rgba(61,139,255,0.2)' };
      case 'hd': return { color: '#a080ff', backgroundColor: 'rgba(124,92,252,0.12)', borderColor: 'rgba(124,92,252,0.2)' };
      case 'uhd': return { color: '#c0a0ff', backgroundColor: 'rgba(124,92,252,0.15)', borderColor: 'rgba(124,92,252,0.25)' };
      case '8k': return { color: '#ffcc00', backgroundColor: 'rgba(255,200,50,0.12)', borderColor: 'rgba(255,200,50,0.25)' };
      default: return { color: '#e8edf8', backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' };
    }
  };

  const getLongConfig = (opt) => {
    if(opt === 'Auto') return { badge: 'Auto', type: 'auto', desc: 'নেটওয়ার্ক অনুযায়ী স্বয়ংক্রিয়' };
    if(opt === '75p') return { badge: '75p', type: 'low', desc: 'সর্বনিম্ন ব্যান্ডউইথ' };
    if(opt === '144p') return { badge: '144p', type: 'low', desc: '' };
    if(opt === '240p') return { badge: '240p', type: 'mid', desc: '' };
    if(opt === '360p') return { badge: '360p', type: 'mid', desc: '' };
    if(opt === '480p') return { badge: '480p', type: 'high', desc: '' };
    if(opt === '720p') return { badge: '720p', type: 'high', desc: 'HD' };
    if(opt === '1080p') return { badge: '1080p', type: 'hd', desc: 'Full HD' };
    if(opt === '1440p (2K)') return { badge: '1440p', type: 'uhd', desc: '2K Resolution' };
    if(opt === '2160p (4K)') return { badge: '2160p', type: 'uhd', desc: '4K Resolution' };
    if(opt === '4320p (8K)') return { badge: '4320p', type: '8k', desc: 'সর্বোচ্চ মান' };
    return { badge: opt, type: 'auto', desc: '' };
  };

  const getShortConfig = (opt) => {
    if(opt === 'Anti Data Saver Mode') return { badge: '🛡️ Anti', type: 'low', desc: 'ডেটা সাশ্রয় বন্ধ রাখুন' };
    if(opt === 'Low Video Quality') return { badge: 'Low', type: 'low', desc: 'কম ডেটা ব্যবহার' };
    if(opt === 'Normal Video Quality') return { badge: 'Normal', type: 'high', desc: 'ভারসাম্যপূর্ণ মান ও ডেটা' };
    if(opt === 'High Video Quality 4k-8k') return { badge: '4K-8K', type: '8k', desc: '4K থেকে 8K সর্বোচ্চ রেজোলিউশন' };
    return { badge: 'Opt', type: 'auto', desc: '' };
  };

  // Main Screen Card Component
  const MainMenuCard = ({ icon, iconBg, title, subtitle, onPress }) => (
    <TouchableOpacity activeOpacity={0.8} style={styles.mainMenuCard} onPress={onPress}>
      <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={isDarkMode ? '#FFF' : '#111'} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={isDarkMode ? '#7b8db0' : '#556'} />
    </TouchableOpacity>
  );

  // Sub-screen Option Item
  const OptionItem = ({ label, desc, badge, badgeType, customBadge, selected, onPress }) => {
    const bStyle = getBadgeStyle(badgeType);
    return (
      <TouchableOpacity activeOpacity={0.7} style={[styles.optionItem, selected && styles.optionItemSelected]} onPress={onPress}>
        {selected && <View style={styles.activeIndicatorLine} />}
        <View style={styles.optionLeft}>
          {customBadge ? customBadge : (
            <View style={[styles.qualityBadge, { backgroundColor: bStyle.backgroundColor, borderColor: bStyle.borderColor }]}>
              <Text style={[styles.qualityBadgeText, { color: bStyle.color }]}>{badge}</Text>
            </View>
          )}
          <View style={{ marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
              {label.includes('Default') && <Text style={styles.tagDefault}>{__translate('Default')}</Text>}
            </View>
            {!!desc && <Text style={styles.optionDesc}>{desc}</Text>}
          </View>
        </View>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>
    );
  };

  // সাব-স্ক্রিনের হেডার
  const SubScreenHeader = ({ title }) => (
    <View style={styles.subScreenHeader}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentView('main')}>
        <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#e8edf8' : '#111'} />
      </TouchableOpacity>
      <Text style={styles.subScreenTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      
      {/* ---------------- MAIN VIEW ---------------- */}
      {currentView === 'main' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('videoSettings') || '⚙️ Video Settings'}</Text>
            <Text style={styles.headerSubtitle}>{t('videoSettingsDesc') || 'আপনার পছন্দমতো কাস্টমাইজ করুন'}</Text>
          </View>

          <View style={styles.settingsContainer}>
            <MainMenuCard 
              icon="tv-outline" iconBg="#1a3a6e" title={__translate('Long Video Quality')} subtitle={selectedMainQuality}
              onPress={() => setCurrentView('longVideo')}
            />
            <MainMenuCard 
              icon="phone-portrait-outline" iconBg="#2d1a5c" title={__translate('Shorts Video Quality')} subtitle={selectedShortQuality}
              onPress={() => setCurrentView('shortVideo')}
            />
            <MainMenuCard 
              icon="folder-open-outline" iconBg="#0d3d28" title={__translate('Download Location')} subtitle={selectedLocation.split('/').pop() || 'MyTube'}
              onPress={() => setCurrentView('location')}
            />
            <MainMenuCard 
              icon="time-outline" iconBg="#3d2200" title={__translate('Shorts Cache Limit')} subtitle={__translate('ক্যাশ সময়সীমা নির্ধারণ করুন')}
              onPress={() => setCurrentView('cacheLimit')}
            />
          </View>
          <Text style={styles.bottomNote}>{__translate('সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়')}</Text>
        </ScrollView>
      )}

      {/* ---------------- LONG VIDEO SUB-SCREEN ---------------- */}
      {currentView === 'longVideo' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Long Video Quality')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {longVideoOptions.map((opt, index) => {
                const conf = getLongConfig(opt);
                return (
                  <View key={index}>
                    <OptionItem 
                      label={opt.replace(' (2K)', '').replace(' (4K)', '').replace(' (8K)', '')} 
                      desc={conf.desc} badge={conf.badge} badgeType={conf.type}
                      selected={selectedMainQuality === opt} onPress={() => handleMainQualitySelect(opt)} 
                    />
                    {index < longVideoOptions.length - 1 && <View style={styles.optionDivider} />}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ---------------- SHORT VIDEO SUB-SCREEN ---------------- */}
      {currentView === 'shortVideo' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Shorts Video Quality')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {shortVideoOptions.map((opt, index) => {
                const conf = getShortConfig(opt);
                return (
                  <View key={index}>
                    <OptionItem 
                      label={opt} desc={conf.desc} badge={conf.badge} badgeType={conf.type}
                      selected={selectedShortQuality === opt} onPress={() => handleShortQualitySelect(opt)} 
                    />
                    {index < shortVideoOptions.length - 1 && <View style={styles.optionDivider} />}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ---------------- DOWNLOAD LOCATION SUB-SCREEN ---------------- */}
      {currentView === 'location' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Download Location')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {downloadLocations.map((loc, index) => {
                const isPhone = loc.label.includes('Phone');
                const CustomIcon = () => (
                  <View style={styles.storageIconWrapper}>
                    <Text style={{ fontSize: 16 }}>{isPhone ? '📱' : '📂'}</Text>
                  </View>
                );
                return (
                  <View key={index}>
                    <OptionItem 
                      label={loc.label} desc={isPhone ? 'ডিভাইসের অভ্যন্তরীণ স্টোরেজ' : loc.path} 
                      customBadge={<CustomIcon />} selected={selectedLocation === loc.path} onPress={() => handleLocationSelect(loc.path)} 
                    />
                    {index < downloadLocations.length - 1 && <View style={styles.optionDivider} />}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ---------------- CACHE LIMIT SUB-SCREEN ---------------- */}
      {currentView === 'cacheLimit' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Cache Limit Time')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {cacheLimitOptions.map((opt, index) => {
                const CustomTimeChip = () => (
                  <View style={styles.timeChip}>
                    <Text style={styles.timeChipText}>{opt.chip}</Text>
                  </View>
                );
                return (
                  <View key={index}>
                    <OptionItem 
                      label={opt.label.replace(' (Default)', '')} desc="" 
                      customBadge={<CustomTimeChip />} selected={selectedCacheLimit === opt.value} onPress={() => handleCacheLimitSelect(opt.value)} 
                    />
                    {index < cacheLimitOptions.length - 1 && <View style={styles.optionDivider} />}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3d8bff" />
            <Text style={styles.loadingText}>{__translate('Applying Settings...')}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const getDynamicStyles = (isDark) => ({
  container: { flex: 1, backgroundColor: isDark ? '#0a0d14' : '#F7F7F8' },
  scrollContent: { paddingBottom: 40, paddingTop: 10 },
  
  headerTitleContainer: { alignItems: 'center', marginBottom: 25, marginTop: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#e8edf8' : '#111', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 12, color: isDark ? '#4a5568' : '#666', marginTop: 4 },
  
  settingsContainer: { paddingHorizontal: 16, gap: 12 },
  
  mainMenuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#161c2d' : '#fff', borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: isDark ? '#e8edf8' : '#111' },
  sectionSubtitle: { fontSize: 12, color: isDark ? '#7b8db0' : '#666', marginTop: 4 },
  
  subScreenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 15, backgroundColor: isDark ? '#161c2d' : '#fff', borderBottomWidth: 1, borderBottomColor: isDark ? '#1e2a42' : '#e6e6e6' },
  backButton: { padding: 10 },
  subScreenTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#e8edf8' : '#111' },
  subListContent: { padding: 16, paddingBottom: 40 },
  
  optionsWrapper: { backgroundColor: isDark ? '#161c2d' : '#fff', borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6', overflow: 'hidden' },
  
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, position: 'relative' },
  optionItemSelected: { backgroundColor: isDark ? 'rgba(61,139,255,0.06)' : 'rgba(61,139,255,0.04)' },
  activeIndicatorLine: { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, backgroundColor: '#3d8bff', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  
  qualityBadge: { minWidth: 46, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qualityBadgeText: { fontSize: 11, fontWeight: 'bold' },
  
  optionLabel: { fontSize: 14, color: isDark ? '#e8edf8' : '#111' },
  optionLabelSelected: { color: isDark ? '#c8d8ff' : '#234', fontWeight: 'bold' },
  optionDesc: { fontSize: 11, color: isDark ? '#7b8db0' : '#666', marginTop: 3 },
  
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isDark ? '#1e2a42' : '#e6e6e6', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected: { borderColor: '#3d8bff' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3d8bff' },
  
  optionDivider: { height: 1, backgroundColor: isDark ? '#1e2a42' : '#e6e6e6', opacity: 0.5, marginHorizontal: 16 },
  
  tagDefault: { fontSize: 10, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 4, backgroundColor: 'rgba(255,200,50,0.1)', color: '#ffcc50', borderColor: 'rgba(255,200,50,0.2)', borderWidth: 1, marginLeft: 8, overflow: 'hidden' },
  
  storageIconWrapper: { width: 30, alignItems: 'center' },
  
  timeChip: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6' },
  timeChipText: { fontSize: 11, color: isDark ? '#7b8db0' : '#666' },
  
  bottomNote: { textAlign: 'center', fontSize: 11, color: isDark ? '#4a5568' : '#666', marginTop: 15, opacity: 0.8 },
  
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: isDark ? '#161c2d' : '#fff', padding: 25, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6' },
  loadingText: { color: isDark ? '#e8edf8' : '#111', marginTop: 15, fontSize: 15, fontWeight: 'bold' }
});
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

global.appSettings = global.appSettings || {};
global.appSettings.normalVideo = global.appSettings.normalVideo || 'Auto'; 
global.shortVideoQuality = global.shortVideoQuality || 'Normal Video Quality';
global.appSettings.downloadLocation = global.appSettings.downloadLocation || '/storage/emulated/0/MyTube';
global.appSettings.shortsCacheLimit = global.appSettings.shortsCacheLimit || 3600000;

const MY_API_SERVER = "http://127.0.0.1:10000";

export default function SettingsScreen() {
  const [isMainQualityExpanded, setIsMainQualityExpanded] = useState(false);
  const [selectedMainQuality, setSelectedMainQuality] = useState(global.appSettings.normalVideo);

  const [isShortQualityExpanded, setIsShortQualityExpanded] = useState(false);
  const [selectedShortQuality, setSelectedShortQuality] = useState(global.shortVideoQuality);

  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [downloadLocations, setDownloadLocations] = useState([{ label: 'Phone Memory', path: '/storage/emulated/0/MyTube' }]);
  const [selectedLocation, setSelectedLocation] = useState(global.appSettings.downloadLocation);

  const [isCacheLimitExpanded, setIsCacheLimitExpanded] = useState(false);
  const [selectedCacheLimit, setSelectedCacheLimit] = useState(global.appSettings.shortsCacheLimit);

  const [isLoading, setIsLoading] = useState(false);

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

  const handleMainQualitySelect = (res) => {
    setIsLoading(true); 
    setTimeout(() => {
      global.appSettings.normalVideo = res; 
      setSelectedMainQuality(res);
      DeviceEventEmitter.emit('qualityChanged', res);
      setIsLoading(false); 
    }, 800);
  };

  const handleShortQualitySelect = async (res) => {
    setIsLoading(true); 
    try {
      global.shortVideoQuality = res; 
      setSelectedShortQuality(res);
      await AsyncStorage.setItem('shortVideoQuality', res); 
    } catch (e) {}

    setTimeout(() => setIsLoading(false), 800);
  };

  const handleLocationSelect = (path) => {
    setIsLoading(true);
    setTimeout(() => {
      fetch(`${MY_API_SERVER}/api/set-download-location?path=${encodeURIComponent(path)}`)
        .then(() => {
          global.appSettings.downloadLocation = path;
          setSelectedLocation(path);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    }, 800);
  };

  const handleCacheLimitSelect = (val) => {
    setIsLoading(true);
    setTimeout(() => {
      global.appSettings.shortsCacheLimit = val;
      setSelectedCacheLimit(val);
      setIsLoading(false);
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

  const SectionCard = ({ icon, iconBg, title, subtitle, expanded, onPress, children }) => (
    <View style={[styles.section, expanded && styles.sectionExpanded]}>
      <TouchableOpacity activeOpacity={0.8} style={styles.sectionHeader} onPress={onPress}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color="#FFF" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#7b8db0" />
      </TouchableOpacity>
      {expanded && <View style={styles.optionsList}>{children}</View>}
    </View>
  );

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
              {label.includes('Default') && <Text style={styles.tagDefault}>Default</Text>}
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>⚙️ Video Settings</Text>
          <Text style={styles.headerSubtitle}>আপনার পছন্দমতো কাস্টমাইজ করুন</Text>
        </View>

        <View style={styles.settingsContainer}>
          
          {/* 1. Long Video Quality */}
          <SectionCard 
            icon="tv-outline" iconBg="#1a3a6e" title="Long Video Quality" subtitle="স্বাভাবিক ভিডিওর মান নির্বাচন করুন"
            expanded={isMainQualityExpanded} onPress={() => setIsMainQualityExpanded(!isMainQualityExpanded)}
          >
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
          </SectionCard>

          {/* 2. Shorts Video Quality */}
          <SectionCard 
            icon="phone-portrait-outline" iconBg="#2d1a5c" title="Shorts Video Quality" subtitle="শর্টস ভিডিওর মান নির্বাচন করুন"
            expanded={isShortQualityExpanded} onPress={() => setIsShortQualityExpanded(!isShortQualityExpanded)}
          >
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
          </SectionCard>

          {/* 3. Download Location */}
          <SectionCard 
            icon="folder-open-outline" iconBg="#0d3d28" title="Download Location" subtitle="ডাউনলোড ফোল্ডার বেছে নিন"
            expanded={isLocationExpanded} onPress={() => setIsLocationExpanded(!isLocationExpanded)}
          >
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
          </SectionCard>

          {/* 4. Shorts Cache Limit */}
          <SectionCard 
            icon="time-outline" iconBg="#3d2200" title="Shorts Cache Limit Time" subtitle="শর্টস ভিডিও ক্যাশ সময়সীমা"
            expanded={isCacheLimitExpanded} onPress={() => setIsCacheLimitExpanded(!isCacheLimitExpanded)}
          >
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
          </SectionCard>

        </View>
        <Text style={styles.bottomNote}>সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়</Text>
      </ScrollView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3d8bff" />
            <Text style={styles.loadingText}>Applying Settings...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0d14' },
  scrollContent: { paddingBottom: 40, paddingTop: 10 },
  
  headerTitleContainer: { alignItems: 'center', marginBottom: 25, marginTop: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#e8edf8', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 12, color: '#4a5568', marginTop: 4 },
  
  settingsContainer: { paddingHorizontal: 16, gap: 16 },
  
  section: { backgroundColor: '#161c2d', borderWidth: 1, borderColor: '#1e2a42', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  sectionExpanded: { borderColor: 'rgba(61,139,255,0.25)' },
  
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#1a1f30' },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#e8edf8' },
  sectionSubtitle: { fontSize: 11, color: '#7b8db0', marginTop: 2 },
  
  optionsList: { paddingVertical: 6 },
  
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, position: 'relative' },
  optionItemSelected: { backgroundColor: 'rgba(61,139,255,0.06)' },
  activeIndicatorLine: { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, backgroundColor: '#3d8bff', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  
  qualityBadge: { minWidth: 46, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qualityBadgeText: { fontSize: 11, fontWeight: 'bold' },
  
  optionLabel: { fontSize: 13.5, color: '#e8edf8' },
  optionLabelSelected: { color: '#c8d8ff', fontWeight: 'bold' },
  optionDesc: { fontSize: 11, color: '#7b8db0', marginTop: 2 },
  
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#1e2a42', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected: { borderColor: '#3d8bff' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3d8bff' },
  
  optionDivider: { height: 1, backgroundColor: '#1e2a42', opacity: 0.5, marginHorizontal: 16 },
  
  tagDefault: { fontSize: 10, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 4, backgroundColor: 'rgba(255,200,50,0.1)', color: '#ffcc50', borderColor: 'rgba(255,200,50,0.2)', borderWidth: 1, marginLeft: 8, overflow: 'hidden' },
  
  storageIconWrapper: { width: 30, alignItems: 'center' },
  
  timeChip: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: '#1e2a42' },
  timeChipText: { fontSize: 11, color: '#7b8db0' },
  
  bottomNote: { textAlign: 'center', fontSize: 11, color: '#4a5568', marginTop: 15, opacity: 0.8 },
  
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: '#161c2d', padding: 25, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: '#1e2a42' },
  loadingText: { color: '#e8edf8', marginTop: 15, fontSize: 15, fontWeight: 'bold' }
});
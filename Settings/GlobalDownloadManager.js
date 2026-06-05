import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, Alert, Animated, PanResponder, Dimensions, Modal, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Theme & Language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BADGE_SIZE = 60;
const MY_API_SERVER = "http://127.0.0.1:10000";

const timeAgoBn = (timestamp) => {
  if (!timestamp) return "";
  const now = Date.now();
  const past = new Date(timestamp).getTime();
  if (isNaN(past)) return timestamp; 

  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "এইমাত্র";
  if (diffMins < 60) return `${diffMins} মিনিট পূর্বে`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ঘন্টা পূর্বে`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} দিন পূর্বে`;
};

export default function GlobalDownloadManager() {
    const navigation = useNavigation();
    const { isDarkMode } = useTheme();
    const { t } = useLanguage();

    // =====================================
    // State Management
    // =====================================
    const [downloads, setDownloads] = useState([]);
    const [isScreenVisible, setIsScreenVisible] = useState(false); // Modal State
    
    // Badge States
    const [activeCount, setActiveCount] = useState(0);
    const [isBadgeVisible, setIsBadgeVisible] = useState(false);
    const dismissedCountRef = useRef(0); 

    const pan = useRef(new Animated.ValueXY({ x: 20, y: SCREEN_HEIGHT - 150 })).current;

    // =====================================
    // Data Loading & Syncing
    // =====================================
    const loadDownloads = async () => {
        try {
            const data = await AsyncStorage.getItem('recorded_downloads');
            if (data) {
                let parsed = JSON.parse(data);
                parsed = parsed.filter(item => item && item.id && item.title);
                setDownloads(parsed);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        loadDownloads();

        // 🎯 অ্যাপের যেকোনো জায়গা থেকে ডাউনলোড স্ক্রিন ওপেন করার জন্য ইভেন্ট লিসেনার
        const openEvent = DeviceEventEmitter.addListener('openDownloadScreen', () => {
            setIsScreenVisible(true);
            loadDownloads();
        });

        return () => openEvent.remove();
    }, []);

    // 🎯 একক ইন্টারভ্যাল: ভাসমান আইকন এবং লিস্ট উভয়কেই লাইভ আপডেট করবে
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${MY_API_SERVER}/api/progress`);
                const data = await res.json();
                const active = data.activeDownloads || {};

                const count = Object.keys(active).filter(k => active[k].status !== 'error' && active[k].status !== 'completed').length;
                setActiveCount(count);

                // আইকন ভাসানোর লজিক (স্ক্রিন ওপেন থাকলে ভাসবে না)
                if (!isScreenVisible) {
                    if (count > dismissedCountRef.current) {
                        setIsBadgeVisible(true);
                        dismissedCountRef.current = count; 
                        Animated.spring(pan, { toValue: { x: 20, y: SCREEN_HEIGHT - 150 }, useNativeDriver: false }).start();
                    } else if (count === 0) {
                        setIsBadgeVisible(false);
                        dismissedCountRef.current = 0;
                    }
                }

                // লিস্ট আপডেট লজিক
                setDownloads(prevDownloads => {
                    let needsSave = false;
                    let updatedList = [...prevDownloads];

                    Object.keys(active).forEach(id => {
                        const activeItem = active[id];
                        const existsIndex = updatedList.findIndex(d => d.id === id);

                        if (existsIndex === -1 && activeItem.status !== 'error') {
                            updatedList.unshift({
                                id: id, videoId: activeItem.videoId || id, title: activeItem.title || 'Downloading...', 
                                thumbnail: activeItem.thumbnail || `https://ui-avatars.com/api/?name=DL&background=00BFA5&color=fff&size=150`, 
                                quality: activeItem.quality || 'N/A', type: activeItem.type || 'Media', 
                                date: Date.now(), progress: activeItem.progress || '0', speed: activeItem.speed || '0 KB/s',
                                eta: activeItem.eta || '--:--', isCompleted: activeItem.status === 'completed', localUri: activeItem.localUrl || null
                            });
                            needsSave = true;
                        } else if (existsIndex !== -1) {
                            const item = {...updatedList[existsIndex]}; 
                            if (activeItem.status === 'completed' && !item.isCompleted) {
                                item.progress = '100'; item.isCompleted = true; item.localUri = activeItem.localUrl; item.date = Date.now(); needsSave = true;
                                fetch(`${MY_API_SERVER}/api/clear-progress?id=${id}`).catch(()=>{}); 
                            } else if (activeItem.status === 'error' && !item.isError) {
                                item.isError = true; needsSave = true;
                            } else {
                                if (item.progress !== activeItem.progress || item.speed !== activeItem.speed) {
                                    item.progress = activeItem.progress; item.speed = activeItem.speed; item.eta = activeItem.eta;
                                }
                            }
                            updatedList[existsIndex] = item;
                        }
                    });

                    if (needsSave) AsyncStorage.setItem('recorded_downloads', JSON.stringify(updatedList)).catch(()=>{});
                    return updatedList;
                });
            } catch(e) {}
        }, 1000);

        return () => clearInterval(interval);
    }, [isScreenVisible]);

    // =====================================
    // Badge Gestures
    // =====================================
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
            onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (_, gestureState) => {
                pan.flattenOffset();
                if (pan.x._value < -20 || pan.x._value > SCREEN_WIDTH - BADGE_SIZE + 20 || pan.y._value < -20 || pan.y._value > SCREEN_HEIGHT - BADGE_SIZE + 20 || Math.abs(gestureState.vx) > 1.5 || Math.abs(gestureState.vy) > 1.5) {
                    setIsBadgeVisible(false); dismissedCountRef.current = activeCount; 
                } else {
                    let safeX = pan.x._value < 0 ? 10 : (pan.x._value > SCREEN_WIDTH - BADGE_SIZE ? SCREEN_WIDTH - BADGE_SIZE - 10 : pan.x._value);
                    let safeY = pan.y._value < 50 ? 50 : (pan.y._value > SCREEN_HEIGHT - BADGE_SIZE - 50 ? SCREEN_HEIGHT - BADGE_SIZE - 50 : pan.y._value);
                    Animated.spring(pan, { toValue: { x: safeX, y: safeY }, friction: 5, useNativeDriver: false }).start();
                }
            }
        })
    ).current;

    // =====================================
    // Screen Actions
    // =====================================
    const deleteDownload = async (id) => {
        Alert.alert("মুছে ফেলুন", "আপনি কি এই ডাউনলোডের রেকর্ডটি মুছে ফেলতে চান?", [
            { text: "না", style: "cancel" },
            { text: "হ্যাঁ", onPress: async () => {
                const newList = downloads.filter(item => item.id !== id);
                setDownloads(newList);
                await AsyncStorage.setItem('recorded_downloads', JSON.stringify(newList));
            }}
        ]);
    };

    const cancelActiveDownload = async (id) => {
        Alert.alert("Cancel Download", "আপনি কি এই চলমান ডাউনলোডটি বাতিল করতে চান?", [
            { text: "না", style: "cancel" },
            { text: "হ্যাঁ", onPress: async () => {
                await fetch(`${MY_API_SERVER}/api/cancel-download?id=${id}`).catch(()=>{});
                const newList = downloads.filter(item => item.id !== id);
                setDownloads(newList);
                await AsyncStorage.setItem('recorded_downloads', JSON.stringify(newList));
            }}
        ]);
    };

    const handlePlayVideo = (item) => {
        if (!item.isCompleted) return;
        setIsScreenVisible(false); // প্লেয়ারে যাওয়ার আগে লিস্ট স্ক্রিন বন্ধ করতে হবে
        navigation.navigate('Player', {
            videoId: item.videoId,
            videoData: { id: item.videoId, title: item.title, channel: 'Downloaded File', thumbnail: item.thumbnail, localUri: item.localUri, type: item.type }
        });
    };

    const activeDownloads = downloads.filter(d => !d.isCompleted && !d.isError);
    const completedDownloads = downloads.filter(d => d.isCompleted);

    // =====================================
    // UI Rendering
    // =====================================
    return (
        <>
            {/* 🎯 ভাসমান আইকন */}
            {isBadgeVisible && !isScreenVisible && activeCount > 0 && (
                <Animated.View {...panResponder.panHandlers} style={[styles.badgeContainer, { transform: pan.getTranslateTransform() }]}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => { setIsBadgeVisible(false); setIsScreenVisible(true); }} style={styles.badge}>
                        <Ionicons name="download" size={28} color="#FFF" />
                        <View style={styles.countCircle}><Text style={styles.countText}>{activeCount}</Text></View>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* 🎯 গ্লোবাল ডাউনলোড স্ক্রিন (Modal) */}
            <Modal visible={isScreenVisible} animationType="slide" onRequestClose={() => setIsScreenVisible(false)}>
                <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#0F0F0F' : '#F9F9F9' }]}>
                    <StatusBar backgroundColor={isDarkMode ? '#0F0F0F' : '#FFFFFF'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
                    
                    <View style={[styles.header, { backgroundColor: isDarkMode ? '#0F0F0F' : '#FFFFFF', borderBottomColor: isDarkMode ? '#222' : '#E5E5E5' }]}>
                        <TouchableOpacity onPress={() => setIsScreenVisible(false)} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#000' }]}>মাই ডাউনলোড লিস্ট</Text>
                        <View style={{ width: 24 }} /> 
                    </View>

                    <FlatList 
                        data={completedDownloads}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.list}
                        ListHeaderComponent={
                            activeDownloads.length > 0 ? (
                                <View style={{ marginBottom: 15 }}>
                                    <Text style={styles.sectionTitle}>চলমান ডাউনলোড ({activeDownloads.length})</Text>
                                    {activeDownloads.map(item => (
                                        <View key={item.id} style={styles.activeCard}>
                                            <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                                            <View style={styles.info}>
                                                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                                                <Text style={styles.metaSpeed}>স্পিড: {item.speed || '0 KB/s'} • বাকি: {item.eta || '--:--'}</Text>
                                                <Text style={styles.metaPercentage}>ডাউনলোড হচ্ছে... {item.progress || 0}%</Text>
                                                <View style={styles.progressBarBg}>
                                                    <View style={[styles.progressBarFill, { width: `${parseFloat(item.progress) || 0}%` }]} />
                                                </View>
                                            </View>
                                            <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelActiveDownload(item.id)}>
                                                <Ionicons name="close" size={28} color="#FF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                    <View style={styles.divider} />
                                </View>
                            ) : null
                        }
                        renderItem={({ item }) => (
                            <View style={styles.card}>
                                <TouchableOpacity style={styles.cardMain} activeOpacity={0.8} onPress={() => handlePlayVideo(item)}>
                                    {item.type === 'audio' ? (
                                        <View style={styles.splitThumbContainer}>
                                            <Image source={{ uri: item.thumbnail }} style={styles.halfThumb} />
                                            <View style={styles.halfIcon}><Ionicons name="musical-notes" size={30} color="#00BFA5" /></View>
                                        </View>
                                    ) : (
                                        <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                                    )}
                                    <View style={styles.info}>
                                        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                                        <Text style={styles.meta}>{item.quality} • {item.type?.toUpperCase()} • {timeAgoBn(item.date)}</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDownload(item.id)}>
                                    <Ionicons name="trash-outline" size={22} color="#FF4444" />
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={
                            activeDownloads.length === 0 && completedDownloads.length === 0 && (
                                <View style={styles.empty}>
                                    <Ionicons name="download-outline" size={80} color="#333" />
                                    <Text style={styles.emptyText}>{__translate('কোনো ডাউনলোড পাওয়া যায়নি')}</Text>
                                </View>
                            )
                        }
                    />
                </SafeAreaView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    badgeContainer: { position: 'absolute', zIndex: 999999, elevation: 10 },
    badge: { width: BADGE_SIZE, height: BADGE_SIZE, backgroundColor: '#00BFA5', borderRadius: BADGE_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, borderWidth: 2, borderColor: '#FFF' },
    countCircle: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF0000', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFF' },
    countText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
    
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 15, borderBottomWidth: 1 },
    backBtn: { padding: 5 },
    headerTitle: { fontSize: 20, fontWeight: 'bold' },
    
    list: { padding: 10 },
    sectionTitle: { color: '#00BFA5', fontSize: 16, fontWeight: 'bold', marginBottom: 10, marginLeft: 5 },
    activeCard: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderColor: '#00BFA5', borderWidth: 1 },
    cancelBtn: { paddingLeft: 10 },
    
    card: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 10, marginBottom: 12, overflow: 'hidden', alignItems: 'center' },
    cardMain: { flex: 1, flexDirection: 'row', padding: 10 },
    thumb: { width: 120, height: 68, borderRadius: 6, backgroundColor: '#333' },
    splitThumbContainer: { width: 120, height: 68, borderRadius: 6, backgroundColor: '#222', flexDirection: 'row', overflow: 'hidden' },
    halfThumb: { width: '50%', height: '100%', backgroundColor: '#333' },
    halfIcon: { width: '50%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    
    info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    title: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
    metaSpeed: { color: '#00BFA5', fontSize: 11, marginBottom: 2, fontWeight: 'bold' },
    metaPercentage: { color: '#AAA', fontSize: 11, marginBottom: 5 },
    meta: { color: '#AAA', fontSize: 12, marginBottom: 5 },
    progressBarBg: { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden', width: '100%', marginTop: 2 },
    progressBarFill: { height: '100%', backgroundColor: '#00BFA5' },
    deleteBtn: { padding: 15 },
    divider: { height: 1, backgroundColor: '#333', marginVertical: 10 },
    
    empty: { flex: 1, marginTop: 100, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: '#555', fontSize: 16, marginTop: 15 }
});
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as NavigationBar from 'expo-navigation-bar'; // [NEW] ইমপোর্ট করা হলো

import { ThemeProvider, useTheme } from './ThemeContext'; 
import { LanguageProvider } from './LanguageContext'; 

// ==========================================
// ১. Screens ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import livescreen from './Screens/livescreen'; 

// ==========================================
// ২. Settings ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import downloadscreen from './Settings/downloadscreen'; 
import SearchSetting from './Settings/searchsetting';
import GlobalPlayer from './Settings/GlobalPlayer'; 

const Stack = createStackNavigator();

function MainApp() {
  const { isDarkMode } = useTheme();

  // [ULTIMATE FIX]: React Navigation যেন কালার সাদা না করে দেয়, তাই এখানে আবার ফোর্স করা হলো
  useEffect(() => {
    if (Platform.OS === 'android') {
      const bgColor = isDarkMode ? '#0a0a0a' : '#ffffff';
      NavigationBar.setBackgroundColorAsync(bgColor).catch(() => {});
      NavigationBar.setButtonStyleAsync(isDarkMode ? 'light' : 'dark').catch(() => {});
    }
  }, [isDarkMode]);

  return (
    // পেছনের ব্যাকগ্রাউন্ড কালার ডায়নামিক করা হলো
    <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0a0a0a' : '#ffffff' }}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Home"
          screenOptions={{
            cardStyle: { backgroundColor: isDarkMode ? '#0F0F0F' : '#F5F5F5' },
            headerShown: false
          }}
        >
          {/* মূল স্ক্রিনসমূহ */}
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Channel" component={ChannelScreen} />
          <Stack.Screen name="Player" component={PlayerScreen} />
          <Stack.Screen name="Playlist" component={PlaylistPage} />
          <Stack.Screen name="Shorts" component={ShortsScreen} />

          {/* সেটিংস এবং হিস্টোরি */}
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="History" component={HistoryPage} />
          <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />

          {/* অন্যান্য স্ক্রিনগুলো */}
          <Stack.Screen name="searchsettings" component={SearchSetting} />
          <Stack.Screen name="Downloads" component={downloadscreen} />
          <Stack.Screen name="Live" component={livescreen} />

        </Stack.Navigator>

        {/* গ্লোবাল প্লেয়ার */}
        <GlobalPlayer />

      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <MainApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}
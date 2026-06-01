import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as NavigationBar from 'expo-navigation-bar';

import { ThemeProvider, useTheme } from './ThemeContext'; 
import { LanguageProvider } from './LanguageContext'; 

// Screens
import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import livescreen from './Screens/livescreen'; 

// Settings
import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import downloadscreen from './Settings/downloadscreen'; 
import SearchSetting from './Settings/searchsetting';
import GlobalPlayer from './Settings/GlobalPlayer'; 

const Stack = createStackNavigator();

function MainApp() {
  const { isDarkMode } = useTheme();

  // React Navigation যেন কালার সাদা না করে দেয়
  useEffect(() => {
    if (Platform.OS === 'android') {
      const bgColor = isDarkMode ? '#0a0a0a' : '#ffffff';
      NavigationBar.setBackgroundColorAsync(bgColor).catch(() => {});
      
      // এখানেও বাটন কালো করার জন্য 'dark' দেওয়া হলো
      NavigationBar.setButtonStyleAsync('dark').catch(() => {});
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
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Channel" component={ChannelScreen} />
          <Stack.Screen name="Player" component={PlayerScreen} />
          <Stack.Screen name="Playlist" component={PlaylistPage} />
          <Stack.Screen name="Shorts" component={ShortsScreen} />

          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="History" component={HistoryPage} />
          <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
          <Stack.Screen name="searchsettings" component={SearchSetting} />
          <Stack.Screen name="Downloads" component={downloadscreen} />
          <Stack.Screen name="Live" component={livescreen} />
        </Stack.Navigator>

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
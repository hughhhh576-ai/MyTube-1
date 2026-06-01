import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native'; // [NEW] View ইমপোর্ট করা হলো
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { ThemeProvider, useTheme } from './ThemeContext'; 
import { LanguageProvider } from './LanguageContext'; 

import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import livescreen from './Screens/livescreen'; 

import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import downloadscreen from './Settings/downloadscreen'; 
import SearchSetting from './Settings/searchsetting';
import GlobalPlayer from './Settings/GlobalPlayer'; 

const Stack = createStackNavigator();

function MainApp() {
  const { isDarkMode } = useTheme();

  return (
    /* [FIX]: ইন্টারনেটের সলিউশন অনুযায়ী পুরো অ্যাপকে একটি ডায়নামিক ব্যাকগ্রাউন্ড View দিয়ে মুড়িয়ে দেওয়া হলো */
    <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0a0a0a' : '#FFFFFF' }}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Home"
          screenOptions={{
            cardStyle: { backgroundColor: isDarkMode ? '#000000' : '#F5F5F5' },
            headerShown: false // সব স্ক্রিনের ডিফল্ট হেডার রিমুভ করা হলো
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
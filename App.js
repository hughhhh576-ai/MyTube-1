import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// ==========================================
// গ্লোবাল কনটেক্সট ইমপোর্ট
// ==========================================
import { ThemeProvider } from './ThemeContext'; 
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

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <NavigationContainer>
          <Stack.Navigator 
            initialRouteName="Home"
            screenOptions={{
              cardStyle: { backgroundColor: '#000000' } // ডার্ক থিমের জন্য
            }}
          >
            {/* মূল স্ক্রিনসমূহ */}
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Channel" component={ChannelScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Playlist" component={PlaylistPage} options={{ headerShown: false }} />
            <Stack.Screen name="Shorts" component={ShortsScreen} options={{ headerShown: false }} />

            {/* সেটিংস এবং হিস্টোরি */}
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="History" component={HistoryPage} options={{ headerShown: false }} />
            <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />

            {/* সার্চ অপশন */}
            <Stack.Screen name="searchsettings" component={SearchSetting} options={{ headerShown: false }} />

            {/* অন্যান্য স্ক্রিনগুলো */}
            <Stack.Screen name="Downloads" component={downloadscreen} options={{ headerShown: false }} />
            <Stack.Screen name="Live" component={livescreen} options={{ headerShown: false }} />

          </Stack.Navigator>

          {/* এই প্লেয়ারটি সব স্ক্রিনের উপরে ভাসবে এবং কখনো আনমাউন্ট হবে না */}
          <GlobalPlayer />

        </NavigationContainer>
      </LanguageProvider>
    </ThemeProvider>
  );
}
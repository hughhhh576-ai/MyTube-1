import React, { createContext, useState, useEffect, useContext } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // সিস্টেম নেভিগেশন বারের কালার ফোর্স আপডেট করার ফাংশন
  const updateSystemNav = async (isDark) => {
    if (Platform.OS === 'android') {
      try {
        const bgColor = isDark ? '#0a0a0a' : '#ffffff';
        await NavigationBar.setBackgroundColorAsync(bgColor);
        
        // বাটনগুলো সবসময় কালো রাখার জন্য 'dark' করে দেওয়া হলো
        await NavigationBar.setButtonStyleAsync('dark'); 
      } catch (error) {
        console.log("Nav bar error:", error);
      }
    }
  };

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('appTheme');
        const isDark = savedTheme !== null ? savedTheme === 'dark' : true;
        setIsDarkMode(isDark);
        
        // অ্যাপ লোড হওয়ার সময় নেভিগেশন ওভাররাইড ঠেকানোর জন্য 100ms ডিলিট (Delay)
        setTimeout(() => {
          updateSystemNav(isDark);
        }, 100);
      } catch (e) {}
    };
    loadTheme();
  }, []);

  const toggleDarkMode = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    await AsyncStorage.setItem('appTheme', newTheme ? 'dark' : 'light');
    updateSystemNav(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
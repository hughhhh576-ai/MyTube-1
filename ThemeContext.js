import React, { createContext, useState, useEffect, useContext } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // সিস্টেম নেভিগেশন বারের কালার আপডেট করার স্ট্যান্ডার্ড ফাংশন
  const updateSystemNav = async (isDark) => {
    if (Platform.OS === 'android') {
      try {
        // ডার্ক মোডে কালো (#0a0a0a) এবং লাইট মোডে সাদা (#FFFFFF)
        const bgColor = isDark ? '#0a0a0a' : '#FFFFFF';
        
        await NavigationBar.setBackgroundColorAsync(bgColor);
        await NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      } catch (error) {
        console.log("Nav bar error:", error);
      }
    }
  };

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('appTheme');
        if (savedTheme !== null) {
          const isDark = savedTheme === 'dark';
          setIsDarkMode(isDark);
          updateSystemNav(isDark);
        } else {
          updateSystemNav(true);
        }
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
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LanguageContext = createContext();

const translations = {
  en: {
    home: "Home", shorts: "Shorts", live: "Live", me: "ME", search: "Search...", menu: "MENU",
    history: "History", historyDesc: "Recently watched videos",
    download: "Download", downloadDesc: "Offline saved videos",
    subscribe: "My Subscribe", subscribeDesc: "Channels you follow",
    playlist: "My Playlist", playlistDesc: "Your curated collections",
    settings: "Settings", settingsDesc: "App preferences & privacy",
    darkMode: "Dark Mode", darkModeDesc: "Switch app theme",
    language: "Language", languageDesc: "Change app language"
  },
  bn: {
    home: "হোম", shorts: "শর্টস", live: "লাইভ", me: "মি", search: "সার্চ...", menu: "মেন্যু",
    history: "হিস্ট্রি", historyDesc: "সম্প্রতি দেখা ভিডিও",
    download: "ডাউনলোড", downloadDesc: "অফলাইন সেভ করা ভিডিও",
    subscribe: "সাবস্ক্রাইব", subscribeDesc: "আপনার ফলো করা চ্যানেল",
    playlist: "প্লেলিস্ট", playlistDesc: "আপনার সংগ্রহ",
    settings: "সেটিংস", settingsDesc: "অ্যাপ প্রিফারেন্স ও প্রাইভেসি",
    darkMode: "ডার্ক মোড", darkModeDesc: "অ্যাপ থیم পরিবর্তন করুন",
    language: "ভাষা", languageDesc: "অ্যাপের ভাষা পরিবর্তন করুন"
  }
  // প্রয়োজন হলে বাকি ভাষাগুলো এখানে যোগ করে নেবেন আগের মতো
};

export const LanguageProvider = ({ children }) => {
  const [locale, setLocale] = useState('bn');

  useEffect(() => {
    const loadLang = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLang');
        if (savedLang) setLocale(savedLang);
      } catch (e) {}
    };
    loadLang();
  }, []);

  const changeLanguage = async (lang) => {
    setLocale(lang);
    await AsyncStorage.setItem('appLang', lang);
  };

  const t = (key) => {
    return translations[locale]?.[key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ locale, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
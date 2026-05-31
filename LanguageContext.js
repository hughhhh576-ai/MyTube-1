import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LanguageContext = createContext();

// আমাদের ভাষার ডিকশনারি
const translations = {
  en: {
    home: 'Home', shorts: 'Shorts', live: 'Live', me: 'ME',
    menu: 'MENU', search: 'Search...',
    history: 'History', historySub: 'Recently watched videos',
    download: 'Download', downloadSub: 'Offline saved videos',
    subscribe: 'My Subscribe', subscribeSub: 'Channels you follow',
    playlist: 'My Playlist', playlistSub: 'Your curated collections',
    settings: 'Settings', settingsSub: 'App preferences & privacy',
    darkMode: 'Dark Mode', darkModeSub: 'Switch app theme',
    language: 'Language', languageSub: 'Change app language'
  },
  bn: {
    home: 'হোম', shorts: 'শর্টস', live: 'লাইভ', me: 'মি',
    menu: 'মেনু', search: 'সার্চ...',
    history: 'হিস্টোরি', historySub: 'সম্প্রতি দেখা ভিডিও',
    download: 'ডাউনলোড', downloadSub: 'অফলাইন সেভ করা ভিডিও',
    subscribe: 'সাবস্ক্রাইব', subscribeSub: 'আপনার অনুসরণ করা চ্যানেল',
    playlist: 'প্লেলিস্ট', playlistSub: 'আপনার পছন্দের কালেকশন',
    settings: 'সেটিংস', settingsSub: 'অ্যাপ পছন্দ ও গোপনীয়তা',
    darkMode: 'ডার্ক মোড', darkModeSub: 'অ্যাপের থিম পরিবর্তন করুন',
    language: 'ভাষা', languageSub: 'অ্যাপের ভাষা পরিবর্তন করুন'
  },
  hi: {
    home: 'होम', shorts: 'शॉर्ट्स', live: 'लाइव', me: 'मी',
    menu: 'मेनू', search: 'खोजें...',
    history: 'इतिहास', historySub: 'हाल ही में देखे गए वीडियो',
    download: 'डाउनलोड', downloadSub: 'ऑफ़लाइन सहेजे गए वीडियो',
    subscribe: 'मेरे सदस्य', subscribeSub: 'आपके द्वारा अनुसरण किए जाने वाले चैनल',
    playlist: 'मेरी प्लेलिस्ट', playlistSub: 'आपका संग्रह',
    settings: 'सेटिंग्स', settingsSub: 'ऐप प्राथमिकताएं और गोपनीयता',
    darkMode: 'डार्क मोड', darkModeSub: 'ऐप थीम बदलें',
    language: 'भाषा', languageSub: 'ऐप की भाषा बदलें'
  },
  ur: {
    home: 'ہوم', shorts: 'شارٹس', live: 'لائیو', me: 'می',
    menu: 'مینو', search: 'تلاش کریں...',
    history: 'تاریخ', historySub: 'حال ہی میں دیکھی گئی ویڈیوز',
    download: 'ڈاؤن لوڈ', downloadSub: 'آف لائن محفوظ کردہ ویڈیوز',
    subscribe: 'میری سبسکرپشنز', subscribeSub: 'وہ چینلز جنہیں آپ فالو کرتے ہیں',
    playlist: 'میری پلے لسٹ', playlistSub: 'آپ کا مجموعہ',
    settings: 'ترتیبات', settingsSub: 'ایپ کی ترجیحات اور رازداری',
    darkMode: 'ڈارک موڈ', darkModeSub: 'ایپ کی تھیم تبدیل کریں',
    language: 'زبان', languageSub: 'ایپ کی زبان تبدیل کریں'
  },
  fa: {
    home: 'خانه', shorts: 'شورتس', live: 'زنده', me: 'من',
    menu: 'منو', search: 'جستجو...',
    history: 'تاریخچه', historySub: 'ویدیوهای اخیراً تماشا شده',
    download: 'دانلود', downloadSub: 'ویدیوهای ذخیره شده آفلاین',
    subscribe: 'اشتراک‌های من', subscribeSub: 'کانال‌هایی که دنبال می‌کنید',
    playlist: 'لیست پخش من', playlistSub: 'مجموعه شما',
    settings: 'تنظیمات', settingsSub: 'تنظیمات برگزیده و حریم خصوصی',
    darkMode: 'حالت تاریک', darkModeSub: 'تغییر تم برنامه',
    language: 'زبان', languageSub: 'تغییر زبان برنامه'
  },
  ar: {
    home: 'الرئيسية', shorts: 'شورتس', live: 'مباشر', me: 'أنا',
    menu: 'القائمة', search: 'بحث...',
    history: 'السجل', historySub: 'مقاطع الفيديو التي تمت مشاهدتها مؤخرًا',
    download: 'تنزيل', downloadSub: 'مقاطع الفيديو المحفوظة بلا اتصال',
    subscribe: 'اشتراكاتي', subscribeSub: 'القنوات التي تتابعها',
    playlist: 'قائمة التشغيل الخاصة بي', playlistSub: 'مجموعتك',
    settings: 'الإعدادات', settingsSub: 'تفضيلات التطبيق والخصوصية',
    darkMode: 'الوضع الداكن', darkModeSub: 'تغيير سمة التطبيق',
    language: 'اللغة', languageSub: 'تغيير لغة التطبيق'
  }
};

export const LanguageProvider = ({ children }) => {
  const [currentLang, setCurrentLang] = useState('en');

  useEffect(() => {
    const loadLang = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLanguage');
        if (savedLang) setCurrentLang(savedLang);
      } catch (e) {}
    };
    loadLang();
  }, []);

  const changeLanguage = async (langCode) => {
    setCurrentLang(langCode);
    await AsyncStorage.setItem('appLanguage', langCode);
  };

  // টেক্সট ট্রান্সলেট করার ফাংশন
  const t = (key) => {
    return translations[currentLang][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ currentLang, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
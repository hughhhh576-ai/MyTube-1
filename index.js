// MessageQueue বাইপাস করার জন্য Polyfill (Expo Go ক্র্যাশ ফিক্স)
// MessageQueue বাইপাস করার জন্য Polyfill (Expo Go ক্র্যাশ ফিক্স)
// React Native এর অভ্যন্তরীণ উপাদান দ্বারা অ্যাক্সেস করা কিছু মূল বৈশিষ্ট্য যোগ করা হয়েছে।
// এটি Hermes এবং expo-dev-client পরিবেশে আরও স্থিতিশীলতা দিতে সাহায্য করতে পারে।
if (!global.MessageQueue) {
  global.MessageQueue = {
    // সাধারণত কনসোল স্পাইংয়ের জন্য ব্যবহৃত হয়
    spy: () => {},
    // টাচেবল উপাদানগুলির জন্য ব্যবহৃত হয়
    _touchableRegions: [],
    // নেটিভ মডিউলগুলিতে কল পাঠানোর জন্য ব্যবহৃত হয়
    enqueueNativeCall: () => {},
    // রিমোট মডিউলগুলির একটি টেবিল যা মাঝে মাঝে প্রত্যাশিত হয়
    _remoteModuleTable: {}, 
  };
}

import 'react-native-reanimated';
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// ১. রিয়্যাক্ট এরর বাউন্ডারি (স্ক্রিনে পুরো এরর দেখানোর জন্য)
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#8B0000', paddingTop: 50, padding: 20 }}>
          <Text style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>App Crashed!</Text>
          <Text style={{ fontSize: 16, color: 'white', marginVertical: 10 }}>
            নিচের সম্পূর্ণ লগটি পড়ুন বা স্ক্রিনশট নিন:
          </Text>

          {/* স্ক্রল করে পুরো এরর পড়ার ব্যবস্থা */}
          <ScrollView style={{ backgroundColor: 'black', padding: 10, borderRadius: 5 }}>
            <Text style={{ color: '#00FF00', fontSize: 13 }}>
              {this.state.error ? `${this.state.error.message}\n\n${this.state.error.stack}` : 'Unknown Error'}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

// ২. গ্লোবাল ক্র্যাশ ক্যাচার (নেটিভ বা ব্যাকগ্রাউন্ড এররের জন্য)
global.ErrorUtils.setGlobalHandler((error, isFatal) => {
  if (isFatal) {
    alert(`🔴 Fatal Error:\n${error.message}\n\n${error.stack}`);
  }
});

// মূল অ্যাপকে এরর বাউন্ডারি দিয়ে মুড়ে দেওয়া হলো
const MyTubeRoot = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

registerRootComponent(MyTubeRoot);

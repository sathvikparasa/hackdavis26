import { Tabs } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CustomTabBar } from '@/components/custom-tab-bar';

export default function TabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="my-reports" />
        <Tabs.Screen name="report" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </GestureHandlerRootView>
  );
}
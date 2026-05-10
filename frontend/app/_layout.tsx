import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from '@expo-google-fonts/outfit'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import AnticipateLogoSvg from '@/anticipate_logo.svg'
import { TutorialOverlay } from '@/components/TutorialOverlay'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { OfflineReportWorker } from '@/lib/offline-report-worker'
import { PushNotificationsBootstrap } from '@/lib/push-notifications'
import { TutorialProvider } from '@/lib/tutorial'

SplashScreen.preventAutoHideAsync()

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

if (!publishableKey) {
  throw new Error('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file')
}

export const unstable_settings = {
  anchor: '(tabs)',
}

function AppSplash({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [visible])

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity }]} pointerEvents="none">
      <Image source={require('@/assets/images/anticipate_icon.png')} style={styles.splashIcon} />
      <AnticipateLogoSvg width={180} height={76} />
    </Animated.View>
  )
}

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {fontsLoaded ? (
            <>
              <PushNotificationsBootstrap />
              <OfflineReportWorker />
              <TutorialProvider>
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="analyzing" options={{ headerShown: false }} />
                  <Stack.Screen name="alert/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="alert/filter" options={{ headerShown: false }} />
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                </Stack>
                <TutorialOverlay />
              </TutorialProvider>
            </>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <AppSplash visible={!fontsLoaded} />
          <StatusBar style="auto" />
        </ThemeProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  splash: {
    alignItems: 'center',
    backgroundColor: '#fff',
    justifyContent: 'center',
    zIndex: 999,
  },
  splashIcon: {
    width: 110,
    height: 110,
    marginBottom: -22,
  },
})

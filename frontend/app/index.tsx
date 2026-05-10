import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import React from 'react'

import { useTutorial } from '@/lib/tutorial'
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import AnticipateLogoSvg from '@/anticipate_logo.svg'

const SEEN_KEY = 'anticipate_seen_landing'

function useFloatAnim() {
  const anim = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: -10, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  return anim
}

export default function LandingScreen() {
  const router = useRouter()
  const { startTutorial } = useTutorial()
  const floatY = useFloatAnim()
  const [checking, setChecking] = React.useState(true)

  React.useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((val) => {
      if (val === 'true') {
        router.replace('/(tabs)')
      } else {
        setChecking(false)
      }
    })
  }, [])

  const handleStart = async () => {
    await AsyncStorage.setItem(SEEN_KEY, 'true')
    startTutorial()
    router.replace('/(tabs)')
  }

  if (checking) return <View style={styles.root} />

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Animated.View style={[styles.antContainer, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
          <Image
            source={require('@/assets/images/anticipate_icon.png')}
            style={styles.antImage}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.logoSection}>
          <AnticipateLogoSvg width={270} height={113} />
        </View>

        <View style={styles.descSection}>
          <Text style={styles.tagline}>Your field's early warning system</Text>
          <Text style={styles.description}>
            Anticipate helps farmers detect and track pest outbreaks before they spread. Snap a photo, get an instant AI-powered analysis, and see what's threatening crops near you — all in one place.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.85 }]}
          onPress={handleStart}
        >
          <Text style={styles.ctaText}>Start Tutorial</Text>
        </Pressable>
        <Text style={styles.footerNote}>Made for farmers, by farmers' advocates</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: -12,
  },
  descSection: {
    alignItems: 'center',
    gap: 10,
    marginTop: -8,
  },
  tagline: {
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 20,
    color: '#2d4a3e',
    textAlign: 'center',
    lineHeight: 26,
  },
  description: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 15,
    color: '#4b5e55',
    textAlign: 'center',
    lineHeight: 23,
  },
  antContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  antImage: {
    width: 270,
    height: 270,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
    gap: 12,
    alignItems: 'center',
  },
  ctaButton: {
    backgroundColor: '#2d4a3e',
    borderRadius: 14,
    paddingVertical: 17,
    width: '100%',
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 17,
    color: '#fff',
    letterSpacing: 0.3,
  },
  footerNote: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 12,
    color: '#9aada0',
    textAlign: 'center',
  },
})

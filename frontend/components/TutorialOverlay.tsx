import { useAuth } from '@clerk/expo'
import { useRouter } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { STEP_CONFIG, TOTAL_STEPS, TutorialStepId, useTutorial } from '@/lib/tutorial'

export function TutorialOverlay() {
  const { step, isActive, advance, skip } = useTutorial()
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Auto-advance step 7 once user signs in
  useEffect(() => {
    if (step === 7 && isSignedIn) {
      advance()
    }
  }, [step, isSignedIn, advance])

  // Navigate to the target tab when step changes
  useEffect(() => {
    if (!isActive || step === -1) return
    const config = STEP_CONFIG[step as Exclude<TutorialStepId, -1>]
    if (config?.targetTab) {
      router.navigate(config.targetTab as any)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isActive ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [isActive, fadeAnim])

  if (!isActive) return null

  const config = STEP_CONFIG[step as Exclude<TutorialStepId, -1>]
  if (!config) return null

  const stepNumber = step as number

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      {/* Dark backdrop — only for blocking/explain steps */}
      {!config.isAction && (
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="auto" />
      )}

      {/* Tooltip card — always interactive */}
      <View style={[styles.card, config.cardPosition === 'top' ? styles.cardTop : styles.cardBottom]} pointerEvents="auto">
        {/* Step dots */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i === stepNumber && styles.dotActive]} />
          ))}
        </View>

        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.body}>{config.body}</Text>

        <View style={styles.actions}>
          <Pressable onPress={skip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip Tutorial</Text>
          </Pressable>
          {!!config.cta && (
            <Pressable onPress={advance} style={styles.nextBtn}>
              <Text style={styles.nextText}>{config.cta}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    zIndex: 999,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 1000,
  },
  cardBottom: {
    bottom: 106,
  },
  cardTop: {
    top: 60,
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
  },
  dotActive: {
    backgroundColor: '#2d4a3e',
    width: 18,
    borderRadius: 3,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 17,
    color: '#111827',
    marginBottom: 6,
  },
  body: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 21,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13,
    color: '#9ca3af',
  },
  nextBtn: {
    backgroundColor: '#2d4a3e',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  nextText: {
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 14,
    color: '#fff',
  },
})

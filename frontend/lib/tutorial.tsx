import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

const TUTORIAL_KEY = 'anticipate_tutorial_step'

export type TutorialStepId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | -1

type StepConfig = {
  title: string
  body: string
  cta: string
  isAction: boolean // action = pass-through overlay; explain = dark overlay + cta button
  targetTab?: string
  cardPosition: 'top' | 'bottom'
}

export const STEP_CONFIG: Record<Exclude<TutorialStepId, -1>, StepConfig> = {
  0: {
    title: 'Pest Alerts',
    body: 'This feed shows nearby pest detections submitted by farmers. Each alert tells you the pest, affected crops, how far it could spread, and which farms are at risk.',
    cta: 'Next',
    isAction: false,
    targetTab: '/(tabs)/alerts',
    cardPosition: 'bottom',
  },
  1: {
    title: 'Tap an Alert',
    body: 'Tap any alert card below to explore a pest detection in detail.',
    cta: 'Next',
    isAction: true,
    targetTab: '/(tabs)/alerts',
    cardPosition: 'top',
  },
  2: {
    title: 'Confidence Score',
    body: "Our AI analyzed a farmer's photo to identify the pest. Confidence tells you how certain the identification is — 90%+ is very reliable.",
    cta: 'Next',
    isAction: false,
    cardPosition: 'top',
  },
  3: {
    title: 'Spread Radius',
    body: 'The radius is the estimated area around the detection where this pest could potentially spread. A larger radius means farms further away are also at risk.',
    cta: 'Next',
    isAction: false,
    cardPosition: 'top',
  },
  4: {
    title: 'Spread Methods',
    body: 'This tells you how the pest travels. Wind-dispersed pests can reach farms miles away. Soil-contact pests spread through contaminated runoff or shared equipment.',
    cta: 'Next',
    isAction: false,
    cardPosition: 'top',
  },
  5: {
    title: 'Affected Fields',
    body: 'Scroll down to the Affected Fields section — these are farms near the detection that may be at risk. Tap one to continue, or tap Next.',
    cta: 'Next',
    isAction: true,
    cardPosition: 'top',
  },
  6: {
    title: 'My Fields',
    body: "This is where you save your farm fields. Once saved, you'll receive push notifications whenever a pest is detected near your land.",
    cta: 'Next',
    isAction: false,
    targetTab: '/(tabs)',
    cardPosition: 'bottom',
  },
  7: {
    // Profile tab is at bottom right — card goes to top
    title: 'Sign In to Save Fields',
    body: "You'll need to sign in to save fields and receive alerts. Tap the Profile tab at the bottom right to sign in, then come back here.",
    cta: '',
    isAction: true,
    targetTab: '/(tabs)',
    cardPosition: 'top',
  },
  8: {
    // Open Map button is in center of empty state — card goes to top
    title: 'Open the Map',
    body: "Tap 'Open Map' to view the field boundaries in your area. You might need to zoom in to see a field. From the map you can select and save your own fields.",
    cta: '',
    isAction: true,
    targetTab: '/(tabs)',
    cardPosition: 'top',
  },
  9: {
    // Save Crop panel is at the bottom — card goes to top
    title: 'Save a Field',
    body: "Tap any field boundary on the map to select it. Enter your crop type in the panel that appears, then tap 'Save Crop' to add it to My Fields.",
    cta: '',
    isAction: true,
    cardPosition: 'top',
  },
  10: {
    title: "You're All Set!",
    body: "The Pest Map shows all recent reports plotted on an interactive map. Tap any pin to see the full alert. Stay ahead of what's spreading near your farm.",
    cta: 'Finish Tutorial',
    isAction: false,
    targetTab: '/(tabs)/pest-map',
    cardPosition: 'bottom',
  },
}

export const TOTAL_STEPS = 11

type TutorialContextType = {
  step: TutorialStepId
  isActive: boolean
  advance: () => void
  skip: () => void
  startTutorial: () => void
}

const TutorialContext = createContext<TutorialContextType>({
  step: -1,
  isActive: false,
  advance: () => {},
  skip: () => {},
  startTutorial: () => {},
})

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<TutorialStepId>(-1)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((val) => {
      if (val !== null) {
        setStep(parseInt(val, 10) as TutorialStepId)
      }
      setLoaded(true)
    })
  }, [])

  const advance = useCallback(() => {
    setStep((current) => {
      const next: TutorialStepId = current === 10 ? -1 : ((current as number) + 1) as TutorialStepId
      AsyncStorage.setItem(TUTORIAL_KEY, String(next))
      return next
    })
  }, [])

  const skip = useCallback(() => {
    setStep(-1)
    AsyncStorage.setItem(TUTORIAL_KEY, '-1')
  }, [])

  const startTutorial = useCallback(() => {
    setStep(0)
    AsyncStorage.setItem(TUTORIAL_KEY, '0')
  }, [])

  if (!loaded) return <>{children}</>

  return (
    <TutorialContext.Provider value={{ step, isActive: step !== -1, advance, skip, startTutorial }}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  return useContext(TutorialContext)
}

import { useSignIn, useSignUp } from '@clerk/expo'
import { type Href, useRouter } from 'expo-router'
import React from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { upsertProfile } from '@/lib/supabase'
import LoginSvg from '@/assets/illustrations/login.svg'
import SignUpSvg from '@/assets/illustrations/sign-up.svg'
import MfaSvg from '@/assets/illustrations/mfa.svg'
import AnticipateLogoSvg from '@/anticipate_logo.svg'

function useFloatAnim() {
  const anim = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: -12, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0,   duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  return anim
}

const DIGIT_COUNT = 6

export default function SignInScreen() {
  const { signIn, fetchStatus: signInStatus } = useSignIn()
  const { signUp, fetchStatus: signUpStatus } = useSignUp()
  const router = useRouter()
  const floatY = useFloatAnim()

  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [pendingVerification, setPendingVerification] = React.useState(false)
  const [digits, setDigits] = React.useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const inputRefs = React.useRef<(TextInput | null)[]>(Array(DIGIT_COUNT).fill(null))

  const isBusy = signInStatus === 'fetching' || signUpStatus === 'fetching'
  const code = digits.join('')

  const handleSignIn = async () => {
    setError('')
    const { error: err } = await signIn.password({ emailAddress: email, password })
    if (err) { setError(err.message ?? 'Sign in failed'); return }
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(tabs)') as Href),
      })
    }
  }

  const handleSignUp = async () => {
    setError('')
    const { error: err } = await signUp.password({ emailAddress: email, password })
    if (err) { setError(err.message ?? 'Sign up failed'); return }
    await signUp.verifications.sendEmailCode()
    setPendingVerification(true)
  }

  const handleVerify = async () => {
    setError('')
    await signUp.verifications.verifyEmailCode({ code })
    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: async ({ session, decorateUrl }) => {
          const clerkId = session?.user?.id ?? ''
          if (clerkId) await upsertProfile(clerkId, email, name || undefined).catch(console.error)
          router.replace(decorateUrl('/(tabs)') as Href)
        },
      })
    } else {
      setError('Verification failed. Check your code and try again.')
    }
  }

  const handleDigitChange = (value: string, index: number) => {
    const next = [...digits]
    next[index] = value.slice(-1)
    setDigits(next)
    if (value && index < DIGIT_COUNT - 1) inputRefs.current[index + 1]?.focus()
  }

  const handleDigitKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <AnticipateLogoSvg width={180} height={75} style={styles.logo} />

          <Animated.View style={[styles.illustrationContainer, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
            <MfaSvg width={165} height={118} />
          </Animated.View>

          <View style={styles.mfaContent}>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.subheading}>We sent a 6-digit code to {email}</Text>

            <View style={styles.digitRow}>
              {digits.map((digit, i) => (
                <React.Fragment key={i}>
                  {i === 3 && <View style={styles.digitGap} />}
                  <TextInput
                    ref={(r) => { inputRefs.current[i] = r }}
                    style={styles.digitInput}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(v) => handleDigitChange(v, i)}
                    onKeyPress={({ nativeEvent }) => handleDigitKeyPress(nativeEvent.key, i)}
                    textAlign="center"
                  />
                </React.Fragment>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.button, (isBusy || code.length < 6) && styles.buttonDisabled, pressed && { opacity: 0.85 }]}
              onPress={handleVerify}
              disabled={isBusy || code.length < 6}
            >
              <Text style={styles.buttonText}>{isBusy ? 'Verifying…' : 'Verify'}</Text>
            </Pressable>

            <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
              <Text style={styles.linkAction}>Resend code</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <AnticipateLogoSvg width={180} height={75} style={styles.logo} />

        <Animated.View style={[styles.illustrationContainer, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
          {mode === 'signIn' ? <LoginSvg width={180} height={160} /> : <SignUpSvg width={165} height={127} />}
        </Animated.View>

        <View style={styles.headerSection}>
          <Text style={styles.heading}>{mode === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>
          <Text style={styles.subheading}>{mode === 'signIn' ? '' : ''}</Text>
        </View>

        <View style={styles.form}>
          {mode === 'signUp' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="#9aada0"
                value={name}
                onChangeText={setName}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#9aada0"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#9aada0"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.button, (isBusy || !email || !password) && styles.buttonDisabled, pressed && { opacity: 0.85 }]}
            onPress={mode === 'signIn' ? handleSignIn : handleSignUp}
            disabled={isBusy || !email || !password}
          >
            <Text style={styles.buttonText}>
              {isBusy ? (mode === 'signIn' ? 'Signing in…' : 'Creating account…') : 'Continue'}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError('') }}>
          <Text style={styles.linkBase}>
            {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
            <Text style={styles.linkAction}>{mode === 'signIn' ? 'Sign up' : 'Sign in'}</Text>
          </Text>
        </Pressable>

        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  logo: {
    alignSelf: 'center',
    marginBottom: -8,
  },
  illustrationContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 90,
    paddingBottom: 24,
  },
  headerSection: {
    marginBottom: 24,
    gap: 4,
  },
  heading: {
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    fontSize: 30,
    color: '#111827',
    lineHeight: 36,
  },
  subheading: {
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
    marginTop: 4,
  },
  form: {
    gap: 16,
    marginBottom: 12,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 18,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    backgroundColor: '#71897b',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: {
    color: '#fff',
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
  },
  linkBase: {
    color: '#111827',
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  linkAction: {
    color: '#71897b',
    fontFamily: 'Outfit_600SemiBold', fontWeight: '600',
  },
  error: { color: '#d32f2f', fontSize: 13 },
  mfaContent: {
    paddingHorizontal: 24,
    paddingTop: 0,
    gap: 20,
  },
  digitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  digitGap: { width: 16 },
  digitInput: {
    width: 48,
    height: 64,
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 2,
    borderBottomColor: '#d1d5db',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    fontSize: 28,
    color: '#111827',
    textAlign: 'center',
  },
})

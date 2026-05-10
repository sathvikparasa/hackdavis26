import { useClerk, useSignIn, useSignUp } from '@clerk/expo'
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
import {
  clerkErrorMessage,
  describeClerkAttempt,
  logAuthEvent,
  selectSecondFactor,
  type ClerkSecondFactor,
} from '@/lib/auth-debug'
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
  const { setActive } = useClerk()
  const router = useRouter()
  const floatY = useFloatAnim()

  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [pendingSecondFactor, setPendingSecondFactor] = React.useState(false)
  const [selectedSecondFactor, setSelectedSecondFactor] = React.useState<ClerkSecondFactor | null>(null)
  const [pendingVerification, setPendingVerification] = React.useState(false)
  const [digits, setDigits] = React.useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const inputRefs = React.useRef<(TextInput | null)[]>(Array(DIGIT_COUNT).fill(null))

  const isBusy = signInStatus === 'fetching' || signUpStatus === 'fetching'
  const code = digits.join('')

  const prepareSecondFactor = async () => {
    const factor = selectSecondFactor(signIn.supportedSecondFactors)
    logAuthEvent('sign-in second factor selected', {
      factor,
      ...describeClerkAttempt(signIn),
    })

    if (!factor?.strategy) {
      const message = 'This account requires a second factor, but no supported factor was returned.'
      setError(message)
      logAuthEvent('sign-in second factor missing', describeClerkAttempt(signIn))
      return
    }

    setSelectedSecondFactor(factor)
    setDigits(Array(DIGIT_COUNT).fill(''))

    if (factor.strategy === 'email_code') {
      const { error: sendError } = await signIn.mfa.sendEmailCode()
      logAuthEvent('sign-in second factor email code sent', {
        hasError: Boolean(sendError),
        ...describeClerkAttempt(signIn),
      })
      if (sendError) {
        setError(sendError.message ?? 'Unable to send verification code')
        return
      }
    } else if (factor.strategy === 'phone_code') {
      const { error: sendError } = await signIn.mfa.sendPhoneCode()
      logAuthEvent('sign-in second factor phone code sent', {
        hasError: Boolean(sendError),
        ...describeClerkAttempt(signIn),
      })
      if (sendError) {
        setError(sendError.message ?? 'Unable to send verification code')
        return
      }
    }

    setPendingSecondFactor(true)
  }

  const handleSignIn = async () => {
    setError('')
    logAuthEvent('sign-in pressed', { email: email.trim().toLowerCase() })
    try {
      const { error: signInError } = await signIn.password({ emailAddress: email, password })
      logAuthEvent('sign-in password returned', {
        hasError: Boolean(signInError),
        ...describeClerkAttempt(signIn),
      })
      if (signInError) {
        setError(signInError.message ?? 'Sign in failed')
        logAuthEvent('sign-in attempt error', {
          message: signInError.message ?? 'Sign in failed',
        })
        return
      }
      if (signIn.status === 'complete' && signIn.createdSessionId) {
        logAuthEvent('sign-in setActive starting', describeClerkAttempt(signIn))
        await setActive({ session: signIn.createdSessionId })
        logAuthEvent('sign-in setActive complete')
        router.replace('/(tabs)' as Href)
        logAuthEvent('sign-in routed to tabs')
      } else if (signIn.status === 'needs_second_factor') {
        await prepareSecondFactor()
      } else {
        const message = `Sign in did not complete. Clerk status: ${signIn.status ?? 'unknown'}`
        setError(message)
        logAuthEvent('sign-in incomplete', describeClerkAttempt(signIn))
      }
    } catch (e: any) {
      const message = clerkErrorMessage(e, 'Sign in failed')
      setError(message)
      console.error('[auth] sign-in exception', e)
    }
  }

  const handleSecondFactor = async () => {
    setError('')
    logAuthEvent('sign-in second factor pressed', {
      codeLength: code.length,
      factor: selectedSecondFactor,
    })

    try {
      const factor = selectedSecondFactor ?? selectSecondFactor(signIn.supportedSecondFactors)
      if (!factor?.strategy) {
        setError('No supported second factor is available for this account.')
        logAuthEvent('sign-in second factor unavailable', describeClerkAttempt(signIn))
        return
      }

      const result =
        factor.strategy === 'email_code'
          ? await signIn.mfa.verifyEmailCode({ code })
          : factor.strategy === 'phone_code'
            ? await signIn.mfa.verifyPhoneCode({ code })
            : factor.strategy === 'totp'
              ? await signIn.mfa.verifyTOTP({ code })
              : await signIn.mfa.verifyBackupCode({ code })

      logAuthEvent('sign-in second factor returned', {
        hasError: Boolean(result.error),
        ...describeClerkAttempt(signIn),
      })
      if (result.error) {
        setError(result.error.message ?? 'Second factor verification failed')
        return
      }

      if (signIn.status === 'complete' && signIn.createdSessionId) {
        logAuthEvent('sign-in second factor finalize starting', describeClerkAttempt(signIn))
        const { error: finalizeError } = await signIn.finalize()
        if (finalizeError) {
          setError(finalizeError.message ?? 'Unable to activate session')
          logAuthEvent('sign-in second factor finalize error', {
            message: finalizeError.message ?? 'Unable to activate session',
          })
          return
        }
        logAuthEvent('sign-in second factor setActive complete')
        router.replace('/(tabs)' as Href)
        logAuthEvent('sign-in second factor routed to tabs')
      } else {
        const message = `Second factor did not complete. Clerk status: ${signIn.status ?? 'unknown'}`
        setError(message)
        logAuthEvent('sign-in second factor incomplete', describeClerkAttempt(signIn))
      }
    } catch (e: any) {
      const message = clerkErrorMessage(e, 'Second factor verification failed')
      setError(message)
      console.error('[auth] sign-in second factor exception', e)
    }
  }

  const handleSignUp = async () => {
    setError('')
    logAuthEvent('sign-up pressed', { email: email.trim().toLowerCase() })
    try {
      const { error: signUpError } = await signUp.password({ emailAddress: email, password })
      logAuthEvent('sign-up password returned', {
        hasError: Boolean(signUpError),
        ...describeClerkAttempt(signUp),
      })
      if (signUpError) {
        setError(signUpError.message ?? 'Sign up failed')
        logAuthEvent('sign-up attempt error', {
          message: signUpError.message ?? 'Sign up failed',
        })
        return
      }
      await signUp.verifications.sendEmailCode()
      logAuthEvent('sign-up verification code sent')
      setPendingVerification(true)
    } catch (e: any) {
      const message = clerkErrorMessage(e, 'Sign up failed')
      setError(message)
      console.error('[auth] sign-up exception', e)
    }
  }

  const handleVerify = async () => {
    setError('')
    logAuthEvent('sign-up verify pressed', { codeLength: code.length })
    try {
      await signUp.verifications.verifyEmailCode({ code })
      logAuthEvent('sign-up verify returned', describeClerkAttempt(signUp))
      if (signUp.status === 'complete' && signUp.createdSessionId) {
        const clerkId = signUp.createdUserId ?? ''
        if (clerkId) await upsertProfile(clerkId, email, name || undefined).catch(console.error)
        logAuthEvent('sign-up setActive starting', describeClerkAttempt(signUp))
        await setActive({ session: signUp.createdSessionId })
        logAuthEvent('sign-up setActive complete')
        router.replace('/(tabs)' as Href)
        logAuthEvent('sign-up routed to tabs')
      } else {
        const message = `Verification did not complete. Clerk status: ${signUp.status ?? 'unknown'}`
        setError(message)
        logAuthEvent('sign-up verification incomplete', describeClerkAttempt(signUp))
      }
    } catch (e: any) {
      const message = clerkErrorMessage(e, 'Verification failed')
      setError(message)
      console.error('[auth] sign-up verify exception', e)
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

  if (pendingSecondFactor) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <AnticipateLogoSvg width={180} height={75} style={styles.logo} />

          <Animated.View style={[styles.illustrationContainer, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
            <MfaSvg width={165} height={118} />
          </Animated.View>

          <View style={styles.mfaContent}>
            <Text style={styles.heading}>Enter your code</Text>
            <Text style={styles.subheading}>Complete the second verification step for your account.</Text>

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
              onPress={handleSecondFactor}
              disabled={isBusy || code.length < 6}
            >
              <Text style={styles.buttonText}>{isBusy ? 'Verifying…' : 'Verify'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    )
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
              <Text style={styles.link}>Resend code</Text>
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
          <Text style={styles.heading}>{mode === 'signIn' ? 'Log In' : 'Sign Up'}</Text>
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
            <Text style={styles.label}>Email Address</Text>
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
          <Text style={styles.link}>
            {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
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
  link: {
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    color: '#111827',
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

import { useAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/expo'
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

import LoginSvg from '@/assets/illustrations/login.svg'
import SignUpSvg from '@/assets/illustrations/sign-up.svg'
import MfaSvg from '@/assets/illustrations/mfa.svg'
import AnticipateLogoSvg from '@/anticipate_logo.svg'
import { upsertProfile } from '@/lib/supabase'

const DIGIT_COUNT = 6

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

function AuthForm() {
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
        navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(tabs)/profile') as Href),
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
          router.replace(decorateUrl('/(tabs)/profile') as Href)
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
      <View style={styles.authContainer}>
        <Animated.View style={[styles.illustration, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
          <MfaSvg width={150} height={107} />
        </Animated.View>

        <AnticipateLogoSvg width={160} height={67} style={{ marginBottom: -8 }} />
        <Text style={styles.authTitle}>Check your email</Text>
        <Text style={styles.authSub}>We sent a 6-digit code to {email}</Text>

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
          style={({ pressed }) => [styles.btn, (isBusy || code.length < 6) && styles.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={handleVerify}
          disabled={isBusy || code.length < 6}
        >
          <Text style={styles.btnText}>{isBusy ? 'Verifying…' : 'Verify'}</Text>
        </Pressable>

        <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
          <Text style={styles.link}>Resend code</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.illustration, { transform: [{ translateY: floatY }] }]} pointerEvents="none">
          {mode === 'signIn' ? <LoginSvg width={150} height={133} /> : <SignUpSvg width={150} height={115} />}
        </Animated.View>

        <AnticipateLogoSvg width={160} height={67} style={{ marginBottom: -8 }} />
        <Text style={styles.authTitle}>{mode === 'signIn' ? 'Welcome back!' : 'Create Account'}</Text>
        <Text style={styles.authSub}>{mode === 'signIn' ? 'Sign in to continue' : 'Sign up to get started'}</Text>

        {mode === 'signUp' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor="#9aada0" value={name} onChangeText={setName} />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email address</Text>
          <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#9aada0" value={email} onChangeText={setEmail} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} secureTextEntry placeholder="••••••••" placeholderTextColor="#9aada0" value={password} onChangeText={setPassword} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.btn, (!email || !password || isBusy) && styles.btnDisabled, pressed && { opacity: 0.85 }]}
          onPress={mode === 'signIn' ? handleSignIn : handleSignUp}
          disabled={!email || !password || isBusy}
        >
          <Text style={styles.btnText}>{isBusy ? (mode === 'signIn' ? 'Signing in…' : 'Creating account…') : 'Continue'}</Text>
        </Pressable>

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

export default function ProfilePage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  React.useEffect(() => {
    if (user) {
      const email = user.emailAddresses[0]?.emailAddress ?? ''
      upsertProfile(user.id, email, user.fullName ?? undefined).catch(console.error)
    }
  }, [user?.id])

  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: '#f7faf5' }} />

  if (!isSignedIn) return <AuthForm />

  const email = user?.emailAddresses[0]?.emailAddress ?? ''
  const name = user?.fullName ?? user?.firstName ?? ''
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase()

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {name ? <Text style={styles.name}>{name}</Text> : null}
      <Text style={styles.email}>{email}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{email}</Text>
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={styles.rowLabel}>Member since</Text>
          <Text style={styles.rowValue}>
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.7 }]}
        onPress={async () => { await signOut(); router.replace('/(tabs)') }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  authContainer: {
    flexGrow: 1,
    backgroundColor: '#f7faf5',
    paddingHorizontal: 32,
    paddingTop: 96,
    paddingBottom: 24,
    gap: 10,
    alignItems: 'center',
  },
  illustration: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  authTitle: { fontWeight: '700', fontSize: 26, color: '#191c1a', lineHeight: 32, alignSelf: 'flex-start' },
  authSub: { fontWeight: '500', fontSize: 14, color: '#424844', alignSelf: 'flex-start' },
  fieldGroup: { gap: 6, width: '100%' },
  label: { fontWeight: '500', fontSize: 14, color: '#374151' },
  input: {
    backgroundColor: '#ecefea',
    borderWidth: 1,
    borderColor: '#c2c8c2',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 16,
    fontSize: 16,
    color: '#191c1a',
  },
  btn: {
    backgroundColor: '#71897b',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#546522', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  error: { color: '#d32f2f', fontSize: 13 },
  digitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  digitGap: { width: 16 },
  digitInput: {
    width: 44, height: 58,
    backgroundColor: '#f1f4ef',
    borderBottomWidth: 2, borderBottomColor: '#c2c8c2',
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    fontSize: 24, color: '#191c1a', textAlign: 'center',
  },
  container: {
    padding: 24, paddingTop: 60, alignItems: 'center',
    backgroundColor: '#f7f7f7', minHeight: '100%',
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#4caf50', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  email: { fontSize: 14, color: '#666', marginBottom: 32 },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 12,
    padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardLabel: {
    fontSize: 12, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  rowLabel: { color: '#444', fontSize: 15 },
  rowValue: { color: '#888', fontSize: 15 },
  signOutButton: {
    width: '100%', borderWidth: 1.5, borderColor: '#d32f2f',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  signOutText: { color: '#d32f2f', fontWeight: '700', fontSize: 15 },
})

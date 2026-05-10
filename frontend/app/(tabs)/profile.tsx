import { useAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/expo'
import { type Href, useRouter } from 'expo-router'
import React from 'react'
import {
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

const DIGIT_COUNT = 6

function AuthForm() {
  const { signIn, fetchStatus: signInStatus } = useSignIn()
  const { signUp, fetchStatus: signUpStatus } = useSignUp()
  const router = useRouter()

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
      <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.appTitle}>ANTICIPATE</Text>
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
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.appTitle}>ANTICIPATE</Text>
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
  container: { flex: 1, backgroundColor: '#0f1a0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { color: '#4ade80', fontSize: 18, fontWeight: '600' },
});

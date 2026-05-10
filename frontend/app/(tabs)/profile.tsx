import { useAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/expo'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
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
import { supabase, upsertProfile } from '@/lib/supabase'
import { useTutorial } from '@/lib/tutorial'

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
  const { setActive } = useClerk()
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
    try {
      const { error: err } = await signIn.password({ emailAddress: email, password })
      if (err) { setError(err.message ?? 'Sign in failed'); return }
      if (signIn.status === 'complete') {
        await setActive({ session: signIn.createdSessionId })
        router.replace('/(tabs)/profile' as Href)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed')
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
    try {
      await signUp.verifications.verifyEmailCode({ code })
      if (signUp.status === 'complete') {
        const clerkId = signUp.createdUserId ?? ''
        if (clerkId) await upsertProfile(clerkId, email, name || undefined).catch(console.error)
        await setActive({ session: signUp.createdSessionId })
        router.replace('/(tabs)/profile' as Href)
      } else {
        setError('Verification failed. Check your code and try again.')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed')
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
          <Text style={styles.linkAction}>Resend code</Text>
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

type UserReport = {
  id: string
  pest_name: string | null
  crop_type: string | null
  created_at: string | null
  confidence: number | null
}

const SETTINGS = [
  { key: 'notifications', label: 'Notification Settings', icon: 'notifications-none' as const },
  { key: 'sources',       label: 'Data Sources',          icon: 'storage' as const },
  { key: 'support',       label: 'Help & Support',        icon: 'help-outline' as const },
  { key: 'about',         label: 'About',                 icon: 'info-outline' as const },
]

export default function ProfilePage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()
  const { startTutorial } = useTutorial()
  const [reports, setReports] = React.useState<UserReport[]>([])
  const [reportsLoading, setReportsLoading] = React.useState(true)
  const [profileName, setProfileName] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!user) return
    const email = user.emailAddresses[0]?.emailAddress ?? ''
    const clerkName = user.fullName ?? undefined
    void Promise.resolve(upsertProfile(user.id, email, clerkName)).catch(console.error)
    // Fetch stored name from profiles table (set during sign-up)
    supabase
      .from('profiles')
      .select('name')
      .eq('clerk_user_id', user.id)
      .single()
      .then(({ data }) => { if (data?.name) setProfileName(data.name) })
      .then(undefined, console.error)
  }, [user?.id])

  React.useEffect(() => {
    if (!user) return
    const userId = user.id
    setReportsLoading(true)
    async function loadReports() {
      try {
        const { data } = await supabase
          .from('reports')
          .select('id, pest_name, crop_type, created_at, confidence')
          .eq('clerk_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20)
        setReports(data ?? [])
      } finally {
        setReportsLoading(false)
      }
    }

    void loadReports()
  }, [user?.id])

  if (!isLoaded) return (
    <View style={{ flex: 1, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Outfit_400Regular', color: '#9ca3af', fontSize: 14 }}>Loading…</Text>
    </View>
  )
  if (!isSignedIn) return <AuthForm />

  const email = user?.emailAddresses[0]?.emailAddress ?? ''
  const name = profileName ?? user?.fullName ?? user?.firstName ?? ''
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase()
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          {name ? <Text style={styles.name}>{name}</Text> : null}
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.memberSince}>Member since {memberSince}</Text>
        </View>
      </View>

      {/* My Reports */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Reports</Text>
        {reportsLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading…</Text>
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="eco" size={28} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No reports yet</Text>
            <Text style={styles.emptyText}>Your pest reports will appear here.</Text>
          </View>
        ) : (
          reports.map((r) => <ReportCard key={r.id} report={r} />)
        )}
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsCard}>
          {SETTINGS.map((item, i) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.settingsRow,
                styles.settingsRowBorder,
                pressed && { backgroundColor: '#f9fafb' },
              ]}
            >
              <View style={styles.settingsLeft}>
                <View style={styles.settingsIconBox}>
                  <MaterialIcons name={item.icon} size={18} color="#71897b" />
                </View>
                <Text style={styles.settingsLabel}>{item.label}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [styles.settingsRow, pressed && { backgroundColor: '#f9fafb' }]}
            onPress={() => { startTutorial(); router.navigate('/(tabs)/alerts' as any) }}
          >
            <View style={styles.settingsLeft}>
              <View style={styles.settingsIconBox}>
                <MaterialIcons name="school" size={18} color="#71897b" />
              </View>
              <Text style={styles.settingsLabel}>Restart Tutorial</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />
          </Pressable>
        </View>
      </View>

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.7 }]}
        onPress={async () => { await signOut(); router.replace('/(tabs)' as Href) }}
      >
        <MaterialIcons name="logout" size={16} color="#d32f2f" />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}

function ReportCard({ report }: { report: UserReport }) {
  const confidence = report.confidence != null ? Math.round(report.confidence * 100) : null
  const date = report.created_at
    ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const confColor = confidence == null ? '#9ca3af' : confidence >= 70 ? '#71897b' : confidence >= 40 ? '#d97706' : '#d32f2f'

  return (
    <View style={styles.reportCard}>
      <View style={styles.reportIconBox}>
        <MaterialIcons name="bug-report" size={20} color="#71897b" />
      </View>
      <View style={styles.reportInfo}>
        <Text style={styles.reportPest} numberOfLines={1}>{report.pest_name ?? 'Unknown pest'}</Text>
        <Text style={styles.reportMeta}>{report.crop_type ?? 'Unknown crop'} · {date}</Text>
      </View>
      {confidence != null && (
        <View style={[styles.confBadge, { backgroundColor: confColor + '18' }]}>
          <Text style={[styles.confText, { color: confColor }]}>{confidence}%</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  authContainer: {
    flexGrow: 1,
    backgroundColor: '#fafafa',
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
  authTitle: { fontFamily: 'Outfit_700Bold', fontWeight: '700', fontSize: 26, color: '#111827', lineHeight: 32, alignSelf: 'flex-start' },
  authSub: { fontFamily: 'Outfit_400Regular', fontWeight: '400', fontSize: 14, color: '#4b5563', alignSelf: 'flex-start' },
  fieldGroup: { gap: 6, width: '100%' },
  label: { fontFamily: 'Outfit_500Medium', fontWeight: '500', fontSize: 14, color: '#374151' },
  input: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 16,
    fontSize: 16,
    color: '#111827',
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
  btnText: { color: '#fff', fontFamily: 'Outfit_700Bold', fontWeight: '700', fontSize: 16 },
  linkBase: { color: '#111827', fontFamily: 'Outfit_400Regular', fontWeight: '400', fontSize: 14, textAlign: 'center' },
  linkAction: { color: '#71897b', fontFamily: 'Outfit_600SemiBold', fontWeight: '600' },
  error: { color: '#d32f2f', fontSize: 13 },
  digitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  digitGap: { width: 16 },
  digitInput: {
    width: 44, height: 58,
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 2, borderBottomColor: '#d1d5db',
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    fontSize: 24, color: '#111827', textAlign: 'center',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 96,
    paddingBottom: 80,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#71897b', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 22, fontFamily: 'Outfit_700Bold', fontWeight: '700' },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontFamily: 'Outfit_700Bold', fontWeight: '700', color: '#111827' },
  email: { fontSize: 13, fontFamily: 'Outfit_400Regular', fontWeight: '400', color: '#6b7280' },
  memberSince: { fontSize: 12, fontFamily: 'Outfit_400Regular', fontWeight: '400', color: '#9ca3af', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontFamily: 'Outfit_700Bold', fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
    paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 6,
  },
  emptyTitle: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', fontWeight: '600', color: '#374151' },
  emptyText: { fontSize: 13, fontFamily: 'Outfit_400Regular', fontWeight: '400', color: '#9ca3af', textAlign: 'center' },
  reportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 14, marginBottom: 8,
  },
  reportIconBox: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#f0f4f2', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  reportInfo: { flex: 1 },
  reportPest: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', fontWeight: '600', color: '#111827' },
  reportMeta: { fontSize: 12, fontFamily: 'Outfit_400Regular', fontWeight: '400', color: '#9ca3af', marginTop: 2 },
  confBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  confText: { fontSize: 12, fontFamily: 'Outfit_700Bold', fontWeight: '700' },
  settingsCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingsRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsIconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#f0f4f2', alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontSize: 15, fontFamily: 'Outfit_500Medium', fontWeight: '500', color: '#111827' },
  signOutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 12,
    paddingVertical: 14, marginTop: 4,
  },
  signOutText: { color: '#d32f2f', fontFamily: 'Outfit_600SemiBold', fontWeight: '600', fontSize: 15 },
})

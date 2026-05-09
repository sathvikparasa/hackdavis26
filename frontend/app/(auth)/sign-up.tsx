import { useSignUp } from '@clerk/expo'
import { type Href, useRouter } from 'expo-router'
import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SvgUri } from 'react-native-svg'

import { upsertProfile } from '@/lib/supabase'

const IMG_MFA_ILLUSTRATION = 'https://www.figma.com/api/mcp/asset/cb069a78-3950-4d1a-9064-d7e5f8e08653'

const DIGIT_COUNT = 6

export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp()
  const router = useRouter()

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [pendingVerification, setPendingVerification] = React.useState(false)

  const [digits, setDigits] = React.useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const inputRefs = React.useRef<(TextInput | null)[]>(Array(DIGIT_COUNT).fill(null))

  const isBusy = fetchStatus === 'fetching'
  const code = digits.join('')

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
          if (clerkId) {
            await upsertProfile(clerkId, email, name || undefined).catch(console.error)
          }
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
    if (value && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleDigitKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <Text style={styles.appTitle}>A N T I C I P A T E</Text>

        <View style={styles.mfaContent}>
          <Text style={[styles.heading, { textAlign: 'center' }]}>Check your email</Text>
          <Text style={styles.mfaSubtext}>
            {"We've sent a 6-digit verification code to\nyour email address."}
          </Text>

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
            style={({ pressed }) => [styles.buttonDark, (isBusy || code.length < 6) && styles.buttonDisabled, pressed && { opacity: 0.85 }]}
            onPress={handleVerify}
            disabled={isBusy || code.length < 6}
          >
            <Text style={styles.buttonDarkText}>{isBusy ? 'Verifying…' : 'Verify'}</Text>
          </Pressable>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>{"Didn't receive the code? "}</Text>
            <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
              <Text style={styles.resendLink}>Resend code</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.illustrationContainer} pointerEvents="none">
          <SvgUri uri={IMG_MFA_ILLUSTRATION} width={298} height={186} />
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.appTitle}>ANTICIPATE</Text>

      <View style={styles.headerSection}>
        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subheading}>Sign up to get started</Text>
      </View>

      <View style={styles.form}>
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
          onPress={handleSignUp}
          disabled={isBusy || !email || !password}
        >
          <Text style={styles.buttonText}>{isBusy ? 'Creating account…' : 'Continue'}</Text>
        </Pressable>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Already have an account? </Text>
        <Pressable onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.switchLink}>Sign in</Text>
        </Pressable>
      </View>

      <View nativeID="clerk-captcha" />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7faf5',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  appTitle: {
    fontWeight: '700',
    fontSize: 20,
    color: '#191c1a',
    letterSpacing: 6,
    textAlign: 'center',
    marginTop: 48,
    marginBottom: 56,
  },
  headerSection: {
    marginBottom: 40,
  },
  heading: {
    fontWeight: '700',
    fontSize: 30,
    color: '#191c1a',
    lineHeight: 36,
  },
  subheading: {
    fontWeight: '500',
    fontSize: 16,
    color: '#424844',
    lineHeight: 24,
    marginTop: 4,
  },
  form: {
    gap: 24,
    marginBottom: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontWeight: '500',
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#ecefea',
    borderWidth: 1,
    borderColor: '#c2c8c2',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 18,
    fontSize: 16,
    color: '#191c1a',
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
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  switchText: { color: '#424844', fontSize: 14 },
  switchLink: { color: '#546522', fontWeight: '600', fontSize: 14 },
  error: { color: '#d32f2f', fontSize: 13 },
  mfaContent: {
    alignItems: 'center',
    gap: 24,
  },
  mfaSubtext: {
    fontSize: 18,
    color: '#424844',
    textAlign: 'center',
    lineHeight: 28,
  },
  digitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  digitGap: {
    width: 16,
  },
  digitInput: {
    width: 48,
    height: 64,
    backgroundColor: '#f1f4ef',
    borderBottomWidth: 2,
    borderBottomColor: '#c2c8c2',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    fontSize: 28,
    color: '#191c1a',
    textAlign: 'center',
  },
  buttonDark: {
    backgroundColor: '#092016',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#092016',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDarkText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.7,
    lineHeight: 20,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: { color: '#424844', fontSize: 16 },
  resendLink: { color: '#546522', fontSize: 16 },
  illustrationContainer: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
  },
})

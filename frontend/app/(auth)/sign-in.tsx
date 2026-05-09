import { useSignIn } from '@clerk/expo'
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

const IMG_ILLUSTRATION = 'https://www.figma.com/api/mcp/asset/0723ae74-0748-4b52-8627-0c50a11e35bb'

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn()
  const router = useRouter()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')

  const isBusy = fetchStatus === 'fetching'

  const handleContinue = async () => {
    setError('')
    const { error: err } = await signIn.password({ emailAddress: email, password })
    if (err) { setError(err.message ?? 'Sign in failed'); return }
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          router.replace(decorateUrl('/(tabs)') as Href)
        },
      })
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.appTitle}>ANTICIPATE</Text>

      <View style={styles.headerSection}>
        <Text style={styles.heading}>Welcome back!</Text>
        <Text style={styles.subheading}>Sign in to continue</Text>
      </View>

      <View style={styles.form}>
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
          onPress={handleContinue}
          disabled={isBusy || !email || !password}
        >
          <Text style={styles.buttonText}>{isBusy ? 'Signing in…' : 'Continue'}</Text>
        </Pressable>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Don't have an account? </Text>
        <Pressable onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={styles.switchLink}>Sign up</Text>
        </Pressable>
      </View>

      <View style={styles.illustrationContainer} pointerEvents="none">
        <SvgUri uri={IMG_ILLUSTRATION} width={279} height={248} />
      </View>
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
    gap: 4,
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
  illustrationContainer: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
  },
})

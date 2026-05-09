import { useAuth, useClerk, useUser } from '@clerk/expo'
import { Redirect, useRouter } from 'expo-router'
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { upsertProfile } from '@/lib/supabase'

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

  if (!isLoaded) return null

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />
  }

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
        onPress={async () => {
          await signOut()
          router.replace('/(tabs)')
        }}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    minHeight: '100%',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4caf50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowLabel: { color: '#444', fontSize: 15 },
  rowValue: { color: '#888', fontSize: 15 },
  signOutButton: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#d32f2f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: '#d32f2f',
    fontWeight: '700',
    fontSize: 15,
  },
})

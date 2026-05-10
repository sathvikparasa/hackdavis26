import { useAuth, useUser } from '@clerk/expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

import { createSupabaseWithAccessToken } from '@/lib/supabase';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function PushNotificationsBootstrap() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const registeredUserRef = useRef<string | null>(null);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const authenticatedSupabase = useMemo(
    () =>
      createSupabaseWithAccessToken(async () => {
        try {
          return await getTokenRef.current();
        } catch (error) {
          console.warn('Unable to load Clerk token for push registration', error);
          return null;
        }
      }),
    []
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      registeredUserRef.current = null;
      return;
    }

    if (registeredUserRef.current === userId) {
      return;
    }

    let cancelled = false;
    registeredUserRef.current = userId;

    async function syncPushToken() {
      try {
        const expoPushToken = await registerForPushNotificationsAsync();
        if (!expoPushToken || cancelled) {
          return;
        }

        const email = user?.primaryEmailAddress?.emailAddress ?? null;
        const name = user?.fullName ?? user?.username ?? null;

        const { data: profile, error: profileError } = await authenticatedSupabase
          .from('profiles')
          .upsert(
            { clerk_user_id: userId, email, name },
            { onConflict: 'clerk_user_id' }
          )
          .select('id')
          .single();

        if (profileError) {
          throw profileError;
        }

        const { error: tokenError } = await authenticatedSupabase
          .from('push_tokens')
          .upsert(
            {
              profile_id: profile.id,
              clerk_user_id: userId,
              expo_push_token: expoPushToken,
              platform: Platform.OS,
              device_id: Constants.sessionId ?? null,
              enabled: true,
            },
            { onConflict: 'expo_push_token' }
          );

        if (tokenError) {
          throw tokenError;
        }
      } catch (error) {
        registeredUserRef.current = null;
        console.warn('Unable to register for push notifications', error);
      }
    }

    syncPushToken();

    return () => {
      cancelled = true;
    };
  }, [authenticatedSupabase, isLoaded, isSignedIn, user, userId]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const reportId = response.notification.request.content.data?.reportId;
      if (typeof reportId === 'string' && reportId.length > 0) {
        router.push(`/alert/${reportId}`);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web' || isExpoGo) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#238a3b',
    });
  }

  if (!Device.isDevice) {
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Missing EAS projectId for push notifications.');
  }

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

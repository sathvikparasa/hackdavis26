import { useAuth } from '@clerk/expo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { processPendingReports } from '@/lib/report-queue';

const RETRY_INTERVAL_MS = 30000;

export function OfflineReportWorker() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const retry = () => {
      void processPendingReports({ reporterUserId: userId });
    };

    retry();
    const interval = setInterval(retry, RETRY_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retry();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isSignedIn, userId]);

  return null;
}

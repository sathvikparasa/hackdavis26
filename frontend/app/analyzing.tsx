import { useUser } from '@clerk/expo';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { enqueuePendingReport } from '@/lib/report-queue';
import { ReportSubmissionError, submitReport } from '@/lib/report-submit';

const STEPS = [
  { icon: 'check-circle' as const, title: 'Photo received', detail: 'Upload complete' },
  { icon: 'generating-tokens' as const, title: 'Identifying pest', detail: 'with Gemini AI engine' },
  { icon: 'storage' as const, title: 'Checking IPM database', detail: '' },
  { icon: 'grain' as const, title: 'Assessing spread risk', detail: '' },
  { icon: 'auto-awesome' as const, title: 'Generating recommendations', detail: '' },
];

export default function AnalyzingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { imageUri } = useLocalSearchParams<{ imageUri?: string }>();
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const startedRef = useRef(false);
  const decodedImageUri = useMemo(
    () => (imageUri ? decodeURIComponent(imageUri) : ''),
    [imageUri]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, STEPS.length - 1));
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!queued) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace('/(tabs)/my-reports');
    }, 1800);

    return () => clearTimeout(timer);
  }, [queued, router]);

  useEffect(() => {
    if (!decodedImageUri) {
      setError('Missing image.');
      return;
    }
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    let cancelled = false;
    const payload = {
      cropType: 'unknown crop',
      imageUri: decodedImageUri,
      latitude: 38.5449,
      longitude: -121.7405,
      reporterUserId: user?.id,
    };

    submitReport(payload)
      .then((reportId) => {
        if (!cancelled) {
          setActiveStep(STEPS.length - 1);
          router.replace(`/alert/${reportId}`);
        }
      })
      .catch(async (err) => {
        if (!cancelled) {
          if (err instanceof ReportSubmissionError && err.retryable) {
            await enqueuePendingReport(payload);
            if (!cancelled) {
              setQueued(true);
              setActiveStep(0);
            }
            return;
          }

          setError(err instanceof Error ? err.message : 'Analysis failed.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [decodedImageUri, router, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.previewCard}>
        <View style={styles.imageFrame}>
          <Image source={{ uri: decodedImageUri }} style={styles.previewImage} contentFit="cover" />
          <View style={styles.scanBox} />
          <View style={styles.scanBadge}>
            <MaterialIcons name="document-scanner" size={18} color="#5f6f2c" />
            <Text style={styles.scanText}>Scanning...</Text>
          </View>
        </View>
      </View>

      {!queued ? (
        <View style={styles.stepsCard}>
          {STEPS.map((step, index) => {
            const done = index < activeStep;
            const active = index === activeStep;
            return (
              <View key={step.title} style={styles.stepRow}>
                {index < STEPS.length - 1 ? (
                  <View style={[styles.stepLine, (done || active) && styles.stepLineActive]} />
                ) : null}
                <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                  <MaterialIcons
                    name={done ? 'check' : step.icon}
                    size={16}
                    color={done || active ? '#fff' : '#d8ddd4'}
                  />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.stepTitle, active && styles.stepTitleActive]}>{step.title}</Text>
                  {step.detail ? (
                    <Text style={[styles.stepDetail, active && styles.stepDetailActive]}>{step.detail}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {queued ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Saved for upload</Text>
          <Text style={styles.offlineText}>
            No internet connection right now. Your report is saved on this device and will upload automatically when service returns.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => router.replace('/(tabs)/my-reports')}>
            <Text style={styles.retryText}>View Pending Report</Text>
          </Pressable>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryText}>Back to camera</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8faf4',
    flex: 1,
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderColor: '#e9ede5',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#21301f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
  },
  imageFrame: {
    aspectRatio: 1,
    backgroundColor: '#07170a',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    opacity: 0.84,
    width: '100%',
  },
  scanBox: {
    borderColor: 'rgba(230,242,211,0.28)',
    borderWidth: 1,
    bottom: 44,
    left: 42,
    position: 'absolute',
    right: 42,
    top: 22,
  },
  scanBadge: {
    alignItems: 'center',
    backgroundColor: '#f4f6e9',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 6,
    left: '50%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
    top: '47%',
    transform: [{ translateX: -58 }],
  },
  scanText: {
    color: '#5f6f2c',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  scanLabels: {
    bottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 18,
    position: 'absolute',
    right: 18,
  },
  scanLabel: {
    color: '#c7dbc1',
    fontFamily: 'Outfit_700Bold',
    fontSize: 6,
    opacity: 0.82,
  },
  stepsCard: {
    backgroundColor: '#fff',
    borderColor: '#e9ede5',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 30,
    paddingVertical: 28,
    shadowColor: '#21301f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 62,
    position: 'relative',
  },
  stepLine: {
    backgroundColor: '#d6dbd1',
    bottom: -22,
    left: 15,
    position: 'absolute',
    top: 33,
    width: 2,
  },
  stepLineActive: {
    backgroundColor: '#2d4a3e',
  },
  stepDot: {
    alignItems: 'center',
    backgroundColor: '#f0f2ee',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
    zIndex: 1,
  },
  stepDotActive: {
    backgroundColor: '#2d4a3e',
  },
  stepDotDone: {
    backgroundColor: '#2f7d32',
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: '#c8ccc4',
    fontFamily: 'Outfit_500Medium',
    fontSize: 18,
  },
  stepTitleActive: {
    color: '#1d211d',
    fontFamily: 'Outfit_700Bold',
  },
  stepDetail: {
    color: '#c8ccc4',
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    marginTop: 3,
  },
  stepDetailActive: {
    color: '#2f7d32',
  },
  errorCard: {
    gap: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontFamily: 'Outfit_500Medium',
    textAlign: 'center',
  },
  errorTitle: {
    color: '#111827',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  offlineText: {
    color: '#4b5563',
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#2d4a3e',
    borderRadius: 12,
    padding: 14,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Outfit_700Bold',
  },
});

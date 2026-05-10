import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@clerk/expo';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AffectedField,
  AlertItem,
  AlertSeverity,
  VulnerableCrop,
  fetchAlertById,
} from '@/lib/alerts';
import { createSupabaseWithAccessToken } from '@/lib/supabase';
import { useTutorial } from '@/lib/tutorial';

const severityStyles: Record<AlertSeverity, { pin: string; tint: string; text: string }> = {
  High: { pin: '#dc3b3b', tint: '#fdecec', text: '#b91c1c' },
  Moderate: { pin: '#f2a51a', tint: '#fff6df', text: '#b77908' },
  Low: { pin: '#238a3b', tint: '#eaf8ee', text: '#207232' },
};

export default function AlertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken, isSignedIn } = useAuth();
  const { step, advance } = useTutorial();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const [selectedCropIndex, setSelectedCropIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authenticatedSupabase = useMemo(
    () =>
      createSupabaseWithAccessToken(async () => {
        try {
          return await getTokenRef.current();
        } catch (tokenError) {
          console.warn('Unable to load Clerk session token', tokenError);
          return null;
        }
      }),
    []
  );

  const loadAlert = useCallback(async () => {
    if (!id) {
      setError('Missing alert id');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let affectedFieldIds: number[] = [];
      if (isSignedIn) {
        const { data, error: fieldsError } = await authenticatedSupabase
          .from('farmer_fields')
          .select('field_id')
          .order('field_id', { ascending: true });

        if (fieldsError) {
          console.warn('Unable to load alert affected fields', fieldsError);
        } else {
          affectedFieldIds = ((data ?? []) as { field_id: number }[]).map((row) => row.field_id);
        }
      }

      const nextAlert = await fetchAlertById(id, { affectedFieldIds });
      setAlert(nextAlert);
      setSelectedCropIndex(0);
      if (!nextAlert) {
        setError('Alert not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alert');
    } finally {
      setLoading(false);
    }
  }, [authenticatedSupabase, id, isSignedIn]);

  useEffect(() => {
    loadAlert();
  }, [loadAlert]);

  const colors = alert ? severityStyles[alert.severity] : severityStyles.Low;
  const selectedCrop = alert?.vulnerableCrops[selectedCropIndex] ?? null;
  const fullCropLabel = useMemo(
    () =>
      alert && alert.vulnerableCropNames.length > 0
        ? alert.vulnerableCropNames.join(', ')
        : alert?.vulnerableCropLabel ?? 'Unknown vulnerable crops',
    [alert]
  );
  const openAffectedFieldOnMap = useCallback(
    (field: AffectedField) => {
      if (step === 5) {
        advance();
      }
      router.push({
        pathname: '/(tabs)/alerts',
        params: {
          alertId: alert?.id,
          fieldId: field.fieldId ? String(field.fieldId) : undefined,
          view: 'map',
        },
      });
    },
    [advance, alert?.id, router, step]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <MaterialIcons name="chevron-left" size={28} color="#111827" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={loadAlert}>
            <MaterialIcons name="refresh" size={22} color="#111827" />
          </Pressable>
        </View>

        {loading ? (
          <StateMessage title="Loading alert" />
        ) : error || !alert ? (
          <StateMessage title="Unable to load alert" detail={error ?? undefined} />
        ) : (
          <>
            {alert.imageUrl ? (
              <Image
                source={{ uri: alert.imageUrl }}
                style={styles.heroBanner}
                contentFit="cover"
              />
            ) : null}

            <View style={styles.hero}>
              {!alert.imageUrl ? (
                <View style={[styles.heroIcon, { backgroundColor: colors.tint }]}>
                  <MaterialIcons name="pest-control" size={28} color={colors.pin} />
                </View>
              ) : null}
              <View style={styles.heroCopy}>
                <Text style={styles.title}>{alert.pest}</Text>
                <View style={styles.heroMetaRow}>
                  <View style={[styles.badge, { backgroundColor: colors.tint }]}>
                    <Text style={[styles.badgeText, { color: colors.text }]}>
                      {alert.severity}
                    </Text>
                  </View>
                  <Text style={styles.cropText}>{fullCropLabel}</Text>
                </View>
              </View>
            </View>

            <CropToggle
              crops={alert.vulnerableCrops}
              selectedIndex={selectedCropIndex}
              metrics={[
                { label: 'Radius', value: alert.travelDistance },
                { label: 'Spread', value: formatMethods(alert.spreadMethods) },
                { label: 'Confidence', value: formatPercent(alert.confidence) },
              ]}
              highlightedLabel={
                step === 3 ? 'Radius' : step === 4 ? 'Spread' : step === 2 ? 'Confidence' : undefined
              }
              onPrevious={() => setSelectedCropIndex((index) => Math.max(index - 1, 0))}
              onNext={() =>
                setSelectedCropIndex((index) =>
                  Math.min(index + 1, Math.max(alert.vulnerableCrops.length - 1, 0))
                )
              }
            />

            <Section title="Recommendations" icon="checklist">
              {selectedCrop?.recommendations ? (
                <Bullet text={selectedCrop.recommendations} />
              ) : (
                <Text style={styles.emptyText}>No recommendations were returned for this crop.</Text>
              )}
            </Section>

            <Section title="Crop Impact" icon="grass">
              {selectedCrop ? (
                <ImpactBlock impact={selectedCrop} />
              ) : (
                <Text style={styles.emptyText}>No crop impact details were returned.</Text>
              )}
            </Section>

            <Section title="Affected Fields" icon="map" highlighted={step === 5}>
              {alert.affectedFields.length > 0 ? (
                alert.affectedFields.map((field) => (
                  <AffectedFieldRow
                    key={`${field.fieldId}-${field.fieldName}`}
                    field={field}
                    onPress={() => openAffectedFieldOnMap(field)}
                  />
                ))
              ) : (
                <Text style={styles.emptyText}>No nearby affected fields are attached yet.</Text>
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CropToggle({
  crops,
  selectedIndex,
  metrics,
  highlightedLabel,
  onPrevious,
  onNext,
}: {
  crops: VulnerableCrop[];
  selectedIndex: number;
  metrics: { label: string; value: string }[];
  highlightedLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (crops.length === 0) {
    return null;
  }

  const selectedCrop = crops[selectedIndex];
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex < crops.length - 1;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -36 && canGoNext) {
            onNext();
          } else if (gesture.dx > 36 && canGoPrevious) {
            onPrevious();
          }
        },
      }),
    [canGoNext, canGoPrevious, onNext, onPrevious]
  );

  return (
    <View style={styles.cropToggle} {...panResponder.panHandlers}>
      <View style={styles.cropToggleHeader}>
        <Pressable
          style={[styles.cropToggleButton, !canGoPrevious && styles.cropToggleButtonDisabled]}
          disabled={!canGoPrevious}
          onPress={onPrevious}
        >
          <MaterialIcons name="chevron-left" size={22} color={canGoPrevious ? '#2f7d32' : '#a7b4aa'} />
        </Pressable>
        <View style={styles.cropToggleCopy}>
          <Text style={styles.cropToggleEyebrow}>
            Crop {selectedIndex + 1} of {crops.length}
          </Text>
          <Text style={styles.cropToggleTitle} numberOfLines={2}>
            {selectedCrop.cropType}
          </Text>
        </View>
        <Pressable
          style={[styles.cropToggleButton, !canGoNext && styles.cropToggleButtonDisabled]}
          disabled={!canGoNext}
          onPress={onNext}
        >
          <MaterialIcons name="chevron-right" size={22} color={canGoNext ? '#2f7d32' : '#a7b4aa'} />
        </Pressable>
      </View>
      <View style={styles.metrics} {...panResponder.panHandlers}>
        {metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} highlighted={metric.label === highlightedLabel} />
        ))}
      </View>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
  highlighted,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name={icon} size={21} color="#2f7d32" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={[styles.sectionBody, highlighted && styles.highlighted]}>{children}</View>
    </View>
  );
}

function Metric({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <View style={[styles.metric, highlighted && styles.highlighted]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bodyText}>{text}</Text>
    </View>
  );
}

function ImpactBlock({ impact }: { impact: VulnerableCrop }) {
  return (
    <View style={styles.impactBlock}>
      <Text style={styles.impactLabel}>Damage</Text>
      <Text style={styles.bodyText}>{impact.damageType}</Text>
      <View style={styles.durationRow}>
        <MaterialIcons name="schedule" size={17} color="#6b7280" />
        <Text style={styles.durationText}>{formatDuration(impact.durationDays)}</Text>
      </View>
    </View>
  );
}

function AffectedFieldRow({ field, onPress }: { field: AffectedField; onPress?: () => void }) {
  const colors = severityStyles[field.severity];
  const fieldMeta = [
    field.distanceMiles !== null ? formatMiles(field.distanceMiles) : null,
    field.riskScore !== null ? `${formatPercent(field.riskScore)} risk` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable style={styles.fieldRow} onPress={onPress} disabled={!onPress}>
      <View style={[styles.fieldIcon, { backgroundColor: colors.tint }]}>
        <MaterialIcons name="grass" size={18} color={colors.pin} />
      </View>
      <View style={styles.fieldCopy}>
        <View style={styles.fieldTitleRow}>
          <Text style={styles.fieldTitle} numberOfLines={1}>
            {field.crop}
          </Text>
          <Text style={[styles.fieldSeverity, { color: colors.text }]}>
            {field.severity}
          </Text>
        </View>
        {fieldMeta ? <Text style={styles.fieldMeta}>{fieldMeta}</Text> : null}
        {field.reasons.length > 0 ? (
          <Text style={styles.fieldReason} numberOfLines={2}>
            {field.reasons.join(' · ')}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <MaterialIcons name="chevron-right" size={22} color="#9ca3af" style={styles.fieldChevron} />
      ) : null}
    </Pressable>
  );
}

function StateMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
    </View>
  );
}

function formatMethods(methods: string[]): string {
  if (methods.length === 0) {
    return 'Unknown';
  }
  return methods.map((method) => method.charAt(0).toUpperCase() + method.slice(1)).join(', ');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMiles(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} mi`;
}

function formatDuration(days: number | null): string {
  if (days === null) {
    return 'Duration unavailable';
  }
  if (days >= 365) {
    const years = Math.round((days / 365) * 10) / 10;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    paddingBottom: 110,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  heroBanner: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
  },
  hero: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#111827',
    fontSize: 31,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  heroMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  cropText: {
    color: '#374151',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
  },
  metrics: {
    alignSelf: 'stretch',
    borderBottomColor: '#eef0ef',
    borderBottomWidth: 0,
    borderTopColor: '#eef0ef',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  metricLabel: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
    textAlign: 'center',
  },
  metricValue: {
    color: '#111827',
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
    marginTop: 3,
    textAlign: 'center',
  },
  cropToggle: {
    backgroundColor: '#fff',
    borderColor: '#dcefe2',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 6,
    padding: 10,
  },
  cropToggleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  cropToggleButton: {
    alignItems: 'center',
    backgroundColor: '#eaf8ee',
    borderRadius: 16,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  cropToggleButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  cropToggleCopy: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  cropToggleEyebrow: {
    color: '#6b7280',
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold', fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  cropToggleTitle: {
    color: '#111827',
    fontSize: 18,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
    textAlign: 'center',
  },
  section: {
    marginTop: 18,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
  },
  bulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  bulletDot: {
    backgroundColor: '#71897b',
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  bodyText: {
    color: '#374151',
    flex: 1,
    fontSize: 15,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    lineHeight: 22,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    lineHeight: 22,
  },
  impactBlock: {
    gap: 8,
  },
  impactLabel: {
    color: '#111827',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  durationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  durationText: {
    color: '#6b7280',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
  },
  fieldRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  fieldChevron: {
    marginTop: 6,
  },
  fieldIcon: {
    alignItems: 'center',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  fieldCopy: {
    flex: 1,
    minWidth: 0,
  },
  fieldTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  fieldTitle: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  fieldSeverity: {
    fontSize: 13,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  fieldMeta: {
    color: '#4b5563',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 5,
  },
  fieldReason: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    lineHeight: 18,
    marginTop: 6,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 17,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  stateDetail: {
    color: '#6b7280',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 8,
    textAlign: 'center',
  },
  highlighted: {
    borderColor: '#2d4a3e',
    borderWidth: 2,
    shadowColor: '#2d4a3e',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

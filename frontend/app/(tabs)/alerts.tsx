import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertItem, AlertSeverity, fetchAlerts } from '@/lib/alerts';
import { getFilterState, subscribeFilterState } from '@/lib/filter-store';

const severityConfig: Record<AlertSeverity, { cardBg: string; accent: string }> = {
  High:     { cardBg: 'rgba(186,26,26,0.04)',  accent: '#ba1a1a' },
  Moderate: { cardBg: 'rgba(217,119,6,0.04)',  accent: '#d97706' },
  Low:      { cardBg: 'rgba(35,138,59,0.04)',   accent: '#238a3b' },
};

export default function AlertsScreen() {
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(getFilterState);

  useEffect(() => subscribeFilterState(setFilters), []);

  const { crops, pests: pestTypes, severities } = filters;
  const hasActiveFilters =
    !crops.includes('All Crops') || !pestTypes.includes('All Pests') || !severities.includes('All');

  async function loadAlerts() {
    try {
      setLoading(true);
      setError(null);
      setAlerts(await fetchAlerts());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAlerts(); }, []);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const cropMatch = crops.includes('All Crops') || crops.includes(alert.crop);
        const pestMatch = pestTypes.includes('All Pests') || pestTypes.includes(alert.type);
        const severityMatch = severities.includes('All') || severities.includes(alert.severity);
        const queryMatch =
          query.trim().length === 0 ||
          `${alert.pest} ${alert.crop}`.toLowerCase().includes(query.trim().toLowerCase());
        return cropMatch && pestMatch && severityMatch && queryMatch;
      }),
    [alerts, crops, pestTypes, query, severities]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.feedSection}>
          <Text style={styles.sectionHeading}>Alerts</Text>

          {/* Search + Filter row */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={18} color="#9ca3af" />
              <TextInput
                placeholder="Search pests, crops..."
                placeholderTextColor="#9ca3af"
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
              />
            </View>
            <Pressable
              style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
              onPress={() => router.push('/alert/filter')}
            >
              <MaterialIcons name="tune" size={18} color={hasActiveFilters ? '#fff' : '#424844'} />
            </Pressable>
          </View>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
              {[...crops.filter(c => c !== 'All Crops'), ...pestTypes.filter(p => p !== 'All Pests'), ...severities.filter(s => s !== 'All')].map((chip) => (
                <View key={chip} style={styles.chip}>
                  <Text style={styles.chipText}>{chip}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.list}>
            {loading ? (
              <StateMessage title="Loading alerts…" />
            ) : error ? (
              <StateMessage title="Unable to load alerts" detail={error} action="Retry" onPress={loadAlerts} />
            ) : filteredAlerts.length === 0 ? (
              <StateMessage title="No alerts found" detail="New public reports will appear here." />
            ) : (
              filteredAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onPress={() => router.push(`/alert/${alert.id}`)}
                  onViewMap={() => router.push({ pathname: '/(tabs)/pest-map', params: { alertId: alert.id } })}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function usePestImage(pestName: string): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pestName)}&prop=pageimages&format=json&pithumbsize=300&origin=*`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const pages = data?.query?.pages ?? {};
        const page = Object.values(pages)[0] as { thumbnail?: { source?: string } };
        const url = page?.thumbnail?.source;
        if (url) setUri(url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pestName]);
  return uri;
}

function pestTypeIcon(type: AlertItem['type']): keyof typeof MaterialIcons.glyphMap {
  if (type === 'Fungi') return 'scatter-plot';
  if (type === 'Weeds') return 'yard';
  if (type === 'Nematodes') return 'blur-on';
  return 'bug-report';
}

function AlertCard({ alert, onPress, onViewMap }: { alert: AlertItem; onPress: () => void; onViewMap: () => void }) {
  const cfg = severityConfig[alert.severity];
  const imageUri = usePestImage(alert.pest);

  const affectingCrops = [
    ...new Set(
      alert.affectedFields.length > 0
        ? alert.affectedFields.map((f) => f.crop)
        : [alert.crop]
    ),
  ]
    .slice(0, 2)
    .join(', ');

  return (
    <Pressable style={[styles.card, { backgroundColor: cfg.cardBg }]} onPress={onPress}>
      <View style={styles.cardInner}>
        {/* Left: pest image */}
        <View style={[styles.pestImageBox, { borderRightColor: cfg.accent, borderRightWidth: 2 }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.pestImage} contentFit="cover" />
          ) : (
            <View style={[styles.pestImagePlaceholder, { backgroundColor: cfg.cardBg }]}>
              <MaterialIcons name={pestTypeIcon(alert.type)} size={30} color={cfg.accent} />
            </View>
          )}
        </View>

        {/* Right: content */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{alert.pest}</Text>
          <Text style={styles.cropLabel}>{alert.crop}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialIcons name="place" size={12} color="#9ca3af" />
              <Text style={styles.metaText} numberOfLines={1}>{alert.distance}</Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <View style={styles.metaItem}>
              <MaterialIcons name="access-time" size={12} color="#9ca3af" />
              <Text style={styles.metaText} numberOfLines={1}>{alert.time}</Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <View style={styles.metaItem}>
              <MaterialIcons name="radio-button-unchecked" size={12} color="#9ca3af" />
              <Text style={styles.metaText} numberOfLines={1}>{alert.travelDistance}</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={[styles.cardFooter, { borderTopColor: cfg.accent + '40' }]}>
            <Text style={styles.affectingText} numberOfLines={1}>
              Affecting: <Text style={styles.affectingCrop}>{affectingCrops}</Text>
            </Text>
            <Pressable style={styles.viewMapBtn} onPress={(e) => { e.stopPropagation?.(); onViewMap(); }}>
              <Text style={styles.viewMapText}>Map</Text>
              <MaterialIcons name="chevron-right" size={13} color="#1a2e1a" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function StateMessage({
  title, detail, action, onPress,
}: {
  title: string; detail?: string; action?: string; onPress?: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {action ? (
        <Pressable onPress={onPress} style={styles.stateButton}>
          <Text style={styles.stateButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7faf5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  feedSection: {
    marginTop: 20,
    gap: 14,
  },
  sectionHeading: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#191c1a',
    fontWeight: '500',
  },
  filterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  filterBtnActive: {
    backgroundColor: '#1a2e1a',
    borderColor: '#1a2e1a',
  },
  chipsRow: {
    marginTop: -4,
  },
  chipsContent: {
    gap: 6,
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: '#1a2e1a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  card: {
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardInner: {
    flexDirection: 'row',
    minHeight: 120,
  },
  pestImageBox: {
    width: 96,
  },
  pestImage: {
    width: '100%',
    height: '100%',
  },
  pestImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 5,
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  cropLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  metaDot: {
    color: '#d1d5db',
    fontSize: 12,
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  affectingText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  affectingCrop: {
    color: '#374151',
    fontWeight: '700',
  },
  viewMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewMapText: {
    color: '#1a2e1a',
    fontSize: 13,
    fontWeight: '700',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  stateDetail: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  stateButton: {
    borderColor: '#e5e7eb',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  stateButtonText: {
    color: '#1a2e1a',
    fontSize: 14,
    fontWeight: '700',
  },
});

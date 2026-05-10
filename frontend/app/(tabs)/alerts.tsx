import { useAuth } from '@clerk/expo';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertListView } from '@/components/alert-list-view';
import { AlertMapView } from '@/components/alert-map-view';
import { AlertItem, fetchAlerts } from '@/lib/alerts';
import { createSupabaseWithAccessToken } from '@/lib/supabase';
import { getFilterState, subscribeFilterState } from '@/lib/filter-store';
import { useTutorial } from '@/lib/tutorial';

type ViewMode = 'list' | 'map';

export default function AlertsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { step, advance } = useTutorial();
  const { userId, getToken } = useAuth();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(getFilterState);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedMapAlertId, setSelectedMapAlertId] = useState<string | null>(null);

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

  async function handleDelete(alertId: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      const authedSupabase = createSupabaseWithAccessToken(() => getToken());
      const { error } = await authedSupabase.from('reports').delete().eq('id', alertId);
      if (error) throw error;
    } catch (err) {
      console.error('Delete failed:', err);
      loadAlerts();
    }
  }

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const cropMatch =
          crops.includes('All Crops') ||
          alert.vulnerableCropNames.some((crop) => crops.includes(crop));
        const pestMatch = pestTypes.includes('All Pests') || pestTypes.includes(alert.type);
        const severityMatch = severities.includes('All') || severities.includes(alert.severity);
        const queryMatch =
          query.trim().length === 0 ||
          `${alert.pest} ${alert.vulnerableCropLabel}`.toLowerCase().includes(query.trim().toLowerCase());
        return cropMatch && pestMatch && severityMatch && queryMatch;
      }),
    [alerts, crops, pestTypes, query, severities]
  );
  const selectedMapAlert = filteredAlerts.find((alert) => alert.id === selectedMapAlertId) ?? null;

  function openFilter() {
    router.push('/alert/filter');
  }

  function openAlert(alertId: string) {
    if (step === 1) advance();
    router.push(`/alert/${alertId}`);
  }

  function openMapAlert(alertId: string) {
    setSelectedMapAlertId(alertId);
    setViewMode('map');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {viewMode === 'list' ? (
        <AlertListView
          alerts={filteredAlerts}
          crops={crops}
          error={error}
          hasActiveFilters={hasActiveFilters}
          loading={loading}
          onDelete={handleDelete}
          onOpenAlert={openAlert}
          onOpenFilter={openFilter}
          onOpenMap={openMapAlert}
          onRetry={loadAlerts}
          pestTypes={pestTypes}
          query={query}
          setQuery={setQuery}
          severities={severities}
          userId={userId ?? null}
        />
      ) : (
        <AlertMapView
          alerts={filteredAlerts}
          allAlertsCount={alerts.length}
          crops={crops}
          error={error}
          hasActiveFilters={hasActiveFilters}
          headerTop={insets.top + 8}
          loading={loading}
          onClearSelection={() => setSelectedMapAlertId(null)}
          onOpenAlert={openAlert}
          onOpenFilter={openFilter}
          onSelectAlert={setSelectedMapAlertId}
          pestTypes={pestTypes}
          query={query}
          selectedAlert={selectedMapAlert}
          selectedAlertId={selectedMapAlertId}
          setQuery={setQuery}
          severities={severities}
        />
      )}

      <View style={[styles.fixedViewToggle, { top: insets.top + 18 }]}>
        <Pressable
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
          onPress={() => setViewMode('list')}
        >
          <MaterialIcons name="format-list-bulleted" size={19} color={viewMode === 'list' ? '#fff' : '#6b7280'} />
        </Pressable>
        <Pressable
          style={[styles.toggleButton, viewMode === 'map' && styles.toggleButtonActive]}
          onPress={() => setViewMode('map')}
        >
          <MaterialIcons name="map" size={19} color={viewMode === 'map' ? '#fff' : '#6b7280'} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fixedViewToggle: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
    position: 'absolute',
    right: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    zIndex: 11,
  },
  safe: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  toggleButtonActive: {
    backgroundColor: '#2d4a3e',
  },
});

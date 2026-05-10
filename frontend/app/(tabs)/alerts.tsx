import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Geometry } from 'geojson';

import { AlertListView } from '@/components/alert-list-view';
import { AlertMapView } from '@/components/alert-map-view';
import { AlertItem, fetchAlerts } from '@/lib/alerts';
import { getFilterState, subscribeFilterState } from '@/lib/filter-store';
import { createSupabaseWithAccessToken } from '@/lib/supabase';
import { useTutorial } from '@/lib/tutorial';

type ViewMode = 'list' | 'map';

type AlertMapField = {
  crop: string | null;
  geometry: Geometry;
  id: number;
};

type FarmerFieldRow = {
  crop_type: string | null;
  field_id: number;
  fields:
    | {
        geometry_simplified: unknown;
        id: number;
      }
    | {
        geometry_simplified: unknown;
        id: number;
      }[]
    | null;
};

export default function AlertsScreen() {
  const { getToken, isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ alertId?: string; fieldId?: string; view?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { step, advance } = useTutorial();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertMapFields, setAlertMapFields] = useState<AlertMapField[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(getFilterState);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedMapAlertId, setSelectedMapAlertId] = useState<string | null>(null);
  const focusedFieldId = useMemo(() => {
    const fieldId = Array.isArray(params.fieldId) ? params.fieldId[0] : params.fieldId;
    const parsed = Number(fieldId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.fieldId]);

  useEffect(() => subscribeFilterState(setFilters), []);

  const authenticatedSupabase = useMemo(
    () => createSupabaseWithAccessToken(async () => {
      try {
        return await getTokenRef.current();
      } catch (tokenError) {
        console.warn('Unable to load Clerk session token', tokenError);
        return null;
      }
    }),
    []
  );

  const { crops, pests: pestTypes, severities } = filters;
  const hasActiveFilters =
    !crops.includes('All Crops') || !pestTypes.includes('All Pests') || !severities.includes('All');

  async function loadAlerts() {
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
          affectedFieldIds = ((data ?? []) as Pick<FarmerFieldRow, 'field_id'>[]).map((row) => row.field_id);
        }
      }

      setAlerts(await fetchAlerts({ affectedFieldIds }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAlerts(); }, [authenticatedSupabase, isSignedIn]);

  useEffect(() => {
    const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
    const requestedAlertId = Array.isArray(params.alertId) ? params.alertId[0] : params.alertId;
    if (requestedView === 'map') {
      setViewMode('map');
    }
    if (requestedAlertId) {
      setSelectedMapAlertId(requestedAlertId);
    }
  }, [params.alertId, params.view]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlertMapFields() {
      if (!isSignedIn) {
        setAlertMapFields([]);
        return;
      }

      const { data, error: fieldsError } = await authenticatedSupabase
        .from('farmer_fields')
        .select('field_id,crop_type,fields(id,geometry_simplified)')
        .order('field_id', { ascending: true });

      if (cancelled) {
        return;
      }

      if (fieldsError) {
        console.warn('Unable to load alert map fields', fieldsError);
        setAlertMapFields([]);
        return;
      }

      const nextFields = ((data ?? []) as FarmerFieldRow[])
        .map(toAlertMapField)
        .filter((field): field is AlertMapField => !!field);

      setAlertMapFields(nextFields);
    }

    void loadAlertMapFields();

    return () => {
      cancelled = true;
    };
  }, [authenticatedSupabase, isSignedIn]);

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
    <View style={styles.safe}>
      {viewMode === 'list' ? (
        <SafeAreaView style={styles.safe} edges={['top']}>
          <AlertListView
            alerts={filteredAlerts}
            crops={crops}
            error={error}
            hasActiveFilters={hasActiveFilters}
            loading={loading}
            onOpenAlert={openAlert}
            onOpenFilter={openFilter}
            onOpenMap={openMapAlert}
            onRetry={loadAlerts}
            pestTypes={pestTypes}
            query={query}
            setQuery={setQuery}
            severities={severities}
          />
        </SafeAreaView>
      ) : (
        <AlertMapView
          alerts={filteredAlerts}
          allAlertsCount={alerts.length}
          alertMapFields={alertMapFields}
          crops={crops}
          centerButtonTop={insets.top + 76}
          error={error}
          focusedFieldId={focusedFieldId}
          hasActiveFilters={hasActiveFilters}
          headerTop={insets.top + 12}
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

      <View style={[styles.fixedViewToggle, { top: insets.top + 12 }]}>
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
    </View>
  );
}

function toAlertMapField(row: FarmerFieldRow): AlertMapField | null {
  const joinedField = Array.isArray(row.fields) ? row.fields[0] : row.fields;
  if (!joinedField) {
    return null;
  }

  const geometry = parseGeometry(joinedField.geometry_simplified);
  if (!geometry) {
    return null;
  }

  return {
    crop: row.crop_type,
    geometry,
    id: row.field_id,
  };
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseGeometry(value: unknown): Geometry | null {
  value = parseJsonLike(value);

  if (!value || typeof value !== 'object') {
    return null;
  }

  const geometry = value as Partial<Geometry>;
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    return geometry as Geometry;
  }

  return null;
}

const styles = StyleSheet.create({
  fixedViewToggle: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    height: 52,
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
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  toggleButtonActive: {
    backgroundColor: '#2d4a3e',
  },
});

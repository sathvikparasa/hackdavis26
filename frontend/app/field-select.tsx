import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Polygon, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

type Field = {
  unique_id: string;
  main_crop: string | null;
  county: string | null;
  acres: number | null;
  region: string | null;
  coords: { latitude: number; longitude: number }[];
};

const DAVIS: Region = {
  latitude: 38.544,
  longitude: -121.741,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const CROP_LABELS: Record<string, string> = {
  R1: 'Rice',      R2: 'Rice',
  T4: 'Tomatoes',  T9: 'Tomatoes',  T10: 'Tomatoes', T16: 'Tomatoes',
  T18: 'Tomatoes', T21: 'Tomatoes', T32: 'Tomatoes',
  C: 'Corn',       C6: 'Corn',      C8: 'Corn',      C10: 'Corn',
  D1: 'Orchard',   D2: 'Orchard',   D3: 'Orchard',   D5: 'Orchard',
  D6: 'Orchard',   D8: 'Orchard',   D10: 'Orchard',  D12: 'Orchard',
  D13: 'Orchard',  D14: 'Orchard',  D15: 'Orchard',  D17: 'Orchard',
  F2: 'Field Crop', F10: 'Field Crop', F11: 'Field Crop',
  F12: 'Field Crop', F16: 'Field Crop',
  G2: 'Grain',     G6: 'Grain',
  V: 'Vegetables',
  P1: 'Pasture',   P3: 'Pasture',   P6: 'Pasture',   P7: 'Pasture',
  I1: 'Idle',      I4: 'Idle',
  X: 'Other',      YP: 'Young Plants',
};

function cropLabel(code: string | null) {
  if (!code) return 'Unknown';
  return CROP_LABELS[code] ?? code;
}

function geoJsonToCoords(coordinates: number[][][]): { latitude: number; longitude: number }[] {
  const ring = coordinates?.[0];
  if (!ring) return [];
  return ring.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
}

function regionToBounds(r: Region) {
  return {
    min_lat: r.latitude - r.latitudeDelta / 2,
    max_lat: r.latitude + r.latitudeDelta / 2,
    min_lon: r.longitude - r.longitudeDelta / 2,
    max_lon: r.longitude + r.longitudeDelta / 2,
  };
}

export default function FieldSelectScreen() {
  const [fields, setFields] = useState<Field[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<Record<string, Field>>({});
  const [callout, setCallout] = useState<Field | null>(null);

  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to selected so the async fetch closure never goes stale
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  async function loadFieldsForRegion(region: Region) {
    setFetching(true);
    const bounds = regionToBounds(region);
    const { data, error } = await supabase.rpc('get_fields_in_region', {
      min_lat: bounds.min_lat,
      max_lat: bounds.max_lat,
      min_lon: bounds.min_lon,
      max_lon: bounds.max_lon,
      lat_delta: region.latitudeDelta,
      max_rows: 300,
    });

    if (!error && data) {
      const parsed: Field[] = data.map((row: any) => ({
        unique_id: row.unique_id,
        main_crop: row.main_crop,
        county: row.county,
        acres: row.acres,
        region: row.region,
        coords: geoJsonToCoords(row.coordinates ?? []),
      }));

      setFields((prev) => {
        // Always keep selected fields in the list even if outside viewport
        const sel = selectedRef.current;
        const prevSelected = prev.filter((f) => sel[f.unique_id]);
        const newIds = new Set(parsed.map((f) => f.unique_id));
        return [...parsed, ...prevSelected.filter((f) => !newIds.has(f.unique_id))];
      });
    }

    setFetching(false);
    setInitialLoading(false);
  }

  function handleRegionChange(region: Region) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadFieldsForRegion(region), 400);
  }

  useEffect(() => {
    loadFieldsForRegion(DAVIS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handlePolygonPress(field: Field) {
    // Show info callout — user confirms by tapping Add/Remove in the card
    setCallout((prev) => (prev?.unique_id === field.unique_id ? null : field));
  }

  function toggleField(field: Field) {
    setSelected((prev) => {
      if (prev[field.unique_id]) {
        const next = { ...prev };
        delete next[field.unique_id];
        return next;
      }
      return { ...prev, [field.unique_id]: field };
    });
    setCallout(null);
  }

  function zoomToField(field: Field) {
    if (field.coords.length === 0) return;
    const lats = field.coords.map((c) => c.latitude);
    const lons = field.coords.map((c) => c.longitude);
    mapRef.current?.animateToRegion(
      {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
        latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 3,
        longitudeDelta: (Math.max(...lons) - Math.min(...lons)) * 3,
      },
      400,
    );
    setView('map');
  }

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const totalAcres = useMemo(
    () => selectedList.reduce((sum, f) => sum + (f.acres ?? 0), 0),
    [selectedList],
  );

  // Memoize polygons so they don't re-render when unrelated state changes
  const polygons = useMemo(
    () =>
      fields.map((f) => {
        if (f.coords.length < 3) return null;
        const isSelected = !!selected[f.unique_id];
        const isCallout = callout?.unique_id === f.unique_id;
        return (
          <Polygon
            key={f.unique_id}
            coordinates={f.coords}
            fillColor={
              isSelected
                ? 'rgba(74,222,128,0.55)'
                : isCallout
                  ? 'rgba(74,222,128,0.25)'
                  : 'rgba(45,106,79,0.2)'
            }
            strokeColor={isSelected || isCallout ? '#22c55e' : '#52b788'}
            strokeWidth={isSelected || isCallout ? 2 : 0.8}
            tappable
            onPress={() => handlePolygonPress(f)}
          />
        );
      }),
    [fields, selected, callout],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Select Your Fields</Text>
        <View style={styles.toggle}>
          {(['map', 'list'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.toggleBtn, view === v && styles.toggleActive]}
              onPress={() => { setView(v); setCallout(null); }}
            >
              <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
                {v === 'map' ? 'Map' : 'List'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {initialLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1a2e1a" />
          <Text style={styles.loadingText}>Loading fields…</Text>
        </View>
      ) : view === 'map' ? (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={DAVIS}
            mapType="satellite"
            onRegionChangeComplete={handleRegionChange}
            onPress={() => setCallout(null)}
          >
            {polygons}
          </MapView>

          {/* Non-blocking fetch indicator */}
          {fetching && (
            <View style={styles.fetchIndicator}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}

          {/* Tapped field callout */}
          {callout && (
            <View style={styles.callout}>
              <View style={styles.calloutInfo}>
                <Text style={styles.calloutCrop}>{cropLabel(callout.main_crop)}</Text>
                <Text style={styles.calloutMeta}>
                  {callout.county ?? '—'} · {(callout.acres ?? 0).toFixed(1)} ac
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.calloutBtn,
                  selected[callout.unique_id] && styles.calloutBtnRemove,
                ]}
                onPress={() => toggleField(callout)}
              >
                <Text style={styles.calloutBtnText}>
                  {selected[callout.unique_id] ? 'Remove' : 'Add Field'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={fields}
          keyExtractor={(f) => f.unique_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = !!selected[item.unique_id];
            return (
              <TouchableOpacity
                style={[styles.listRow, isSelected && styles.listRowSelected]}
                onPress={() => {
                  toggleField(item);
                  if (!isSelected) zoomToField(item);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.listRowInfo}>
                  <Text style={styles.listCrop}>{cropLabel(item.main_crop)}</Text>
                  <Text style={styles.listMeta}>
                    {item.county ?? '—'} · {(item.acres ?? 0).toFixed(1)} ac
                  </Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {selectedList.length === 0 ? (
          <Text style={styles.hintText}>
            {view === 'map' ? 'Tap a field to see details' : 'Tap a field to select it'}
          </Text>
        ) : (
          <View style={styles.bottomRow}>
            <View>
              <Text style={styles.selectedCount}>
                {selectedList.length} field{selectedList.length !== 1 ? 's' : ''} selected
              </Text>
              <Text style={styles.selectedAcres}>{totalAcres.toFixed(1)} total acres</Text>
            </View>
            <TouchableOpacity style={styles.confirmBtn}>
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a2e1a' },
  toggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 6 },
  toggleActive: { backgroundColor: '#1a2e1a' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#fff' },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  fetchIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    padding: 6,
  },
  callout: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  calloutInfo: { flex: 1 },
  calloutCrop: { fontSize: 15, fontWeight: '700', color: '#1a2e1a' },
  calloutMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  calloutBtn: {
    backgroundColor: '#1a2e1a',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  calloutBtnRemove: { backgroundColor: '#ef4444' },
  calloutBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },
  listContent: { padding: 12, gap: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  listRowSelected: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  listRowInfo: { flex: 1 },
  listCrop: { fontSize: 15, fontWeight: '600', color: '#1a2e1a' },
  listMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  hintText: { color: '#9ca3af', fontSize: 13, textAlign: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedCount: { fontSize: 15, fontWeight: '700', color: '#1a2e1a' },
  selectedAcres: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  confirmBtn: {
    backgroundColor: '#1a2e1a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

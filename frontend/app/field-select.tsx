import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  geometry: string;
  coords: { latitude: number; longitude: number }[];
};

const DAVIS: Region = {
  latitude: 38.544,
  longitude: -121.741,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const CROP_LABELS: Record<string, string> = {
  R1: 'Rice', R2: 'Rice',
  T4: 'Tomatoes', T9: 'Tomatoes', T10: 'Tomatoes', T16: 'Tomatoes',
  T18: 'Tomatoes', T21: 'Tomatoes', T32: 'Tomatoes',
  C: 'Corn', C6: 'Corn', C8: 'Corn', C10: 'Corn',
  D1: 'Orchard', D2: 'Orchard', D3: 'Orchard', D5: 'Orchard',
  D6: 'Orchard', D8: 'Orchard', D10: 'Orchard', D12: 'Orchard',
  D13: 'Orchard', D14: 'Orchard', D15: 'Orchard', D17: 'Orchard',
  F2: 'Field Crop', F10: 'Field Crop', F11: 'Field Crop',
  F12: 'Field Crop', F16: 'Field Crop',
  G2: 'Grain', G6: 'Grain',
  V: 'Vegetables',
  P1: 'Pasture', P3: 'Pasture', P6: 'Pasture', P7: 'Pasture',
  I1: 'Idle', I4: 'Idle',
  X: 'Other', YP: 'Young Plants',
};

function cropLabel(code: string | null) {
  if (!code) return 'Unknown';
  return CROP_LABELS[code] ?? code;
}

function parseWKT(wkt: string): { latitude: number; longitude: number }[] {
  if (!wkt) return [];
  const poly = wkt.match(/^POLYGON \(\((.+)\)\)$/s);
  if (poly) {
    return poly[1].split(', ').map((pair) => {
      const [lon, lat] = pair.trim().split(' ').map(Number);
      return { latitude: lat, longitude: lon };
    });
  }
  const multi = wkt.match(/MULTIPOLYGON \(\(\((.+?)\)\)/s);
  if (multi) {
    return multi[1].split(', ').map((pair) => {
      const [lon, lat] = pair.trim().split(' ').map(Number);
      return { latitude: lat, longitude: lon };
    });
  }
  return [];
}

function inViewport(coords: { latitude: number; longitude: number }[], region: Region) {
  const pad = 0.02;
  return coords.some(
    (c) =>
      c.latitude >= region.latitude - region.latitudeDelta - pad &&
      c.latitude <= region.latitude + region.latitudeDelta + pad &&
      c.longitude >= region.longitude - region.longitudeDelta - pad &&
      c.longitude <= region.longitude + region.longitudeDelta + pad,
  );
}

const PAGE = 500;

export default function FieldSelectScreen() {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<Record<string, Field>>({});
  const [region, setRegion] = useState<Region>(DAVIS);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadFields();
  }, []);

  async function loadFields() {
    setLoading(true);
    let all: Field[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('fields')
        .select('unique_id, main_crop, county, acres, region, geometry')
        .range(from, from + PAGE - 1);

      if (error || !data || data.length === 0) break;

      const parsed = data.map((row) => ({
        ...row,
        coords: parseWKT(row.geometry ?? ''),
      }));

      all = [...all, ...parsed];
      setFields([...all]);

      if (data.length < PAGE) break;
      from += PAGE;
    }

    setLoading(false);
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
  }

  function zoomToField(field: Field) {
    if (field.coords.length === 0) return;
    const lats = field.coords.map((c) => c.latitude);
    const lons = field.coords.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLon + maxLon) / 2,
        latitudeDelta: (maxLat - minLat) * 2.5,
        longitudeDelta: (maxLon - minLon) * 2.5,
      },
      400,
    );
    setView('map');
  }

  const visibleFields = useMemo(
    () =>
      fields.filter(
        (f) => selected[f.unique_id] || (f.coords.length >= 3 && inViewport(f.coords, region)),
      ),
    [fields, region, selected],
  );

  const selectedList = Object.values(selected);
  const totalAcres = selectedList.reduce((sum, f) => sum + (f.acres ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Select Your Fields</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'map' && styles.toggleActive]}
            onPress={() => setView('map')}
          >
            <Text style={[styles.toggleText, view === 'map' && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'list' && styles.toggleActive]}
            onPress={() => setView('list')}
          >
            <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && fields.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1a2e1a" />
          <Text style={styles.loadingText}>Loading fields…</Text>
        </View>
      ) : view === 'map' ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={DAVIS}
          mapType="satellite"
          onRegionChangeComplete={setRegion}
        >
          {visibleFields.map((f) => {
            if (f.coords.length < 3) return null;
            const isSelected = !!selected[f.unique_id];
            return (
              <Polygon
                key={f.unique_id}
                coordinates={f.coords}
                fillColor={isSelected ? 'rgba(74,222,128,0.55)' : 'rgba(45,106,79,0.25)'}
                strokeColor={isSelected ? '#22c55e' : '#52b788'}
                strokeWidth={isSelected ? 2 : 0.5}
                tappable
                onPress={() => toggleField(f)}
              />
            );
          })}
        </MapView>
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
            {view === 'map' ? 'Tap a field on the map to select it' : 'Tap a field to select it'}
          </Text>
        ) : (
          <View style={styles.bottomRow}>
            <View>
              <Text style={styles.selectedCount}>{selectedList.length} fields selected</Text>
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
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleActive: { backgroundColor: '#1a2e1a' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#fff' },
  map: { flex: 1 },
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

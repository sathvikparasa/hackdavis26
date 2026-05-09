import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Geojson, PROVIDER_DEFAULT, Region, type GeojsonProps } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FeatureCollection, Geometry } from 'geojson';

import { supabase } from '@/lib/supabase';

type FieldRow = {
  id: number;
  geometry_simplified: unknown;
};

type VisualField = {
  geometry: Geometry;
  id: number;
};

const INITIAL_REGION = {
  latitude: 38.544,
  longitude: -121.741,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3,
};

const FETCH_DEBOUNCE_MS = 500;
const MAX_REGION_FIELDS = 1200;
const MIN_LOAD_ZOOM_DELTA = 0.12;
const VIEWPORT_PADDING_RATIO = 0.15;
const DUPLICATE_TAP_GUARD_MS = 250;

export default function FieldSelectScreen() {
  const [fields, setFields] = useState<VisualField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldsById, setSelectedFieldsById] = useState<Record<number, VisualField>>({});
  const [zoomedInEnough, setZoomedInEnough] = useState(isZoomedInEnough(INITIAL_REGION));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToggleRef = useRef<{ id: number; time: number } | null>(null);
  const requestIdRef = useRef(0);

  const loadFieldsForRegion = useCallback(async (region: Region) => {
    const requestId = ++requestIdRef.current;
    const canLoad = isZoomedInEnough(region);
    setZoomedInEnough(canLoad);

    if (!canLoad) {
      setLoading(false);
      setError(null);
      setFields([]);
      return;
    }

    setLoading(true);
    setError(null);

    const bounds = regionToBounds(region);
    const { data, error: queryError } = await supabase
      .from('fields')
      .select('id,geometry_simplified')
      .lte('min_lon', bounds.maxLon)
      .gte('max_lon', bounds.minLon)
      .lte('min_lat', bounds.maxLat)
      .gte('max_lat', bounds.minLat)
      .order('id', { ascending: true })
      .limit(MAX_REGION_FIELDS);

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setFields(((data ?? []) as FieldRow[]).map(toVisualField).filter((field): field is VisualField => !!field));
    setLoading(false);
  }, []);

  const scheduleLoadForRegion = useCallback(
    (region: Region) => {
      setZoomedInEnough(isZoomedInEnough(region));

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        loadFieldsForRegion(region);
      }, FETCH_DEBOUNCE_MS);
    },
    [loadFieldsForRegion]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const selectedIdList = useMemo(
    () => Object.keys(selectedFieldsById).map(Number).sort((a, b) => a - b),
    [selectedFieldsById]
  );
  const renderedFields = useMemo(() => {
    const byId = new Map(fields.map((field) => [field.id, field]));
    for (const field of Object.values(selectedFieldsById)) {
      byId.set(field.id, field);
    }
    return Array.from(byId.values());
  }, [fields, selectedFieldsById]);
  const renderedFieldById = useMemo(
    () => new Map(renderedFields.map((field) => [field.id, field])),
    [renderedFields]
  );
  const geojson = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: renderedFields.map((field) => {
        const isSelected = !!selectedFieldsById[field.id];
        return {
          type: 'Feature',
          properties: {
            fill: isSelected ? '#16a34a' : '#22c55e',
            'fill-opacity': isSelected ? 0.58 : 0.1,
            id: field.id,
            stroke: isSelected ? '#86efac' : '#22c55e',
            'stroke-width': isSelected ? 2 : 1,
          },
          geometry: field.geometry,
        };
      }),
    }),
    [renderedFields, selectedFieldsById]
  );

  const toggleField = useCallback((field: VisualField) => {
    const now = Date.now();
    const lastToggle = lastToggleRef.current;
    if (lastToggle?.id === field.id && now - lastToggle.time < DUPLICATE_TAP_GUARD_MS) {
      return;
    }
    lastToggleRef.current = { id: field.id, time: now };

    setSelectedFieldsById((prev) => {
      const id = field.id;
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }

      return { ...prev, [id]: field };
    });
  }, []);

  const handleGeojsonPress = useCallback(
    (event: Parameters<NonNullable<GeojsonProps['onPress']>>[0]) => {
      const id = event.feature.properties?.id;
      const field = typeof id === 'number' ? renderedFieldById.get(id) : undefined;
      if (field) {
        toggleField(field);
      }
    },
    [renderedFieldById, toggleField]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        mapType="satellite"
        onRegionChangeComplete={scheduleLoadForRegion}
      >
        <Geojson
          geojson={geojson}
          tappable
          onPress={handleGeojsonPress}
          zIndex={1}
        />

      </MapView>

      <View style={styles.overlay}>
        <Text style={styles.title}>Fields</Text>
        <Text style={styles.meta}>
          {zoomedInEnough ? `${fields.length} optimized geometries loaded` : 'Zoom in to load fields'}
        </Text>
        <Text style={styles.meta}>{selectedIdList.length} selected</Text>
        {selectedIdList.length > 0 ? (
          <Text style={styles.selectedIds} numberOfLines={4}>
            {selectedIdList.join(', ')}
          </Text>
        ) : null}
        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#1a2e1a" />
            <Text style={styles.statusText}>Loading...</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function toVisualField(row: FieldRow): VisualField | null {
  const geometry = parseGeometry(row.geometry_simplified);
  if (!geometry) {
    return null;
  }

  return {
    geometry,
    id: row.id,
  };
}

function parseJsonLike(value: unknown) {
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

function isZoomedInEnough(region: Region) {
  return Math.min(region.latitudeDelta, region.longitudeDelta) <= MIN_LOAD_ZOOM_DELTA;
}

function regionToBounds(region: Region) {
  const latPadding = region.latitudeDelta * VIEWPORT_PADDING_RATIO;
  const lonPadding = region.longitudeDelta * VIEWPORT_PADDING_RATIO;

  return {
    maxLat: region.latitude + region.latitudeDelta / 2 + latPadding,
    maxLon: region.longitude + region.longitudeDelta / 2 + lonPadding,
    minLat: region.latitude - region.latitudeDelta / 2 - latPadding,
    minLon: region.longitude - region.longitudeDelta / 2 - lonPadding,
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    flex: 1,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  map: {
    flex: 1,
  },
  meta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  overlay: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 12,
    left: 14,
    maxWidth: 320,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    top: 62,
  },
  selectedIds: {
    color: '#14532d',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statusText: {
    color: '#1a2e1a',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#1a2e1a',
    fontSize: 17,
    fontWeight: '800',
  },
});

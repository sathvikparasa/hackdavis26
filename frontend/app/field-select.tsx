import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Geojson, PROVIDER_DEFAULT, Region, type GeojsonProps } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

type LocationSuggestion = {
  detail: string;
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: unknown[];
  };
  properties?: {
    city?: string;
    country?: string;
    county?: string;
    name?: string;
    osm_id?: string | number;
    state?: string;
    street?: string;
  };
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
const TOP_PANEL_COVERAGE_HEIGHT = 280;

const localLocationSuggestions: LocationSuggestion[] = [
  {
    detail: 'California',
    id: 'local-yolo-county',
    label: 'Yolo County',
    latitude: 38.6785,
    longitude: -121.9018,
  },
  {
    detail: 'Yolo County, CA',
    id: 'local-davis',
    label: 'Davis',
    latitude: 38.5449,
    longitude: -121.7405,
  },
  {
    detail: 'Yolo County, CA',
    id: 'local-woodland',
    label: 'Woodland',
    latitude: 38.6785,
    longitude: -121.7733,
  },
  {
    detail: 'Yolo County, CA',
    id: 'local-winters',
    label: 'Winters',
    latitude: 38.5249,
    longitude: -121.9708,
  },
  {
    detail: 'Yolo County, CA',
    id: 'local-knights-landing',
    label: 'Knights Landing',
    latitude: 38.7993,
    longitude: -121.7186,
  },
];

export default function FieldSelectScreen() {
  const insets = useSafeAreaInsets();
  const [activeField, setActiveField] = useState<VisualField | null>(null);
  const [cropByFieldId, setCropByFieldId] = useState<Record<number, string>>({});
  const [cropDraft, setCropDraft] = useState('');
  const [fields, setFields] = useState<VisualField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectedFieldsById, setSelectedFieldsById] = useState<Record<number, VisualField>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToggleRef = useRef<{ id: number; time: number } | null>(null);
  const locationAbortRef = useRef<AbortController | null>(null);
  const mapRef = useRef<MapView>(null);
  const requestIdRef = useRef(0);
  const currentRegionRef = useRef<Region>(INITIAL_REGION);

  const loadFieldsForRegion = useCallback(async (region: Region) => {
    const requestId = ++requestIdRef.current;
    const canLoad = isZoomedInEnough(region);

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
      locationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = locationQuery.trim();
    if (trimmedQuery.length < 2) {
      locationAbortRef.current?.abort();
      setLocationSuggestions([]);
      return;
    }

    const localMatches = localLocationSuggestions.filter((suggestion) =>
      `${suggestion.label} ${suggestion.detail}`.toLowerCase().includes(trimmedQuery.toLowerCase())
    );
    setLocationSuggestions(localMatches);

    const controller = new AbortController();
    locationAbortRef.current?.abort();
    locationAbortRef.current = controller;

    const timeout = setTimeout(async () => {
      try {
        const remoteSuggestions = await fetchLocationSuggestions(trimmedQuery, controller.signal);
        if (!controller.signal.aborted) {
          setLocationSuggestions(mergeLocationSuggestions(localMatches, remoteSuggestions));
        }
      } catch {
        if (!controller.signal.aborted) {
          setLocationSuggestions(localMatches);
        }
      }
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [locationQuery]);

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
        const isActive = activeField?.id === field.id;
        const isSelected = !!selectedFieldsById[field.id];
        return {
          type: 'Feature',
          properties: {
            fill: isSelected ? '#2563eb' : '#22c55e',
            'fill-opacity': isSelected ? 0.58 : 0.1,
            id: field.id,
            stroke: isSelected ? '#93c5fd' : isActive ? '#60a5fa' : '#22c55e',
            'stroke-width': isSelected || isActive ? 2 : 1,
          },
          geometry: field.geometry,
        };
      }),
    }),
    [activeField, renderedFields, selectedFieldsById]
  );

  const dismissCropPanel = useCallback(() => {
    setActiveField(null);
  }, []);

  const openCropSheet = useCallback((field: VisualField) => {
    const now = Date.now();
    const lastToggle = lastToggleRef.current;
    if (lastToggle?.id === field.id && now - lastToggle.time < DUPLICATE_TAP_GUARD_MS) {
      return;
    }
    lastToggleRef.current = { id: field.id, time: now };

    setActiveField(field);
    setCropDraft(cropByFieldId[field.id] ?? '');
    void centerFieldIfCovered(field, mapRef.current, currentRegionRef.current, insets.top);
  }, [cropByFieldId, insets.top]);

  const saveCrop = useCallback(() => {
    if (!activeField) {
      return;
    }

    const crop = cropDraft.trim();
    if (!crop) {
      return;
    }

    setCropByFieldId((prev) => ({ ...prev, [activeField.id]: crop }));
    setSelectedFieldsById((prev) => ({ ...prev, [activeField.id]: activeField }));
    dismissCropPanel();
  }, [activeField, cropDraft, dismissCropPanel]);

  const removeActiveField = useCallback(() => {
    if (!activeField) {
      return;
    }

    const id = activeField.id;
    setCropByFieldId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedFieldsById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    dismissCropPanel();
  }, [activeField, dismissCropPanel]);

  const handleGeojsonPress = useCallback(
    (event: Parameters<NonNullable<GeojsonProps['onPress']>>[0]) => {
      const id = event.feature.properties?.id;
      const field = typeof id === 'number' ? renderedFieldById.get(id) : undefined;
      if (field) {
        openCropSheet(field);
      }
    },
    [openCropSheet, renderedFieldById]
  );

  const selectLocationSuggestion = useCallback((suggestion: LocationSuggestion) => {
    const nextRegion = {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };

    setLocationQuery(suggestion.label);
    setShowLocationSuggestions(false);
    currentRegionRef.current = nextRegion;
    mapRef.current?.animateToRegion(nextRegion, 450);
    loadFieldsForRegion(nextRegion);
  }, [loadFieldsForRegion]);

  const submitLocationSearch = useCallback(async () => {
    const trimmedQuery = locationQuery.trim();
    if (trimmedQuery.length < 2) {
      return;
    }

    const firstSuggestion = locationSuggestions[0];
    if (firstSuggestion) {
      selectLocationSuggestion(firstSuggestion);
      return;
    }

    const suggestions = await fetchLocationSuggestions(trimmedQuery, new AbortController().signal);
    const suggestion = suggestions[0];
    if (suggestion) {
      selectLocationSuggestion(suggestion);
    }
  }, [locationQuery, locationSuggestions, selectLocationSuggestion]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        mapType="satellite"
        onRegionChangeComplete={(region) => {
          currentRegionRef.current = region;
          scheduleLoadForRegion(region);
        }}
      >
        <Geojson
          geojson={geojson}
          tappable
          onPress={handleGeojsonPress}
          zIndex={1}
        />

      </MapView>

      <View style={[styles.searchPanel, { top: insets.top + 12 }]}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={22} color="#9ca3af" />
          <TextInput
            placeholder="Search location"
            placeholderTextColor="#9ca3af"
            returnKeyType="search"
            style={styles.searchInput}
            value={locationQuery}
            onChangeText={setLocationQuery}
            onFocus={() => setShowLocationSuggestions(true)}
            onSubmitEditing={submitLocationSearch}
          />
        </View>

        {showLocationSuggestions && locationQuery.trim().length >= 2 ? (
          <View style={styles.locationSuggestions}>
            {locationSuggestions.length > 0 ? (
              locationSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  style={styles.locationSuggestionItem}
                  onPress={() => selectLocationSuggestion(suggestion)}
                >
                  <MaterialIcons name="place" size={20} color="#2f7d32" />
                  <View style={styles.locationSuggestionCopy}>
                    <Text style={styles.locationSuggestionLabel} numberOfLines={1}>
                      {suggestion.label}
                    </Text>
                    <Text style={styles.locationSuggestionDetail} numberOfLines={1}>
                      {suggestion.detail}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.locationSuggestionItem}>
                <MaterialIcons name="search" size={20} color="#9ca3af" />
                <Text style={styles.locationSuggestionEmpty}>Searching locations</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {activeField ? (
        <View style={[styles.cropPanel, { top: insets.top + 82 }]}>
          <View style={styles.panelHeader}>
            <Text style={styles.sheetMeta}>
              {cropByFieldId[activeField.id] ? 'Edit crop type' : 'Choose crop type'}
            </Text>
            <Pressable style={styles.closeButton} onPress={dismissCropPanel}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="words"
            autoCorrect
            placeholder="Crop type"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            style={styles.cropInput}
            value={cropDraft}
            onChangeText={setCropDraft}
            onSubmitEditing={saveCrop}
          />

          <View style={styles.sheetActions}>
            {cropByFieldId[activeField.id] ? (
              <Pressable style={styles.removeButton} onPress={removeActiveField}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.saveButton, !cropDraft.trim() && styles.saveButtonDisabled]}
              disabled={!cropDraft.trim()}
              onPress={saveCrop}
            >
              <Text style={styles.saveButtonText}>Save Crop</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {(loading || error) && !activeField ? (
        <View style={[styles.statusBadge, { top: insets.top + 82 }]}>
          {loading ? <ActivityIndicator size="small" color="#1a2e1a" /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
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

async function centerFieldIfCovered(
  field: VisualField,
  map: MapView | null,
  region: Region,
  topInset: number
) {
  if (!map) {
    return;
  }

  const center = centerFromGeometry(field.geometry);
  if (!center) {
    return;
  }

  try {
    const point = await map.pointForCoordinate(center);
    if (point.y >= topInset + TOP_PANEL_COVERAGE_HEIGHT) {
      return;
    }

    map.animateToRegion(
      {
        ...region,
        latitude: center.latitude,
        longitude: center.longitude,
      },
      350
    );
  } catch {
    // Native projection can fail during map initialization; ignore and keep the current view.
  }
}

function centerFromGeometry(geometry: Geometry) {
  const positions = extractPositions(geometry);
  if (positions.length === 0) {
    return null;
  }

  const totals = positions.reduce(
    (sum, position) => ({
      latitude: sum.latitude + position.latitude,
      longitude: sum.longitude + position.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: totals.latitude / positions.length,
    longitude: totals.longitude / positions.length,
  };
}

function extractPositions(value: unknown): { latitude: number; longitude: number }[] {
  if (value && typeof value === 'object' && 'coordinates' in value) {
    return extractPositions((value as { coordinates?: unknown }).coordinates);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  if (isLonLatPosition(value)) {
    return [{ latitude: value[1], longitude: value[0] }];
  }

  return value.flatMap(extractPositions);
}

function isLonLatPosition(value: unknown[]): value is [number, number, ...unknown[]] {
  return (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

async function fetchLocationSuggestions(
  query: string,
  signal: AbortSignal
): Promise<LocationSuggestion[]> {
  const response = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(`${query} California`)}&limit=6&lat=38.6785&lon=-121.9018`,
    { signal }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];

  return features
    .map((feature: PhotonFeature, index: number): LocationSuggestion | null => {
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
      }

      const [longitude, latitude] = coordinates;
      const properties = feature.properties ?? {};
      const label = properties.name || properties.street || properties.city || properties.county;
      if (!label || typeof latitude !== 'number' || typeof longitude !== 'number') {
        return null;
      }

      return {
        detail: [properties.city, properties.county, properties.state, properties.country]
          .filter(Boolean)
          .join(', '),
        id: `remote-${properties.osm_id ?? index}-${latitude}-${longitude}`,
        label,
        latitude,
        longitude,
      };
    })
    .filter((suggestion: LocationSuggestion | null): suggestion is LocationSuggestion => Boolean(suggestion));
}

function mergeLocationSuggestions(
  localSuggestions: LocationSuggestion[],
  remoteSuggestions: LocationSuggestion[]
): LocationSuggestion[] {
  const seen = new Set<string>();
  const merged: LocationSuggestion[] = [];

  for (const suggestion of [...localSuggestions, ...remoteSuggestions]) {
    const key = `${suggestion.label}-${suggestion.detail}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(suggestion);
  }

  return merged;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    flex: 1,
  },
  cropInput: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
    borderRadius: 12,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cropPanel: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 16,
    borderWidth: 1,
    left: 14,
    padding: 12,
    position: 'absolute',
    right: 14,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    zIndex: 8,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    color: '#6b7280',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 27,
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
  locationSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationSuggestionDetail: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  locationSuggestionEmpty: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '800',
  },
  locationSuggestionItem: {
    alignItems: 'center',
    borderBottomColor: '#f0f3f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  locationSuggestionLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  locationSuggestions: {
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 52,
    marginHorizontal: 24,
    paddingHorizontal: 16,
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  searchInput: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  searchPanel: {
    left: 0,
    paddingBottom: 10,
    position: 'absolute',
    right: 0,
    zIndex: 6,
  },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    left: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    zIndex: 4,
  },
  selectedIds: {
    color: '#14532d',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: '#fecaca',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  removeButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '800',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetMeta: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
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

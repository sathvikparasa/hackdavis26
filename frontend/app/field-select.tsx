import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@clerk/expo';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  type KeyboardEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Geojson, Marker, Polygon, PROVIDER_DEFAULT, Region, type GeojsonProps } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeatureCollection, Geometry } from 'geojson';

import { createSupabaseWithAccessToken, supabase } from '@/lib/supabase';
import { useTutorial } from '@/lib/tutorial';

type FieldRow = {
  id: number;
  geometry_simplified: unknown;
};

type VisualField = {
  geometry: Geometry;
  id: number;
};

type ViewMode = 'list' | 'map';

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
const CROP_PANEL_HEIGHT = 176;
const UI_FIELD_PADDING = 22;
const ALERT_RECOMPUTE_DEBOUNCE_MS = 3500;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const YOLO_COUNTY_BOUNDARY = [
  { latitude: 38.9247, longitude: -122.3762 },
  { latitude: 38.9254, longitude: -122.404 },
  { latitude: 38.9002, longitude: -122.4227 },
  { latitude: 38.8447, longitude: -122.372 },
  { latitude: 38.84, longitude: -122.2873 },
  { latitude: 38.6995, longitude: -122.2228 },
  { latitude: 38.6549, longitude: -122.1657 },
  { latitude: 38.6197, longitude: -122.1666 },
  { latitude: 38.6249, longitude: -122.1489 },
  { latitude: 38.607, longitude: -122.1359 },
  { latitude: 38.5132, longitude: -122.1033 },
  { latitude: 38.5172, longitude: -122.0573 },
  { latitude: 38.489, longitude: -122.012 },
  { latitude: 38.5337, longitude: -121.9406 },
  { latitude: 38.5385, longitude: -121.8604 },
  { latitude: 38.5231, longitude: -121.7856 },
  { latitude: 38.538, longitude: -121.7118 },
  { latitude: 38.5268, longitude: -121.6946 },
  { latitude: 38.3144, longitude: -121.6939 },
  { latitude: 38.3133, longitude: -121.5932 },
  { latitude: 38.3319, longitude: -121.5842 },
  { latitude: 38.3618, longitude: -121.5213 },
  { latitude: 38.3992, longitude: -121.5134 },
  { latitude: 38.4314, longitude: -121.5325 },
  { latitude: 38.4403, longitude: -121.5035 },
  { latitude: 38.4687, longitude: -121.5047 },
  { latitude: 38.4763, longitude: -121.5425 },
  { latitude: 38.5014, longitude: -121.5587 },
  { latitude: 38.5199, longitude: -121.5244 },
  { latitude: 38.5889, longitude: -121.5063 },
  { latitude: 38.6033, longitude: -121.518 },
  { latitude: 38.5993, longitude: -121.5494 },
  { latitude: 38.6455, longitude: -121.5667 },
  { latitude: 38.6442, longitude: -121.5941 },
  { latitude: 38.679, longitude: -121.6311 },
  { latitude: 38.7649, longitude: -121.5936 },
  { latitude: 38.785, longitude: -121.6274 },
  { latitude: 38.7675, longitude: -121.6348 },
  { latitude: 38.7691, longitude: -121.6634 },
  { latitude: 38.7431, longitude: -121.6739 },
  { latitude: 38.7593, longitude: -121.6699 },
  { latitude: 38.7678, longitude: -121.693 },
  { latitude: 38.7942, longitude: -121.6912 },
  { latitude: 38.8035, longitude: -121.7233 },
  { latitude: 38.8592, longitude: -121.7298 },
  { latitude: 38.8717, longitude: -121.7489 },
  { latitude: 38.8566, longitude: -121.7838 },
  { latitude: 38.8762, longitude: -121.8143 },
  { latitude: 38.9036, longitude: -121.7909 },
  { latitude: 38.9103, longitude: -121.8142 },
  { latitude: 38.9147, longitude: -121.8045 },
  { latitude: 38.9247, longitude: -122.3762 },
];
const YOLO_MASK_OUTER_BOUNDARY = [
  { latitude: 35, longitude: -125 },
  { latitude: 42, longitude: -125 },
  { latitude: 42, longitude: -119 },
  { latitude: 35, longitude: -119 },
];

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
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { step, advance } = useTutorial();
  const { height: viewportHeight } = useWindowDimensions();
  const [activeField, setActiveField] = useState<VisualField | null>(null);
  const [cropByFieldId, setCropByFieldId] = useState<Record<number, string>>({});
  const [cropDraft, setCropDraft] = useState('');
  const [fields, setFields] = useState<VisualField[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardAnimationDuration, setKeyboardAnimationDuration] = useState(220);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectedFieldsById, setSelectedFieldsById] = useState<Record<number, VisualField>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertRecomputeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAlertFieldIdsRef = useRef<Set<number>>(new Set());
  const getTokenRef = useRef(getToken);
  const lastToggleRef = useRef<{ id: number; time: number } | null>(null);
  const locationAbortRef = useRef<AbortController | null>(null);
  const mapRef = useRef<MapView>(null);
  const cropPanelBottomAnim = useRef(new Animated.Value(0)).current;
  const requestIdRef = useRef(0);
  const savedFieldsRequestRef = useRef(0);
  const currentRegionRef = useRef<Region>(INITIAL_REGION);

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

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    return () => {
      if (alertRecomputeDebounceRef.current) {
        clearTimeout(alertRecomputeDebounceRef.current);
      }
    };
  }, []);

  const getSupabaseToken = useCallback(async () => {
    try {
      return await getTokenRef.current();
    } catch (tokenError) {
      console.warn('Unable to load Clerk session token', tokenError);
      setError('Could not sync fields. Clerk session token was not available.');
      return null;
    }
  }, []);

  const refreshSavedFields = useCallback(async () => {
    const requestId = ++savedFieldsRequestRef.current;
    const token = await getSupabaseToken();
    if (!token || requestId !== savedFieldsRequestRef.current) {
      return;
    }

    const { data, error: savedError } = await authenticatedSupabase
      .from('farmer_fields')
      .select('field_id,crop_type,fields(id,geometry_simplified)')
      .order('field_id', { ascending: true });

    if (requestId !== savedFieldsRequestRef.current) {
      return;
    }

    if (savedError) {
      setError(savedError.message);
      return;
    }

    const nextCrops: Record<number, string> = {};
    const nextFields: Record<number, VisualField> = {};
    const savedRows = (data ?? []) as FarmerFieldRow[];

    for (const row of savedRows) {
      const joinedField = Array.isArray(row.fields) ? row.fields[0] : row.fields;
      if (!joinedField) {
        continue;
      }

      const visualField = toVisualField({
        id: joinedField.id,
        geometry_simplified: joinedField.geometry_simplified,
      });
      if (!visualField) {
        continue;
      }

      nextFields[row.field_id] = visualField;
      if (row.crop_type) {
        nextCrops[row.field_id] = row.crop_type;
      }
    }

    setSelectedFieldsById(nextFields);
    setCropByFieldId(nextCrops);
    setActiveField((current) => {
      if (!current) {
        return current;
      }
      return nextFields[current.id] ?? null;
    });
    setError(null);
  }, [authenticatedSupabase, getSupabaseToken]);

  const scheduleAlertRecompute = useCallback((fieldId: number) => {
    if (!userId) {
      return;
    }

    pendingAlertFieldIdsRef.current.add(fieldId);
    if (alertRecomputeDebounceRef.current) {
      clearTimeout(alertRecomputeDebounceRef.current);
    }

    alertRecomputeDebounceRef.current = setTimeout(() => {
      const fieldIds = Array.from(pendingAlertFieldIdsRef.current);
      pendingAlertFieldIdsRef.current.clear();
      alertRecomputeDebounceRef.current = null;
      void recomputeFieldAlerts({
        fieldIds,
        reporterUserId: userId,
        sendNotifications: false,
      });
    }, ALERT_RECOMPUTE_DEBOUNCE_MS);
  }, [userId]);

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
    function handleKeyboardShow(event: KeyboardEvent) {
      setKeyboardHeight(event.endCoordinates.height);
      setKeyboardAnimationDuration(event.duration || 220);
    }

    function handleKeyboardHide(event: KeyboardEvent) {
      setKeyboardHeight(0);
      setKeyboardAnimationDuration(event.duration || 220);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setActiveField(null);
      setCropByFieldId((current) => (Object.keys(current).length === 0 ? current : {}));
      setSelectedFieldsById((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    void refreshSavedFields();
  }, [isLoaded, isSignedIn, refreshSavedFields]);

  useFocusEffect(
    useCallback(() => {
      if (isLoaded && isSignedIn) {
        void refreshSavedFields();
      }
    }, [isLoaded, isSignedIn, refreshSavedFields])
  );

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
  const savedFields = useMemo(
    () => Object.values(selectedFieldsById).sort((left, right) => left.id - right.id),
    [selectedFieldsById]
  );
  const activeSavedFieldIndex = useMemo(
    () => savedFields.findIndex((field) => field.id === activeField?.id),
    [activeField?.id, savedFields]
  );
  const cropLabels = useMemo(
    () =>
      savedFields
        .map((field) => {
          const coordinate = centerFromGeometry(field.geometry);
          const crop = cropByFieldId[field.id]?.trim();
          if (!coordinate || !crop) {
            return null;
          }

          return {
            coordinate,
            crop,
            field,
          };
        })
        .filter(
          (label): label is { coordinate: { latitude: number; longitude: number }; crop: string; field: VisualField } =>
            Boolean(label)
        ),
    [cropByFieldId, savedFields]
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
            fill: isSelected ? '#2563eb' : '#3b82f6',
            'fill-opacity': isSelected ? 0.58 : 0.1,
            id: field.id,
            stroke: isSelected ? '#93c5fd' : isActive ? '#60a5fa' : '#93c5fd',
            'stroke-width': isSelected || isActive ? 2 : 1,
          },
          geometry: field.geometry,
        };
      }),
    }),
    [activeField, renderedFields, selectedFieldsById]
  );

  const stepperBottom = insets.bottom + 18;
  const cropPanelBottom = keyboardHeight > 0 ? keyboardHeight + 12 : stepperBottom + 68;

  useEffect(() => {
    Animated.timing(cropPanelBottomAnim, {
      duration: keyboardAnimationDuration,
      easing: Easing.out(Easing.quad),
      toValue: cropPanelBottom,
      useNativeDriver: false,
    }).start();
  }, [cropPanelBottom, cropPanelBottomAnim, keyboardAnimationDuration]);

  const dismissCropPanel = useCallback(() => {
    Keyboard.dismiss();
    setActiveField(null);
  }, []);

  const openCropSheet = useCallback((field: VisualField) => {
    if (!isSignedIn) {
      return;
    }

    const now = Date.now();
    const lastToggle = lastToggleRef.current;
    if (lastToggle?.id === field.id && now - lastToggle.time < DUPLICATE_TAP_GUARD_MS) {
      return;
    }
    lastToggleRef.current = { id: field.id, time: now };

    setActiveField(field);
    setCropDraft(cropByFieldId[field.id] ?? '');
    void centerFieldIfCovered(field, mapRef.current, currentRegionRef.current, cropPanelBottom, viewportHeight);
  }, [cropByFieldId, cropPanelBottom, isSignedIn, viewportHeight]);

  const saveCrop = useCallback(() => {
    if (!activeField) {
      return;
    }

    const crop = cropDraft.trim();
    if (!crop) {
      return;
    }

    const fieldToSave = activeField;
    setCropByFieldId((prev) => ({ ...prev, [fieldToSave.id]: crop }));
    setSelectedFieldsById((prev) => ({ ...prev, [fieldToSave.id]: fieldToSave }));
    dismissCropPanel();

    getSupabaseToken().then((token) => {
      if (!token) {
        return;
      }

      authenticatedSupabase.rpc('upsert_my_farmer_field', {
        p_crop_type: crop,
        p_field_id: fieldToSave.id,
      })
      .then(({ error: saveError }) => {
        if (saveError) {
          setError(saveError.message);
          return;
        }
        void refreshSavedFields();
        scheduleAlertRecompute(fieldToSave.id);
      });
    });
  }, [activeField, authenticatedSupabase, cropDraft, dismissCropPanel, getSupabaseToken, refreshSavedFields, scheduleAlertRecompute]);

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

    getSupabaseToken().then((token) => {
      if (!token) {
        return;
      }

      authenticatedSupabase.rpc('delete_my_farmer_field', { p_field_id: id }).then(({ error: deleteError }) => {
        if (deleteError) {
          setError(deleteError.message);
          return;
        }
        void refreshSavedFields();
      });
    });
  }, [activeField, authenticatedSupabase, dismissCropPanel, getSupabaseToken, refreshSavedFields]);

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

  const showSavedFieldOnMap = useCallback(
    (field: VisualField) => {
      const center = centerFromGeometry(field.geometry);

      setViewMode('map');
      setActiveField(field);
      setCropDraft(cropByFieldId[field.id] ?? '');

      if (!center) {
        return;
      }

      const nextRegion = {
        ...currentRegionRef.current,
        latitude: center.latitude,
        latitudeDelta: Math.min(currentRegionRef.current.latitudeDelta, 0.04),
        longitude: center.longitude,
        longitudeDelta: Math.min(currentRegionRef.current.longitudeDelta, 0.04),
      };

      currentRegionRef.current = nextRegion;
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(nextRegion, 420);
      });
    },
    [cropByFieldId]
  );

  const focusSavedField = useCallback(
    (direction: -1 | 1) => {
      if (savedFields.length === 0) {
        return;
      }

      const currentIndex = activeSavedFieldIndex >= 0 ? activeSavedFieldIndex : direction === 1 ? -1 : 0;
      const nextIndex = (currentIndex + direction + savedFields.length) % savedFields.length;
      const field = savedFields[nextIndex];
      const center = centerFromGeometry(field.geometry);

      setViewMode('map');
      setActiveField(field);
      setCropDraft(cropByFieldId[field.id] ?? '');

      if (!center) {
        return;
      }

      const nextRegion = {
        ...currentRegionRef.current,
        latitude: center.latitude,
        latitudeDelta: Math.min(currentRegionRef.current.latitudeDelta, 0.04),
        longitude: center.longitude,
        longitudeDelta: Math.min(currentRegionRef.current.longitudeDelta, 0.04),
      };

      currentRegionRef.current = nextRegion;
      mapRef.current?.animateToRegion(nextRegion, 420);
    },
    [activeSavedFieldIndex, cropByFieldId, savedFields]
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
      {isLoaded && !isSignedIn ? (
        <View style={styles.loginGate}>
          <MaterialIcons name="lock-outline" size={32} color="#1a2e1a" />
          <Text style={styles.loginTitle}>Log in to use My Fields</Text>
          <Text style={styles.loginCopy}>Save fields and crop types to your farmer profile.</Text>
          <Pressable style={styles.loginButton} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.loginButtonText}>Log In</Text>
          </Pressable>
        </View>
      ) : null}

      {viewMode === 'list' ? (
        <View style={[styles.listScreen, { paddingTop: insets.top + 18 }]}>
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.listTitle}>My Fields</Text>
              <Text style={styles.listMeta}>{savedFields.length} saved fields</Text>
            </View>
          </View>

          {error ? <Text style={styles.listError}>{error}</Text> : null}

          {savedFields.length > 0 ? (
            <ScrollView contentContainerStyle={styles.fieldList} showsVerticalScrollIndicator={false}>
              {savedFields.map((field) => (
                <Pressable key={field.id} style={styles.fieldListItem} onPress={() => showSavedFieldOnMap(field)}>
                  <FieldThumbnail geometry={field.geometry} />
                  <View style={styles.fieldListCopy}>
                    <Text style={styles.fieldListTitle} numberOfLines={1}>
                      {cropByFieldId[field.id] || 'Saved field'}
                    </Text>
                    <Text style={styles.fieldListMeta}>Tap to view on map</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyList}>
              {loading ? <ActivityIndicator size="small" color="#2563eb" /> : null}
              <Text style={styles.emptyListTitle}>No saved fields yet</Text>
              <Pressable style={styles.emptyListButton} onPress={() => { if (step === 8) advance(); setViewMode('map'); }}>
                <Text style={styles.emptyListButtonText}>Open Map</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={INITIAL_REGION}
            mapType="satellite"
            onRegionChangeComplete={(region) => {
              currentRegionRef.current = region;
              const canLoad = isZoomedInEnough(region);
              if (!canLoad) {
                requestIdRef.current += 1;
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                }
                setLoading(false);
                setError(null);
                return;
              }
              scheduleLoadForRegion(region);
            }}
          >
            <Polygon
              coordinates={YOLO_MASK_OUTER_BOUNDARY}
              holes={[YOLO_COUNTY_BOUNDARY]}
              fillColor="rgba(0,0,0,0.48)"
              strokeColor="rgba(0,0,0,0)"
              strokeWidth={0}
              tappable={false}
              zIndex={0}
            />

            <Polygon
              coordinates={YOLO_COUNTY_BOUNDARY}
              fillColor="rgba(0,0,0,0)"
              strokeColor="rgba(219,234,254,0.85)"
              strokeWidth={1.5}
              tappable={false}
              zIndex={1}
            />

            <Geojson
              geojson={geojson}
              tappable
              onPress={isSignedIn ? handleGeojsonPress : undefined}
              zIndex={2}
            />

            {cropLabels.map((label) => (
              <Marker
                key={`crop-label-${label.field.id}`}
                anchor={{ x: 0.5, y: 0.5 }}
                coordinate={label.coordinate}
                onPress={() => openCropSheet(label.field)}
                tracksViewChanges={false}
                zIndex={3}
              >
                <View style={[
                  styles.cropMapLabel,
                  activeField?.id === label.field.id && styles.cropMapLabelActive,
                ]}>
                  <Text
                    style={[
                      styles.cropMapLabelText,
                      activeField?.id === label.field.id && styles.cropMapLabelTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label.crop}
                  </Text>
                </View>
              </Marker>
            ))}
          </MapView>

          <View style={[styles.searchPanel, { top: insets.top + 12 }]}>
            <View style={styles.mapTopRow}>
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
        </>
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

      {activeField && viewMode === 'map' ? (
        <Animated.View style={[styles.cropPanel, { bottom: cropPanelBottomAnim }]}>
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
            onSubmitEditing={Keyboard.dismiss}
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
              onPress={() => { if (step === 9) advance(); saveCrop(); }}
            >
              <Text style={styles.saveButtonText}>Save Crop</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {viewMode === 'map' && (loading || error) && !activeField ? (
        <View style={[styles.statusBadge, { top: insets.top + 82 }]}>
          {loading ? <ActivityIndicator size="small" color="#1a2e1a" /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {viewMode === 'map' && isSignedIn && savedFields.length > 0 ? (
        <View style={[styles.fieldStepper, { bottom: stepperBottom }]}>
          <Pressable style={styles.stepperButton} onPress={() => focusSavedField(-1)}>
            <MaterialIcons name="chevron-left" size={28} color="#1f2937" />
          </Pressable>

          <View style={styles.stepperCopy}>
            <Text style={styles.stepperTitle} numberOfLines={1}>
              {activeSavedFieldIndex >= 0
                ? cropByFieldId[savedFields[activeSavedFieldIndex].id] || 'Saved field'
                : 'My fields'}
            </Text>
            <Text style={styles.stepperMeta}>
              {activeSavedFieldIndex >= 0 ? activeSavedFieldIndex + 1 : savedFields.length} of {savedFields.length}
            </Text>
          </View>

          <Pressable style={styles.stepperButton} onPress={() => focusSavedField(1)}>
            <MaterialIcons name="chevron-right" size={28} color="#1f2937" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function FieldThumbnail({ geometry }: { geometry: Geometry }) {
  const center = useMemo(() => centerFromGeometry(geometry), [geometry]);
  const region = useMemo(() => thumbnailRegionFromGeometry(geometry), [geometry]);

  return (
    <View style={styles.fieldThumbnail}>
      {center && region ? (
        <MapView
          pointerEvents="none"
          provider={PROVIDER_DEFAULT}
          style={styles.fieldThumbnailMap}
          initialRegion={region}
          mapType="satellite"
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={false}
          toolbarEnabled={false}
          zoomEnabled={false}
        >
          <Geojson
            geojson={{
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {
                    fill: '#2563eb',
                    'fill-opacity': 0.45,
                    stroke: '#dbeafe',
                    'stroke-width': 2,
                  },
                  geometry,
                },
              ],
            }}
          />
        </MapView>
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
  cropPanelBottom: number,
  viewportHeight: number
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
    const coveredFromBottom = cropPanelBottom + CROP_PANEL_HEIGHT + UI_FIELD_PADDING;
    const coveredAreaTop = viewportHeight - coveredFromBottom;
    const fieldIsCoveredByBottomUi = point.y >= coveredAreaTop;
    if (!fieldIsCoveredByBottomUi) {
      return;
    }

    map.animateToRegion(
      {
        ...region,
        latitude: center.latitude - (region.latitudeDelta * 0.28),
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

function thumbnailRegionFromGeometry(geometry: Geometry): Region | null {
  const positions = extractPositions(geometry);
  if (positions.length === 0) {
    return null;
  }

  const bounds = positions.reduce(
    (acc, position) => ({
      maxLat: Math.max(acc.maxLat, position.latitude),
      maxLon: Math.max(acc.maxLon, position.longitude),
      minLat: Math.min(acc.minLat, position.latitude),
      minLon: Math.min(acc.minLon, position.longitude),
    }),
    {
      maxLat: -Infinity,
      maxLon: -Infinity,
      minLat: Infinity,
      minLon: Infinity,
    }
  );

  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    latitudeDelta: Math.max((bounds.maxLat - bounds.minLat) * 1.7, 0.0012),
    longitude: (bounds.minLon + bounds.maxLon) / 2,
    longitudeDelta: Math.max((bounds.maxLon - bounds.minLon) * 1.7, 0.0012),
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

async function recomputeFieldAlerts({
  fieldIds,
  reporterUserId,
  sendNotifications,
}: {
  fieldIds: number[];
  reporterUserId?: string | null;
  sendNotifications: boolean;
}) {
  const apiBaseUrl = API_BASE_URL?.replace(/\/$/, '');
  if (!apiBaseUrl || !reporterUserId || fieldIds.length === 0) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/farmer-fields/recompute-alerts`, {
      body: JSON.stringify({
        field_ids: fieldIds,
        reporter_user_id: reporterUserId,
        send_notifications: sendNotifications,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      console.warn('Unable to recompute field alerts', await response.text());
    }
  } catch (recomputeError) {
    console.warn('Unable to recompute field alerts', recomputeError);
  }
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
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cropMapLabel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: '#93c5fd',
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 110,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  cropMapLabelActive: {
    backgroundColor: 'rgba(37,99,235,0.92)',
    borderColor: '#dbeafe',
  },
  cropMapLabelText: {
    color: '#111827',
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
    textAlign: 'center',
  },
  cropMapLabelTextActive: {
    color: '#fff',
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
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    lineHeight: 27,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
    marginTop: 6,
  },
  emptyList: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyListButton: {
    backgroundColor: '#71897b',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyListButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  emptyListTitle: {
    color: '#111827',
    fontSize: 17,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  fieldStepper: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e5e7eb',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 18,
    padding: 8,
    position: 'absolute',
    right: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    zIndex: 7,
  },
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
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  stepperCopy: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  stepperMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 2,
  },
  stepperTitle: {
    color: '#111827',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
    maxWidth: '100%',
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: '#71897b',
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  loginCopy: {
    color: '#4b5563',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  loginGate: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e5e7eb',
    borderRadius: 18,
    borderWidth: 1,
    left: 24,
    padding: 20,
    position: 'absolute',
    right: 24,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    top: '34%',
    zIndex: 12,
  },
  loginTitle: {
    color: '#111827',
    fontSize: 19,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  fieldList: {
    gap: 10,
    paddingBottom: 118,
    paddingTop: 16,
  },
  fieldListCopy: {
    flex: 1,
    minWidth: 0,
  },
  fieldListItem: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  fieldThumbnail: {
    backgroundColor: '#173321',
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderWidth: 1,
    height: 72,
    overflow: 'hidden',
    width: 116,
  },
  fieldThumbnailMap: {
    height: 216,
    left: -116,
    position: 'absolute',
    top: -72,
    transform: [{ scale: 0.333 }],
    width: 348,
  },
  fieldListMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 3,
  },
  fieldListTitle: {
    color: '#111827',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  listError: {
    color: '#b91c1c',
    fontSize: 13,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
    marginTop: 12,
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: 92,
    justifyContent: 'space-between',
  },
  listMeta: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 3,
  },
  listScreen: {
    backgroundColor: '#f9fafb',
    flex: 1,
    paddingHorizontal: 18,
  },
  listTitle: {
    color: '#111827',
    fontSize: 28,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  map: {
    flex: 1,
  },
  mapTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
  },
  meta: {
    color: '#6b7280',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 2,
  },
  locationSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationSuggestionDetail: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 3,
  },
  locationSuggestionEmpty: {
    color: '#6b7280',
    fontSize: 15,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
  },
  locationSuggestionItem: {
    alignItems: 'center',
    borderBottomColor: '#f1f2f1',
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
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  locationSuggestions: {
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
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
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    height: 52,
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
    fontFamily: 'Outfit_600SemiBold', fontWeight: '600',
  },
  searchPanel: {
    left: 0,
    paddingBottom: 10,
    paddingRight: 96,
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
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
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
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#71897b',
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
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
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
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    marginTop: 3,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statusText: {
    color: '#2d4a3e',
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  title: {
    color: '#2d4a3e',
    fontSize: 17,
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 13,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  toggleButtonActive: {
    backgroundColor: '#71897b',
  },
});

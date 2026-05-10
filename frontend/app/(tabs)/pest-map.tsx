import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertsMap, EmptyMapMessage } from '@/components/alerts-map';
import { AlertItem, AlertSeverity, fetchAlerts } from '@/lib/alerts';

const pestOptions = [
  { label: 'All Pests', icon: 'pest-control' as const },
  { label: 'Insects', icon: 'bug-report' as const },
  { label: 'Fungi', icon: 'mood-bad' as const },
  { label: 'Weeds', icon: 'yard' as const },
  { label: 'Nematodes', icon: 'scatter-plot' as const },
];

const severityOptions = [
  { label: 'All', icon: 'more-horiz' as const },
  { label: 'High', icon: 'place' as const },
  { label: 'Moderate', icon: 'place' as const },
  { label: 'Low', icon: 'place' as const },
];

const severityStyles: Record<AlertSeverity, { pin: string; tint: string; text: string }> = {
  High: { pin: '#dc3b3b', tint: '#fdecec', text: '#b91c1c' },
  Moderate: { pin: '#f2a51a', tint: '#fff6df', text: '#b77908' },
  Low: { pin: '#238a3b', tint: '#eaf8ee', text: '#207232' },
};

type LocationSuggestion = {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
};

const localLocationSuggestions: LocationSuggestion[] = [
  {
    id: 'local-yolo-county',
    label: 'Yolo County',
    detail: 'California',
    latitude: 38.6785,
    longitude: -121.9018,
  },
  {
    id: 'local-davis',
    label: 'Davis',
    detail: 'Yolo County, CA',
    latitude: 38.5449,
    longitude: -121.7405,
  },
  {
    id: 'local-woodland',
    label: 'Woodland',
    detail: 'Yolo County, CA',
    latitude: 38.6785,
    longitude: -121.7733,
  },
  {
    id: 'local-winters',
    label: 'Winters',
    detail: 'Yolo County, CA',
    latitude: 38.5249,
    longitude: -121.9708,
  },
  {
    id: 'local-knights-landing',
    label: 'Knights Landing',
    detail: 'Yolo County, CA',
    latitude: 38.7993,
    longitude: -121.7186,
  },
];

export default function PestMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alertId } = useLocalSearchParams<{ alertId?: string }>();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(alertId ?? null);
  const [sheetExpanded, setSheetExpanded] = useState(!!alertId);
  const [openDropdown, setOpenDropdown] = useState<'crop' | 'pest' | 'severity' | null>(null);
  const [crop, setCrop] = useState('All Crops');
  const [pestType, setPestType] = useState('All Pests');
  const [severity, setSeverity] = useState('All');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [focusedLocation, setFocusedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const isDismissingSheet = useRef(false);

  const clearSelection = useCallback(() => {
    isDismissingSheet.current = false;
    setSelectedId(null);
    setSheetExpanded(false);
    sheetTranslateY.setValue(0);
  }, [sheetTranslateY]);

  const dismissSelectionWithAnimation = useCallback(() => {
    if (isDismissingSheet.current) {
      return;
    }

    isDismissingSheet.current = true;
    Animated.timing(sheetTranslateY, {
      duration: 160,
      toValue: 340,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        isDismissingSheet.current = false;
        return;
      }

      setSelectedId(null);
      requestAnimationFrame(() => {
        sheetTranslateY.setValue(0);
        isDismissingSheet.current = false;
      });
    });
  }, [sheetTranslateY]);

  async function loadAlerts() {
    try {
      setLoading(true);
      setError(null);
      const nextAlerts = await fetchAlerts();
      setAlerts(nextAlerts);
      setSelectedId((current) =>
        current && nextAlerts.some((alert) => alert.id === current) ? current : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  useEffect(() => {
    const trimmedQuery = locationQuery.trim();
    if (trimmedQuery.length < 2) {
      setLocationSuggestions([]);
      return;
    }

    const localMatches = localLocationSuggestions.filter((suggestion) =>
      `${suggestion.label} ${suggestion.detail}`.toLowerCase().includes(trimmedQuery.toLowerCase())
    );
    setLocationSuggestions(localMatches);

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const remoteSuggestions = await fetchLocationSuggestions(trimmedQuery, controller.signal);
        setLocationSuggestions(mergeLocationSuggestions(localMatches, remoteSuggestions).slice(0, 6));
      } catch (err) {
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

  const cropFilterOptions = useMemo(() => {
    const crops = [
      ...new Set(
        alerts.flatMap((alert) => alert.vulnerableCropNames)
      ),
    ].sort();
    return [
      { label: 'All Crops', icon: 'eco' as const },
      ...crops.map((label) => ({ label, icon: cropIcon(label) })),
    ];
  }, [alerts]);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const cropMatch =
          crop === 'All Crops' ||
          alert.vulnerableCropNames.includes(crop);
        const pestMatch = pestType === 'All Pests' || alert.type === pestType;
        const severityMatch = severity === 'All' || alert.severity === severity;
        return cropMatch && pestMatch && severityMatch;
      }),
    [alerts, crop, pestType, severity]
  );

  useEffect(() => {
    if (selectedId && !filteredAlerts.some((alert) => alert.id === selectedId)) {
      clearSelection();
    }
  }, [clearSelection, filteredAlerts, selectedId]);

  const selectedAlert = filteredAlerts.find((alert) => alert.id === selectedId) ?? null;
  const colors = selectedAlert ? severityStyles[selectedAlert.severity] : severityStyles.Low;
  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (isDismissingSheet.current) {
            return;
          }
          if (gesture.dy > 0) {
            sheetTranslateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.55) {
            dismissSelectionWithAnimation();
            return;
          }
          Animated.spring(sheetTranslateY, {
            speed: 20,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetTranslateY, {
            speed: 20,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dismissSelectionWithAnimation, sheetTranslateY]
  );

  function selectLocationSuggestion(suggestion: LocationSuggestion) {
    setLocationQuery(suggestion.label);
    setShowLocationSuggestions(false);
    setOpenDropdown(null);
    setFocusedLocation({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
  }

  async function submitLocationSearch() {
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
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.iconButton, { top: insets.top + 12 }]}
        onPress={loadAlerts}
      >
          <MaterialIcons name="refresh" size={22} color="#1f2937" />
      </Pressable>

      <View style={[styles.filterPanel, { top: insets.top + 12 }]}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={22} color="#9ca3af" />
          <TextInput
            placeholder="Search location"
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            value={locationQuery}
            onChangeText={setLocationQuery}
            onFocus={() => setShowLocationSuggestions(true)}
            returnKeyType="search"
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label="All"
            active={crop === 'All Crops' && pestType === 'All Pests' && severity === 'All'}
            onPress={() => {
              setCrop('All Crops');
              setPestType('All Pests');
              setSeverity('All');
              setOpenDropdown(null);
            }}
          />
          <FilterChip
            label={pestType === 'All Pests' ? 'Pests' : pestType}
            active={openDropdown === 'pest'}
            onPress={() => setOpenDropdown((open) => (open === 'pest' ? null : 'pest'))}
            withChevron
          />
          <FilterChip
            label={crop === 'All Crops' ? 'Crops' : crop}
            active={openDropdown === 'crop'}
            onPress={() => setOpenDropdown((open) => (open === 'crop' ? null : 'crop'))}
            withChevron
          />
          <FilterChip
            label={severity === 'All' ? 'Severity' : severity}
            active={openDropdown === 'severity'}
            onPress={() => setOpenDropdown((open) => (open === 'severity' ? null : 'severity'))}
            withChevron
          />
        </ScrollView>

        {openDropdown === 'crop' ? (
          <Dropdown
            options={cropFilterOptions}
            value={crop}
            onChange={(value) => {
              setCrop(value);
              setOpenDropdown(null);
            }}
          />
        ) : null}

        {openDropdown === 'pest' ? (
          <Dropdown
            options={pestOptions}
            value={pestType}
            onChange={(value) => {
              setPestType(value);
              setOpenDropdown(null);
            }}
          />
        ) : null}

        {openDropdown === 'severity' ? (
          <Dropdown
            options={severityOptions}
            value={severity}
            severity
            onChange={(value) => {
              setSeverity(value);
              setOpenDropdown(null);
            }}
          />
        ) : null}
      </View>

      <View style={styles.mapPanel}>
        <AlertsMap
          alerts={filteredAlerts}
          selectedId={selectedAlert?.id ?? null}
          onSelect={(id) => {
            setSelectedId(id);
            setSheetExpanded(true);
          }}
          onClearSelection={clearSelection}
          focusedLocation={focusedLocation}
        />
        {loading ? (
          <EmptyMapMessage title="Loading reports" />
        ) : error ? (
          <EmptyMapMessage title="Unable to load map" detail={error} />
        ) : alerts.length === 0 ? (
          <EmptyMapMessage title="No reports yet" detail="Submitted reports will appear here." />
        ) : filteredAlerts.length === 0 ? (
          <EmptyMapMessage title="No pins match filters" detail="Adjust pest, crop, or severity filters." />
        ) : null}
      </View>

      {selectedAlert && sheetExpanded ? (
        <Animated.View
          style={[styles.detailSheet, { transform: [{ translateY: sheetTranslateY }] }]}
          {...sheetPanResponder.panHandlers}
        >
          <View style={styles.sheetHeader}>
            <Pressable
              style={styles.sheetToggle}
              onPress={() => setSheetExpanded(false)}
            >
              <View style={styles.grabber} />
              <MaterialIcons name="keyboard-arrow-down" size={24} color="#6b7280" />
            </Pressable>
          </View>

          <View style={styles.detailTop}>
            {selectedAlert.imageUrl ? (
              <Image
                source={{ uri: selectedAlert.imageUrl }}
                style={[styles.detailIcon, styles.detailIconImage]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.detailIcon, { backgroundColor: colors.tint }]}>
                <MaterialIcons name="pest-control" size={20} color={colors.pin} />
              </View>
            )}
            <View style={styles.detailCopy}>
              <Text style={styles.detailTitle} numberOfLines={1}>
                {selectedAlert.pest}
              </Text>
              <Text style={[styles.detailSeverity, { color: colors.text }]}>
                {selectedAlert.severity} Severity
              </Text>
            </View>
            <View style={styles.cropPill}>
              <Text style={styles.cropPillText}>{selectedAlert.vulnerableCropLabel}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <MaterialIcons name="visibility" size={18} color="#6b7280" />
            <Text style={styles.metaText}>
              {selectedAlert.distance} · {selectedAlert.detected}
            </Text>
          </View>
          <View style={styles.radiusRow}>
            <MaterialIcons name="radio-button-unchecked" size={18} color="#6b7280" />
            <Text style={styles.radiusText}>{selectedAlert.travelDistance}</Text>
          </View>

          <Pressable
            style={styles.outlineButton}
            onPress={() => {
              router.push(`/alert/${selectedAlert.id}`);
            }}
          >
            <Text style={styles.outlineButtonText}>View Details</Text>
          </Pressable>
        </Animated.View>
      ) : selectedAlert ? (
        <Pressable style={styles.minimizedSheet} onPress={() => setSheetExpanded(true)}>
          <View style={styles.miniGrabber} />
          <Text style={styles.minimizedText} numberOfLines={1}>
            {selectedAlert.pest}
          </Text>
          <MaterialIcons name="keyboard-arrow-up" size={23} color="#2f7d32" />
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  withChevron,
  onPress,
}: {
  label: string;
  active?: boolean;
  withChevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      {active ? (
        <MaterialIcons name="check-circle" size={14} color="#dff2cf" />
      ) : withChevron ? (
        <MaterialIcons name="expand-more" size={17} color="#6b7280" />
      ) : null}
    </Pressable>
  );
}

function Dropdown({
  options,
  value,
  onChange,
  severity,
}: {
  options: { label: string; icon: keyof typeof MaterialIcons.glyphMap }[];
  value: string;
  onChange: (value: string) => void;
  severity?: boolean;
}) {
  return (
    <View style={styles.dropdown}>
      {options.map((option) => {
        const isSelected = value === option.label;
        const severityColor =
          severity && option.label in severityStyles
            ? severityStyles[option.label as AlertSeverity].pin
            : '#2f7d32';
        return (
          <Pressable
            key={option.label}
            onPress={() => onChange(option.label)}
            style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
          >
            <MaterialIcons
              name={option.icon}
              size={22}
              color={isSelected ? severityColor : '#9ca3af'}
            />
            <Text style={[styles.dropdownText, isSelected && styles.dropdownTextSelected]}>
              {option.label}
            </Text>
            {isSelected ? <MaterialIcons name="check" size={18} color="#2f7d32" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function cropIcon(crop: string): keyof typeof MaterialIcons.glyphMap {
  const lower = crop.toLowerCase();
  if (lower.includes('corn')) {
    return 'grass';
  }
  if (lower.includes('wheat')) {
    return 'spa';
  }
  if (lower.includes('alfalfa')) {
    return 'local-florist';
  }
  if (lower.includes('soy')) {
    return 'grain';
  }
  return 'eco';
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
        id: `remote-${properties.osm_id ?? index}-${latitude}-${longitude}`,
        label,
        detail: [properties.city, properties.county, properties.state, properties.country]
          .filter(Boolean)
          .join(', '),
        latitude,
        longitude,
      };
    })
    .filter((suggestion: LocationSuggestion | null): suggestion is LocationSuggestion => Boolean(suggestion));
}

type PhotonFeature = {
  geometry?: {
    coordinates?: unknown[];
  };
  properties?: {
    osm_id?: string | number;
    name?: string;
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

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
    flex: 1,
    backgroundColor: '#f8faf7',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    width: 36,
    zIndex: 5,
  },
  filterPanel: {
    left: 0,
    paddingBottom: 10,
    position: 'absolute',
    right: 0,
    zIndex: 4,
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
    marginRight: 82,
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
  locationSuggestions: {
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    marginHorizontal: 24,
    marginRight: 82,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
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
  locationSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationSuggestionLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
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
  filterRow: {
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 10,
    paddingTop: 14,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: 18,
  },
  filterActive: {
    backgroundColor: '#2f7d32',
    borderColor: '#2f7d32',
  },
  filterText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '800',
  },
  filterTextActive: {
    color: '#fff',
  },
  mapPanel: {
    backgroundColor: '#e5eee1',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    bottom: 0,
    left: 0,
    paddingBottom: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    zIndex: 5,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 28,
  },
  sheetToggle: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    minHeight: 24,
    width: 80,
  },
  minimizedSheet: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 18,
    flexDirection: 'row',
    gap: 10,
    maxWidth: '84%',
    minHeight: 46,
    paddingLeft: 18,
    paddingRight: 14,
    position: 'absolute',
    zIndex: 5,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  miniGrabber: {
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    height: 4,
    width: 30,
  },
  minimizedText: {
    color: '#111827',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    height: 4,
    width: 38,
  },
  detailTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  detailIcon: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  detailIconImage: {
    borderRadius: 28,
  },
  alertImage: {
    borderRadius: 12,
    height: 160,
    marginTop: 16,
    width: '100%',
  },
  detailCopy: {
    flex: 1,
  },
  detailTitle: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '900',
  },
  detailSeverity: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },
  cropPill: {
    backgroundColor: '#fbf2f4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cropPillText: {
    color: '#6b3137',
    fontSize: 13,
    fontWeight: '800',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  metaText: {
    color: '#4b5563',
    fontSize: 17,
    fontWeight: '800',
  },
  radiusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  radiusText: {
    color: '#4b5563',
    fontSize: 16,
    fontWeight: '800',
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: '#8ab69a',
    borderRadius: 8,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    marginTop: 30,
  },
  outlineButtonText: {
    color: '#2f7d32',
    fontSize: 17,
    fontWeight: '900',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 2,
    overflow: 'hidden',
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
  },
  dropdownItem: {
    alignItems: 'center',
    borderBottomColor: '#f0f3f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemSelected: {
    backgroundColor: '#f2f8f3',
  },
  dropdownText: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  dropdownTextSelected: {
    color: '#1f6f2d',
    fontWeight: '900',
  },
});

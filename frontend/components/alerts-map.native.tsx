import { memo, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { Circle, Marker, Polygon, PROVIDER_DEFAULT } from 'react-native-maps';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Geometry } from 'geojson';

import { AlertItem, AlertSeverity } from '@/lib/alerts';
import type { WindViewport } from '@/components/wind-particles';

const YOLO_REGION = {
  latitude: 38.6785,
  longitude: -121.9018,
  latitudeDelta: 0.52,
  longitudeDelta: 0.64,
};

const CALIFORNIA_MAX_LATITUDE_DELTA = 8;
const CENTER_BUTTON_LONGITUDE_THRESHOLD = 0.08;
const CENTER_BUTTON_ZOOM_THRESHOLD = YOLO_REGION.longitudeDelta * 1.08;
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
  { latitude: 20, longitude: -140 },
  { latitude: 52, longitude: -140 },
  { latitude: 52, longitude: -100 },
  { latitude: 20, longitude: -100 },
];

const severityColors: Record<AlertSeverity, string> = {
  High: '#dc3b3b',
  Moderate: '#f2a51a',
  Low: '#238a3b',
};

const radiusFillColors: Record<AlertSeverity, string> = {
  High: 'rgba(220,59,59,0.16)',
  Moderate: 'rgba(242,165,26,0.15)',
  Low: 'rgba(35,138,59,0.13)',
};

function PinMarker({ alert, onSelect, showLabel }: { alert: AlertItem; onSelect: (id: string) => void; showLabel: boolean }) {
  const [tracked, setTracked] = useState(!!alert.imageUrl);
  const stopTracking = () => setTracked(false);

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.31 }}
      coordinate={{ latitude: alert.latitude, longitude: alert.longitude }}
      onPress={(event) => {
        event.stopPropagation?.();
        onSelect(alert.id);
      }}
      tracksViewChanges={tracked}
    >
      <View style={styles.pinStack}>
        <View style={[styles.pin, { borderColor: severityColors[alert.severity] }]}>
          {alert.imageUrl ? (
            <Image
              source={{ uri: alert.imageUrl }}
              style={styles.pinImage}
              resizeMode="cover"
              onLoad={stopTracking}
              onError={stopTracking}
            />
          ) : (
            <View style={[styles.pinFallback, { backgroundColor: severityColors[alert.severity] }]}>
              <MaterialIcons name="pest-control" size={18} color="#fff" />
            </View>
          )}
        </View>
        {showLabel ? (
          <View style={styles.alertPinLabel}>
            <Text style={styles.alertPinLabelText}>
              {alert.pest}
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

function AlertsMapComponent({
  alerts,
  fields = [],
  onSelect,
  onClearSelection,
  focusedLocation,
  focusedFieldId,
  centerButtonTop,
  layersControlBottom = 28,
  onRegionChangeComplete,
  onToggleWindLayer,
  showWindLayer,
}: {
  alerts: AlertItem[];
  fields?: {
    crop: string | null;
    geometry: Geometry;
    id: number;
  }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  focusedLocation: { latitude: number; longitude: number } | null;
  focusedFieldId?: number | null;
  centerButtonTop?: number;
  layersControlBottom?: number;
  onRegionChangeComplete?: (viewport: WindViewport) => void;
  onToggleWindLayer?: () => void;
  showWindLayer?: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const layersBottomAnim = useRef(new Animated.Value(layersControlBottom)).current;
  const [showCenterMapButton, setShowCenterMapButton] = useState(false);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [showFieldsLayer, setShowFieldsLayer] = useState(false);
  const [latitudeDelta, setLatitudeDelta] = useState(YOLO_REGION.latitudeDelta);
  const showPinLabels = latitudeDelta < 0.22;
  const hasActiveLayer = showFieldsLayer || !!showWindLayer;
  const fieldPolygons = useMemo(
    () => fields.flatMap((field) => geometryToPolygonRings(field.geometry, field.id)),
    [fields]
  );
  const fieldLabels = useMemo(
    () =>
      fields
        .map((field) => {
          const coordinate = centerFromGeometry(field.geometry);
          const crop = field.crop?.trim();
          if (!coordinate || !crop) {
            return null;
          }

          return {
            coordinate,
            crop,
            id: field.id,
          };
        })
        .filter(
          (label): label is { coordinate: { latitude: number; longitude: number }; crop: string; id: number } =>
            !!label
        ),
    [fields]
  );
  const focusedField = useMemo(
    () => fields.find((field) => field.id === focusedFieldId) ?? null,
    [fields, focusedFieldId]
  );
  const layersMenuBottom = useMemo(() => Animated.add(layersBottomAnim, 56), [layersBottomAnim]);

  useEffect(() => {
    Animated.timing(layersBottomAnim, {
      duration: 220,
      toValue: layersControlBottom,
      useNativeDriver: false,
    }).start();
  }, [layersBottomAnim, layersControlBottom]);

  useEffect(() => {
    if (!focusedField) {
      return;
    }

    const coordinate = centerFromGeometry(focusedField.geometry);
    if (!coordinate) {
      return;
    }

    setShowFieldsLayer(true);
    setShowLayersMenu(false);
    mapRef.current?.animateToRegion(
      {
        ...coordinate,
        latitudeDelta: 0.045,
        longitudeDelta: 0.055,
      },
      520
    );
    setShowCenterMapButton(true);
  }, [focusedField]);

  useEffect(() => {
    if (!focusedLocation) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        ...focusedLocation,
        latitudeDelta: 0.08,
        longitudeDelta: 0.1,
      },
      450
    );
    setShowCenterMapButton(shouldShowCenterMapButton({
      ...focusedLocation,
      latitudeDelta: 0.08,
      longitudeDelta: 0.1,
    }));
  }, [focusedLocation]);

  const recenterMap = () => {
    setShowCenterMapButton(false);
    setShowLayersMenu(false);
    mapRef.current?.animateToRegion(YOLO_REGION, 420);
  };

  const clearMapSelection = () => {
    setShowLayersMenu(false);
    onClearSelection();
  };

  const selectAlert = (id: string) => {
    setShowLayersMenu(false);
    onSelect(id);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={YOLO_REGION}
        onPress={clearMapSelection}
        onRegionChangeComplete={setShowCenterMapButtonFromRegion}
        maxDelta={CALIFORNIA_MAX_LATITUDE_DELTA}
        showsUserLocation
        showsMyLocationButton
      >
        <Polygon
          coordinates={YOLO_MASK_OUTER_BOUNDARY}
          holes={[YOLO_COUNTY_BOUNDARY]}
          fillColor="rgba(0,0,0,0.56)"
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
        {showFieldsLayer ? fieldPolygons.map((fieldPolygon) => (
          <Polygon
            key={fieldPolygon.id}
            coordinates={fieldPolygon.coordinates}
            holes={fieldPolygon.holes}
            fillColor={fieldPolygon.fieldId === focusedFieldId ? 'rgba(29,78,216,0.52)' : 'rgba(37,99,235,0.38)'}
            strokeColor={fieldPolygon.fieldId === focusedFieldId ? '#0f2f91' : '#1d4ed8'}
            strokeWidth={fieldPolygon.fieldId === focusedFieldId ? 3 : 2}
            tappable={false}
            zIndex={2}
          />
        )) : null}
        {showFieldsLayer ? fieldLabels.map((label) => (
          <Marker
            key={`field-label-${label.id}`}
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={label.coordinate}
            tracksViewChanges={false}
            zIndex={3}
          >
            <View style={styles.fieldLabel}>
              <Text style={styles.fieldLabelText} numberOfLines={1}>
                {label.crop}
              </Text>
            </View>
          </Marker>
        )) : null}
        {alerts.map((alert) => {
          const radiusMiles = alert.travelDistanceMiles;
          if (!radiusMiles || radiusMiles <= 0) {
            return null;
          }

          return (
            <Circle
              key={`${alert.id}-radius`}
              center={{
                latitude: alert.latitude,
                longitude: alert.longitude,
              }}
              radius={radiusMiles * 1609.344}
              strokeColor={severityColors[alert.severity]}
              strokeWidth={2}
              fillColor={radiusFillColors[alert.severity]}
              zIndex={4}
            />
          );
        })}
        {alerts.map((alert) => (
          <PinMarker key={alert.id} alert={alert} onSelect={selectAlert} showLabel={showPinLabels} />
        ))}
      </MapView>

      <Animated.View style={[styles.layersControl, { bottom: layersBottomAnim }]}>
        <Pressable
          accessibilityLabel="Open map layers"
          style={[styles.layersButton, hasActiveLayer && styles.layersButtonActive]}
          onPress={() => setShowLayersMenu((current) => !current)}
        >
          <MaterialIcons name="layers" size={22} color={hasActiveLayer ? '#fff' : '#1f2937'} />
        </Pressable>
      </Animated.View>

      {showLayersMenu ? (
        <Animated.View style={[styles.layersMenu, { bottom: layersMenuBottom }]}>
          <Text style={styles.layersMenuTitle}>Layers</Text>
          <Pressable
            style={styles.layerMenuItem}
            onPress={() => setShowFieldsLayer((current) => !current)}
          >
            <View style={[styles.layerCheckbox, showFieldsLayer && styles.layerCheckboxActive]}>
              {showFieldsLayer ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
            </View>
            <Text style={styles.layerMenuText}>My fields</Text>
          </Pressable>
          <Pressable
            style={styles.layerMenuItem}
            onPress={onToggleWindLayer}
          >
            <View style={[styles.layerCheckbox, showWindLayer && styles.layerCheckboxActive]}>
              {showWindLayer ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
            </View>
            <Text style={styles.layerMenuText}>Wind</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {showCenterMapButton ? (
        <Pressable
          accessibilityLabel="Center map"
          style={[styles.centerMapButton, { top: centerButtonTop ?? 92 }]}
          onPress={recenterMap}
        >
          <MaterialIcons name="filter-center-focus" size={22} color="#1f2937" />
        </Pressable>
      ) : null}
    </View>
  );

  function setShowCenterMapButtonFromRegion(region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) {
    onRegionChangeComplete?.({
      latitude: region.latitude,
      latitudeDelta: region.latitudeDelta,
      longitude: region.longitude,
      longitudeDelta: region.longitudeDelta,
    });
    setLatitudeDelta(region.latitudeDelta);
    setShowCenterMapButton(shouldShowCenterMapButton(region));
  }
}

function shouldShowCenterMapButton(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}) {
  const pannedSideways = Math.abs(region.longitude - YOLO_REGION.longitude) > CENTER_BUTTON_LONGITUDE_THRESHOLD;
  const zoomedOut = region.longitudeDelta > CENTER_BUTTON_ZOOM_THRESHOLD;

  return pannedSideways || zoomedOut;
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

function geometryToPolygonRings(geometry: Geometry, fieldId: number) {
  if (geometry.type === 'Polygon') {
    return polygonCoordinatesToRings(geometry.coordinates, `${fieldId}`);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon, index) => polygonCoordinatesToRings(polygon, `${fieldId}-${index}`, fieldId));
  }

  return [];
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

function polygonCoordinatesToRings(coordinates: unknown, id: string, fieldId = Number(id)) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  const rings = coordinates
    .map(coordinatesToPositions)
    .filter((ring) => ring.length >= 3);
  const [outerRing, ...holes] = rings;

  if (!outerRing) {
    return [];
  }

  return [{ coordinates: outerRing, fieldId, holes, id }];
}

function coordinatesToPositions(value: unknown): { latitude: number; longitude: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isLonLatPosition)
    .map((position) => ({ latitude: position[1], longitude: position[0] }));
}

function isLonLatPosition(value: unknown): value is [number, number, ...unknown[]] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

export const AlertsMap = memo(
  AlertsMapComponent,
  (prev, next) =>
    prev.alerts === next.alerts &&
    prev.fields === next.fields &&
    prev.centerButtonTop === next.centerButtonTop &&
    prev.focusedFieldId === next.focusedFieldId &&
    prev.layersControlBottom === next.layersControlBottom &&
    prev.selectedId === next.selectedId &&
    prev.focusedLocation?.latitude === next.focusedLocation?.latitude &&
    prev.focusedLocation?.longitude === next.focusedLocation?.longitude &&
    prev.onRegionChangeComplete === next.onRegionChangeComplete &&
    prev.onToggleWindLayer === next.onToggleWindLayer &&
    prev.showWindLayer === next.showWindLayer
);

export function EmptyMapMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      {detail ? <Text style={styles.messageDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  alertPinLabel: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e5e7eb',
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  alertPinLabelText: {
    color: '#111827',
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerMapButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 17,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: 52,
    zIndex: 11,
  },
  fieldLabel: {
    backgroundColor: 'rgba(37,99,235,0.94)',
    borderColor: '#dbeafe',
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 118,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  fieldLabelText: {
    color: '#fff',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  layersButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: 48,
  },
  layersButtonActive: {
    backgroundColor: '#2d4a3e',
    borderColor: '#2d4a3e',
  },
  layersControl: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
  },
  layerCheckbox: {
    alignItems: 'center',
    borderColor: '#cbd5e1',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  layerCheckboxActive: {
    backgroundColor: '#2d4a3e',
    borderColor: '#2d4a3e',
  },
  layerMenuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 40,
  },
  layerMenuText: {
    color: '#111827',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    fontWeight: '800',
  },
  layersMenu: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#e5e7eb',
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 150,
    padding: 12,
    position: 'absolute',
    right: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    zIndex: 10,
  },
  layersMenuTitle: {
    color: '#6b7280',
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  pin: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 3,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  pinImage: {
    borderRadius: 23,
    height: 46,
    width: 46,
  },
  pinFallback: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  pinStack: {
    alignItems: 'center',
  },
  message: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    maxWidth: 290,
    paddingHorizontal: 18,
    paddingVertical: 14,
    position: 'absolute',
    top: '38%',
  },
  messageTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  messageDetail: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
});

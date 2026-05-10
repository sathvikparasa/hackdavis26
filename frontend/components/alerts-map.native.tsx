import { memo, useEffect, useRef, useState } from 'react';
import MapView, { Circle, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AlertItem, AlertSeverity } from '@/lib/alerts';

const YOLO_REGION = {
  latitude: 38.6785,
  longitude: -121.9018,
  latitudeDelta: 0.45,
  longitudeDelta: 0.55,
};

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

function PinMarker({ alert, onSelect }: { alert: AlertItem; onSelect: (id: string) => void }) {
  const [tracked, setTracked] = useState(!!alert.imageUrl);
  const stopTracking = () => setTracked(false);

  return (
    <Marker
      coordinate={{ latitude: alert.latitude, longitude: alert.longitude }}
      onPress={(event) => {
        event.stopPropagation?.();
        onSelect(alert.id);
      }}
      tracksViewChanges={tracked}
    >
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
    </Marker>
  );
}

function AlertsMapComponent({
  alerts,
  onSelect,
  onClearSelection,
  focusedLocation,
}: {
  alerts: AlertItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  focusedLocation: { latitude: number; longitude: number } | null;
}) {
  const mapRef = useRef<MapView>(null);

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
  }, [focusedLocation]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={YOLO_REGION}
      onPress={onClearSelection}
      showsUserLocation
      showsMyLocationButton
    >
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
          />
        );
      })}
      {alerts.map((alert) => (
        <PinMarker key={alert.id} alert={alert} onSelect={onSelect} />
      ))}
    </MapView>
  );
}

export const AlertsMap = memo(
  AlertsMapComponent,
  (prev, next) =>
    prev.alerts === next.alerts &&
    prev.focusedLocation?.latitude === next.focusedLocation?.latitude &&
    prev.focusedLocation?.longitude === next.focusedLocation?.longitude
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

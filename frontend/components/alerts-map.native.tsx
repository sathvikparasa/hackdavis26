import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

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

export function AlertsMap({
  alerts,
  selectedId,
  onSelect,
}: {
  alerts: AlertItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={YOLO_REGION}
      showsUserLocation
      showsMyLocationButton
    >
      {alerts.map((alert) => {
        const isSelected = alert.id === selectedId;
        return (
          <Marker
            key={alert.id}
            coordinate={{
              latitude: alert.latitude,
              longitude: alert.longitude,
            }}
            onPress={() => onSelect(alert.id)}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.marker,
                {
                  backgroundColor: severityColors[alert.severity],
                  transform: [{ scale: isSelected ? 1.16 : 1 }],
                },
              ]}
            >
              <MaterialIcons name="place" size={24} color="#fff" />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

export function EmptyMapMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      {detail ? <Text style={styles.messageDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    borderWidth: 3,
    height: 40,
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    width: 40,
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

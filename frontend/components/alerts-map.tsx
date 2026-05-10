import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AlertItem, AlertSeverity, projectAlerts } from '@/lib/alerts';

const severityColors: Record<AlertSeverity, string> = {
  High: '#dc3b3b',
  Moderate: '#f2a51a',
  Low: '#238a3b',
};

export function AlertsMap({
  alerts,
  selectedId,
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
  const projected = projectAlerts(alerts);

  return (
    <Pressable style={styles.webMap} onPress={onClearSelection}>
      <View style={[styles.fieldPatch, styles.fieldOne]} />
      <View style={[styles.fieldPatch, styles.fieldTwo]} />
      <View style={[styles.fieldPatch, styles.fieldThree]} />
      <View style={styles.roadPrimary} />
      <View style={styles.creek} />
      <Text style={[styles.mapLabel, styles.mapLabelOne]}>Yolo County</Text>
      <Text style={[styles.mapLabel, styles.mapLabelTwo]}>Davis</Text>
      <Text style={[styles.mapLabel, styles.mapLabelThree]}>Woodland</Text>
      {focusedLocation ? (
        <View style={styles.focusMarker}>
          <MaterialIcons name="my-location" size={22} color="#2563eb" />
        </View>
      ) : null}
      {alerts.map((alert) => {
        const point = projected.get(alert.id) ?? { x: 50, y: 50 };
        const radius = radiusSize(alert.travelDistanceMiles ?? 0);
        return (
          <View key={alert.id}>
            {alert.travelDistanceMiles && alert.travelDistanceMiles > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.radiusCircle,
                  {
                    borderColor: severityColors[alert.severity],
                    height: radius,
                    left: `${point.x}%`,
                    marginLeft: -radius / 2,
                    marginTop: -radius / 2,
                    top: `${point.y}%`,
                    width: radius,
                  },
                ]}
              />
            ) : null}
            <View
              onTouchEnd={(event) => {
                event.stopPropagation();
                onSelect(alert.id);
              }}
              style={[
                styles.pin,
                {
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  borderColor: severityColors[alert.severity],
                  transform: [{ scale: alert.id === selectedId ? 1.13 : 1 }],
                },
              ]}
            >
              {alert.imageUrl ? (
                <Image source={{ uri: alert.imageUrl }} style={styles.pinImage} resizeMode="cover" />
              ) : (
                <View style={[styles.pinFallback, { backgroundColor: severityColors[alert.severity] }]}>
                  <MaterialIcons name="place" size={22} color="#fff" />
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Pressable>
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

function radiusSize(radiusMiles: number): number {
  return Math.max(54, Math.min(180, radiusMiles * 18));
}

const styles = StyleSheet.create({
  webMap: {
    backgroundColor: '#e5eee1',
    flex: 1,
    overflow: 'hidden',
  },
  fieldPatch: {
    position: 'absolute',
    backgroundColor: '#d5e4cf',
    borderColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
  },
  fieldOne: { height: 260, left: 10, top: 28, transform: [{ rotate: '-8deg' }], width: 260 },
  fieldTwo: { height: 270, right: 10, top: 92, transform: [{ rotate: '13deg' }], width: 270 },
  fieldThree: { bottom: 30, height: 260, left: 50, transform: [{ rotate: '9deg' }], width: 300 },
  roadPrimary: {
    backgroundColor: '#f6f2e9',
    height: 520,
    left: '48%',
    position: 'absolute',
    top: -40,
    transform: [{ rotate: '5deg' }],
    width: 16,
  },
  creek: {
    backgroundColor: '#a7cde8',
    height: 7,
    left: -30,
    opacity: 0.72,
    position: 'absolute',
    top: '57%',
    transform: [{ rotate: '-30deg' }],
    width: '130%',
  },
  mapLabel: {
    color: '#6b7b79',
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.75,
    position: 'absolute',
  },
  mapLabelOne: { left: '22%', top: '20%' },
  mapLabelTwo: { left: '39%', top: '54%' },
  mapLabelThree: { left: '16%', top: '76%' },
  pin: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 3,
    height: 52,
    justifyContent: 'center',
    marginLeft: -26,
    marginTop: -26,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
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
  radiusCircle: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.42,
    position: 'absolute',
  },
  focusMarker: {
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    borderColor: '#fff',
    borderRadius: 18,
    borderWidth: 3,
    height: 36,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
    position: 'absolute',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    top: '50%',
    width: 36,
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

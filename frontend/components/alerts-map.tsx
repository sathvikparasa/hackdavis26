import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

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
}: {
  alerts: AlertItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const projected = projectAlerts(alerts);

  return (
    <View style={styles.webMap}>
      <View style={[styles.fieldPatch, styles.fieldOne]} />
      <View style={[styles.fieldPatch, styles.fieldTwo]} />
      <View style={[styles.fieldPatch, styles.fieldThree]} />
      <View style={styles.roadPrimary} />
      <View style={styles.creek} />
      <Text style={[styles.mapLabel, styles.mapLabelOne]}>Yolo County</Text>
      <Text style={[styles.mapLabel, styles.mapLabelTwo]}>Davis</Text>
      <Text style={[styles.mapLabel, styles.mapLabelThree]}>Woodland</Text>
      {alerts.map((alert) => {
        const point = projected.get(alert.id) ?? { x: 50, y: 50 };
        return (
          <View
            key={alert.id}
            onTouchEnd={() => onSelect(alert.id)}
            style={[
              styles.pin,
              {
                left: `${point.x}%`,
                top: `${point.y}%`,
                backgroundColor: severityColors[alert.severity],
                transform: [{ scale: alert.id === selectedId ? 1.13 : 1 }],
              },
            ]}
          >
            <MaterialIcons name="place" size={24} color="#fff" />
          </View>
        );
      })}
    </View>
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
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    borderWidth: 3,
    height: 40,
    justifyContent: 'center',
    marginLeft: -20,
    marginTop: -20,
    position: 'absolute',
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

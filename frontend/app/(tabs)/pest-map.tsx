import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertsMap, EmptyMapMessage } from '@/components/alerts-map';
import { AlertItem, AlertSeverity, fetchAlerts } from '@/lib/alerts';

const FILTERS = ['All', 'Pests', 'Crops', 'Severity'];

const severityStyles: Record<AlertSeverity, { pin: string; tint: string; text: string }> = {
  High: { pin: '#dc3b3b', tint: '#fdecec', text: '#b91c1c' },
  Moderate: { pin: '#f2a51a', tint: '#fff6df', text: '#b77908' },
  Low: { pin: '#238a3b', tint: '#eaf8ee', text: '#207232' },
};

export default function PestMapScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAlerts() {
    try {
      setLoading(true);
      setError(null);
      const nextAlerts = await fetchAlerts();
      setAlerts(nextAlerts);
      setSelectedId((current) => current ?? nextAlerts[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  const selectedAlert = alerts.find((alert) => alert.id === selectedId) ?? alerts[0] ?? null;
  const colors = selectedAlert ? severityStyles[selectedAlert.severity] : severityStyles.Low;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Map View</Text>
        <Pressable style={styles.iconButton} onPress={loadAlerts}>
          <MaterialIcons name="refresh" size={22} color="#1f2937" />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={22} color="#9ca3af" />
        <TextInput
          placeholder="Search location"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((filter, index) => (
          <Pressable key={filter} style={[styles.filterChip, index === 0 && styles.filterActive]}>
            <Text style={[styles.filterText, index === 0 && styles.filterTextActive]}>
              {filter}
            </Text>
            {index === 0 ? (
              <MaterialIcons name="check-circle" size={14} color="#dff2cf" />
            ) : filter === 'Severity' ? (
              <MaterialIcons name="expand-more" size={17} color="#6b7280" />
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.mapPanel}>
        <AlertsMap alerts={alerts} selectedId={selectedAlert?.id ?? null} onSelect={setSelectedId} />
        {loading ? (
          <EmptyMapMessage title="Loading reports" />
        ) : error ? (
          <EmptyMapMessage title="Unable to load map" detail={error} />
        ) : alerts.length === 0 ? (
          <EmptyMapMessage title="No reports yet" detail="Submitted reports will appear here." />
        ) : null}
      </View>

      <View style={styles.detailSheet}>
        <View style={styles.grabber} />
        {selectedAlert ? (
          <>
            <View style={styles.detailTop}>
              <View style={[styles.detailIcon, { backgroundColor: colors.tint }]}>
                <MaterialIcons name="pest-control" size={20} color={colors.pin} />
              </View>
              <View style={styles.detailCopy}>
                <Text style={styles.detailTitle} numberOfLines={1}>
                  {selectedAlert.pest}
                </Text>
                <Text style={[styles.detailSeverity, { color: colors.text }]}>
                  {selectedAlert.severity} Severity
                </Text>
              </View>
              <View style={styles.cropPill}>
                <Text style={styles.cropPillText}>{selectedAlert.crop}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <MaterialIcons name="visibility" size={18} color="#6b7280" />
              <Text style={styles.metaText}>
                {selectedAlert.distance} · {selectedAlert.detected}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.emptySheetText}>No selected report</Text>
        )}

        <Pressable style={styles.outlineButton}>
          <Text style={styles.outlineButtonText}>View Details</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8faf7',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 58,
    marginHorizontal: 24,
    marginTop: 24,
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
  filterRow: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
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
    flex: 1,
    minHeight: 385,
    overflow: 'hidden',
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -34,
    paddingBottom: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    height: 4,
    marginBottom: 20,
    width: 38,
  },
  detailTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  detailIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
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
    marginTop: 22,
  },
  metaText: {
    color: '#4b5563',
    fontSize: 17,
    fontWeight: '800',
  },
  emptySheetText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
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
});

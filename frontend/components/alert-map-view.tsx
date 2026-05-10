import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AlertsMap, EmptyMapMessage } from '@/components/alerts-map';
import { ActiveFilterChips, AlertSearchControls } from '@/components/alert-list-view';
import { WindOverlay, useWindData } from '@/components/wind-particles';
import type { WindViewport } from '@/components/wind-particles';
import { AlertItem, AlertSeverity } from '@/lib/alerts';

const severityConfig: Record<AlertSeverity, { cardBg: string; accent: string }> = {
  High: { cardBg: 'rgba(186,26,26,0.04)', accent: '#ba1a1a' },
  Moderate: { cardBg: 'rgba(217,119,6,0.04)', accent: '#d97706' },
  Low: { cardBg: 'rgba(35,138,59,0.04)', accent: '#238a3b' },
};

const YOLO_VIEWPORT: WindViewport = {
  latitude: 38.6785,
  latitudeDelta: 0.45,
  longitude: -121.9018,
  longitudeDelta: 0.55,
};

type AlertMapViewProps = {
  alerts: AlertItem[];
  allAlertsCount: number;
  crops: string[];
  error: string | null;
  hasActiveFilters: boolean;
  headerTop: number;
  loading: boolean;
  onClearSelection: () => void;
  onOpenAlert: (alertId: string) => void;
  onOpenFilter: () => void;
  onSelectAlert: (alertId: string) => void;
  pestTypes: string[];
  query: string;
  selectedAlert: AlertItem | null;
  selectedAlertId: string | null;
  setQuery: (query: string) => void;
  severities: string[];
};

export function AlertMapView({
  alerts,
  allAlertsCount,
  crops,
  error,
  hasActiveFilters,
  headerTop,
  loading,
  onClearSelection,
  onOpenAlert,
  onOpenFilter,
  onSelectAlert,
  pestTypes,
  query,
  selectedAlert,
  selectedAlertId,
  setQuery,
  severities,
}: AlertMapViewProps) {
  const [windViewport, setWindViewport] = useState(YOLO_VIEWPORT);
  const wind = useWindData(windViewport);

  return (
    <View style={styles.mapScreen}>
      <AlertsMap
        alerts={alerts}
        selectedId={selectedAlertId}
        onSelect={onSelectAlert}
        onClearSelection={onClearSelection}
        focusedLocation={null}
        onRegionChangeComplete={setWindViewport}
      />
      <View pointerEvents="none" style={styles.windLayer}>
        <WindOverlay viewport={windViewport} wind={wind ?? { speed: 5, deg: 270 }} />
      </View>

      <View style={[styles.mapHeader, { paddingTop: headerTop }]}>
        <AlertSearchControls
          hasActiveFilters={hasActiveFilters}
          onOpenFilter={onOpenFilter}
          query={query}
          setQuery={setQuery}
        />

        <ActiveFilterChips
          crops={crops}
          hasActiveFilters={hasActiveFilters}
          pestTypes={pestTypes}
          severities={severities}
        />
      </View>

      {loading ? (
        <EmptyMapMessage title="Loading alerts" />
      ) : error ? (
        <EmptyMapMessage title="Unable to load map" detail={error} />
      ) : allAlertsCount === 0 ? (
        <EmptyMapMessage title="No alerts found" detail="New public reports will appear here." />
      ) : alerts.length === 0 ? (
        <EmptyMapMessage title="No alerts match filters" detail="Adjust search or filters." />
      ) : null}

      {selectedAlert ? (
        <MapDetailSheet alert={selectedAlert} onOpenAlert={() => onOpenAlert(selectedAlert.id)} />
      ) : null}
    </View>
  );
}

function MapDetailSheet({ alert, onOpenAlert }: { alert: AlertItem; onOpenAlert: () => void }) {
  const cfg = severityConfig[alert.severity];

  return (
    <View style={styles.mapDetailSheet}>
      <View style={styles.mapDetailTop}>
        {alert.imageUrl ? (
          <Image source={{ uri: alert.imageUrl }} style={styles.mapDetailImage} contentFit="cover" />
        ) : (
          <View style={[styles.mapDetailIcon, { backgroundColor: cfg.cardBg }]}>
            <MaterialIcons name="pest-control" size={20} color={cfg.accent} />
          </View>
        )}
        <View style={styles.mapDetailCopy}>
          <Text style={styles.mapDetailTitle} numberOfLines={1}>
            {alert.pest}
          </Text>
          <Text style={[styles.mapDetailSeverity, { color: cfg.accent }]}>
            {alert.severity} Severity
          </Text>
        </View>
        <View style={styles.mapCropPill}>
          <Text style={styles.mapCropPillText} numberOfLines={1}>
            {alert.vulnerableCropLabel}
          </Text>
        </View>
      </View>

      <View style={styles.mapMetaRow}>
        <MaterialIcons name="visibility" size={18} color="#6b7280" />
        <Text style={styles.mapMetaText}>
          {alert.distance} · {alert.detected}
        </Text>
      </View>
      <View style={styles.mapMetaRow}>
        <MaterialIcons name="radio-button-unchecked" size={18} color="#6b7280" />
        <Text style={styles.mapMetaText}>{alert.travelDistance}</Text>
      </View>

      <Pressable style={styles.mapDetailButton} onPress={onOpenAlert}>
        <Text style={styles.mapDetailButtonText}>View Details</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCropPill: {
    backgroundColor: '#edf7e9',
    borderRadius: 999,
    maxWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapCropPillText: {
    color: '#2f7d32',
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  mapDetailButton: {
    alignItems: 'center',
    borderColor: '#2f7d32',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  mapDetailButtonText: {
    color: '#2f7d32',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
  },
  mapDetailCopy: {
    flex: 1,
    minWidth: 0,
  },
  mapDetailIcon: {
    alignItems: 'center',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  mapDetailImage: {
    borderRadius: 19,
    height: 38,
    width: 38,
  },
  mapDetailSeverity: {
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    marginTop: 2,
  },
  mapDetailSheet: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#e5e7eb',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 104,
    left: 18,
    padding: 16,
    position: 'absolute',
    right: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    zIndex: 8,
  },
  mapDetailTitle: {
    color: '#111827',
    fontSize: 17,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
  mapDetailTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  mapHeader: {
    gap: 14,
    left: 0,
    paddingBottom: 10,
    paddingHorizontal: 20,
    position: 'absolute',
    right: 0,
    zIndex: 6,
  },
  mapMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  mapMetaText: {
    color: '#6b7280',
    flex: 1,
    fontSize: 13,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
  },
  mapScreen: {
    backgroundColor: '#e5eee1',
    flex: 1,
  },
  windLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    elevation: 2,
    zIndex: 2,
  },
});

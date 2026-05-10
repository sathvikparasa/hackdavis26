import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import type { Geometry } from 'geojson';

import { AlertsMap, EmptyMapMessage } from '@/components/alerts-map';
import { ActiveFilterChips } from '@/components/alert-list-view';
import { AlertItem, AlertSeverity } from '@/lib/alerts';

const severityConfig: Record<AlertSeverity, { cardBg: string; accent: string }> = {
  High: { cardBg: 'rgba(186,26,26,0.04)', accent: '#ba1a1a' },
  Moderate: { cardBg: 'rgba(217,119,6,0.04)', accent: '#d97706' },
  Low: { cardBg: 'rgba(35,138,59,0.04)', accent: '#238a3b' },
};
const MAP_DETAIL_SHEET_BOTTOM = 0;
const LAYERS_BUTTON_BOTTOM = 28;
const LAYERS_BUTTON_SHEET_GAP = 12;
const FLOATING_CONTROL_GAP = 8;
const FLOATING_CONTROL_SIZE = 52;
const SHEET_HIDDEN_OFFSET = 260;

type AlertMapViewProps = {
  alerts: AlertItem[];
  alertMapFields: {
    crop: string | null;
    geometry: Geometry;
    id: number;
  }[];
  allAlertsCount: number;
  centerButtonTop: number;
  crops: string[];
  error: string | null;
  focusedFieldId: number | null;
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
  alertMapFields,
  allAlertsCount,
  centerButtonTop,
  crops,
  error,
  focusedFieldId,
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
  const [detailSheetHeight, setDetailSheetHeight] = useState(0);
  const [displayedAlert, setDisplayedAlert] = useState<AlertItem | null>(selectedAlert);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const detailSheetSlide = useRef(new Animated.Value(SHEET_HIDDEN_OFFSET)).current;
  const searchInputRef = useRef<TextInput>(null);
  const trimmedQuery = query.trim().toLowerCase();
  const alertSuggestions = useMemo(
    () => (trimmedQuery.length >= 2 ? alerts.slice(0, 6) : []),
    [alerts, trimmedQuery.length]
  );
  const layersControlBottom =
    displayedAlert && detailSheetHeight > 0
      ? detailSheetHeight + LAYERS_BUTTON_SHEET_GAP
      : LAYERS_BUTTON_BOTTOM;
  const filterControlBottom = layersControlBottom + FLOATING_CONTROL_SIZE + FLOATING_CONTROL_GAP;

  useEffect(() => {
    if (selectedAlert) {
      setDisplayedAlert(selectedAlert);
      Animated.timing(detailSheetSlide, {
        duration: 240,
        toValue: 0,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(detailSheetSlide, {
      duration: 220,
      toValue: detailSheetHeight || SHEET_HIDDEN_OFFSET,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setDisplayedAlert(null);
      }
    });
  }, [detailSheetHeight, detailSheetSlide, selectedAlert]);

  const collapseSearch = () => {
    setSearchExpanded(false);
    searchInputRef.current?.blur();
  };

  const selectSuggestion = (alert: AlertItem) => {
    setQuery(alert.pest);
    onSelectAlert(alert.id);
    collapseSearch();
  };

  return (
    <View style={styles.mapScreen}>
      <AlertsMap
        alerts={alerts}
        fields={alertMapFields}
        selectedId={selectedAlertId}
        onSelect={onSelectAlert}
        onClearSelection={onClearSelection}
        focusedLocation={null}
        focusedFieldId={focusedFieldId}
        centerButtonTop={centerButtonTop}
        layersControlBottom={layersControlBottom}
      />

      <View style={[styles.mapHeader, { paddingTop: headerTop }]}>
        <View style={styles.mapTopRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={22} color="#9ca3af" />
            <TextInput
              ref={searchInputRef}
              placeholder="Search"
              placeholderTextColor="#9ca3af"
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchExpanded(true)}
              onSubmitEditing={collapseSearch}
            />
          </View>
        </View>

        {searchExpanded && trimmedQuery.length >= 2 ? (
          <View style={styles.alertSuggestions}>
            {alertSuggestions.length > 0 ? (
              alertSuggestions.map((alert) => (
                <Pressable
                  key={alert.id}
                  style={styles.alertSuggestionItem}
                  onPress={() => selectSuggestion(alert)}
                >
                  {alert.imageUrl ? (
                    <Image source={{ uri: alert.imageUrl }} style={styles.alertSuggestionImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.alertSuggestionIcon, { backgroundColor: severityConfig[alert.severity].accent }]}>
                      <MaterialIcons name="pest-control" size={17} color="#fff" />
                    </View>
                  )}
                  <View style={styles.alertSuggestionCopy}>
                    <Text style={styles.alertSuggestionTitle} numberOfLines={1}>
                      {alert.pest}
                    </Text>
                    <Text style={styles.alertSuggestionMeta} numberOfLines={1}>
                      {alert.vulnerableCropLabel} · {alert.severity}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.alertSuggestionItem}>
                <MaterialIcons name="search" size={20} color="#9ca3af" />
                <Text style={styles.alertSuggestionEmpty}>No alerts found</Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.chipsWrap}>
          <ActiveFilterChips
            crops={crops}
            hasActiveFilters={hasActiveFilters}
            pestTypes={pestTypes}
            severities={severities}
          />
        </View>
      </View>

      <Pressable
        accessibilityLabel="Open alert filters"
        style={[
          styles.filterButton,
          styles.floatingFilterButton,
          hasActiveFilters && styles.filterButtonActive,
          { bottom: filterControlBottom },
        ]}
        onPress={onOpenFilter}
      >
        <MaterialIcons name="tune" size={22} color={hasActiveFilters ? '#fff' : '#4b5563'} />
      </Pressable>

      {loading ? (
        <EmptyMapMessage title="Loading alerts" />
      ) : error ? (
        <EmptyMapMessage title="Unable to load map" detail={error} />
      ) : allAlertsCount === 0 ? (
        <EmptyMapMessage title="No alerts found" detail="New public reports will appear here." />
      ) : alerts.length === 0 ? (
        <EmptyMapMessage title="No alerts match filters" detail="Adjust search or filters." />
      ) : null}

      {displayedAlert ? (
        <MapDetailSheet
          alert={displayedAlert}
          onClose={onClearSelection}
          onLayout={(event) => setDetailSheetHeight(event.nativeEvent.layout.height)}
          onOpenAlert={() => onOpenAlert(displayedAlert.id)}
          translateY={detailSheetSlide}
        />
      ) : null}
    </View>
  );
}

function MapDetailSheet({
  alert,
  onClose,
  onLayout,
  onOpenAlert,
  translateY,
}: {
  alert: AlertItem;
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onOpenAlert: () => void;
  translateY: Animated.Value;
}) {
  const cfg = severityConfig[alert.severity];

  return (
    <Animated.View
      style={[styles.mapDetailSheet, { transform: [{ translateY }] }]}
      onLayout={onLayout}
    >
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
        <Pressable accessibilityLabel="Close alert" style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.mapMetaLine}>
        <View style={styles.mapMetaItem}>
          <MaterialIcons name="visibility" size={18} color="#6b7280" />
          <Text style={styles.mapMetaText}>{alert.detected}</Text>
        </View>
        <View style={styles.mapMetaItem}>
          <MaterialIcons name="radio-button-unchecked" size={18} color="#6b7280" />
          <Text style={styles.mapMetaText}>{alert.travelDistance}</Text>
        </View>
      </View>

      <Pressable style={styles.mapDetailButton} onPress={onOpenAlert}>
        <Text style={styles.mapDetailButtonText}>View Details</Text>
      </Pressable>
    </Animated.View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    bottom: MAP_DETAIL_SHEET_BOTTOM,
    left: 0,
    paddingBottom: 34,
    paddingHorizontal: 18,
    paddingTop: 16,
    position: 'absolute',
    right: 0,
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
    gap: 12,
    left: 0,
    paddingBottom: 10,
    paddingLeft: 0,
    paddingRight: 108,
    position: 'absolute',
    right: 0,
    zIndex: 6,
  },
  mapTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: 18,
  },
  mapMetaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  mapMetaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  mapMetaText: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
  },
  mapScreen: {
    backgroundColor: '#e5eee1',
    flex: 1,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    width: 52,
  },
  filterButtonActive: {
    backgroundColor: '#2d4a3e',
    borderColor: '#2d4a3e',
  },
  floatingFilterButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
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
  chipsWrap: {
    marginHorizontal: 18,
  },
  alertSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  alertSuggestionEmpty: {
    color: '#6b7280',
    fontSize: 15,
    fontFamily: 'Outfit_500Medium', fontWeight: '500',
  },
  alertSuggestionIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  alertSuggestionImage: {
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  alertSuggestionItem: {
    alignItems: 'center',
    borderBottomColor: '#f1f2f1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  alertSuggestionMeta: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 3,
  },
  alertSuggestions: {
    backgroundColor: '#fff',
    borderColor: '#eef0ef',
    borderRadius: 17,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
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
  alertSuggestionTitle: {
    color: '#111827',
    fontSize: 15,
    fontFamily: 'Outfit_700Bold', fontWeight: '900',
  },
});

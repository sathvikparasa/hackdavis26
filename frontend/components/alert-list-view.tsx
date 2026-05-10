import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AlertItem, AlertSeverity } from '@/lib/alerts';

const severityConfig: Record<AlertSeverity, { cardBg: string; accent: string }> = {
  High: { cardBg: 'rgba(186,26,26,0.04)', accent: '#ba1a1a' },
  Moderate: { cardBg: 'rgba(217,119,6,0.04)', accent: '#d97706' },
  Low: { cardBg: 'rgba(35,138,59,0.04)', accent: '#238a3b' },
};

// Color configs for user-affected vs. non-affected alerts
const affectingUserConfig = { cardBg: 'rgba(220,38,38,0.08)', accent: '#dc2626' }; // Red
const notAffectingUserConfig = { cardBg: 'rgba(234,179,8,0.08)', accent: '#eab308' }; // Yellow

function isAlertAffectingUserFields(alert: AlertItem): boolean {
  return alert.affectedFields.length > 0;
}

function sortAlertsByUserFields(alerts: AlertItem[]): AlertItem[] {
  return [...alerts].sort((a, b) => {
    const aAffectsUser = isAlertAffectingUserFields(a);
    const bAffectsUser = isAlertAffectingUserFields(b);
    
    // Affecting user's fields first (true > false)
    if (aAffectsUser !== bAffectsUser) {
      return aAffectsUser ? -1 : 1;
    }
    
    // Within same category, maintain original order
    return 0;
  });
}

type AlertListViewProps = {
  alerts: AlertItem[];
  allAlertsCount: number;
  crops: string[];
  error: string | null;
  hasActiveFilters: boolean;
  loading: boolean;
  onOpenFilter: () => void;
  onOpenMap: (alertId: string) => void;
  onOpenAlert: (alertId: string) => void;
  onRetry: () => void;
  pestTypes: string[];
  query: string;
  setQuery: (query: string) => void;
  severities: string[];
};

export function AlertListView({
  alerts,
  allAlertsCount,
  crops,
  error,
  hasActiveFilters,
  loading,
  onOpenAlert,
  onOpenFilter,
  onOpenMap,
  onRetry,
  pestTypes,
  query,
  setQuery,
  severities,
}: AlertListViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRetry} tintColor="#2d4a3e" colors={['#2d4a3e']} />
      }
    >
      <View style={styles.feedSection}>
        <Text style={styles.sectionHeading}>Alerts</Text>
        {!loading && (
          <Text style={styles.sectionSubheading}>
            {allAlertsCount === 1 ? '1 alert' : `${allAlertsCount} alerts`} in your area
          </Text>
        )}

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

        <View style={styles.list}>
          {error ? (
            <StateMessage title="Unable to load alerts" detail={error} action="Retry" onPress={onRetry} />
          ) : alerts.length === 0 && !loading ? (
            <StateMessage title="No alerts found" detail="New public reports will appear here." />
          ) : (
            sortAlertsByUserFields(alerts).map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onPress={() => onOpenAlert(alert.id)}
                onViewMap={() => onOpenMap(alert.id)}
              />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

export function AlertSearchControls({
  hasActiveFilters,
  onOpenFilter,
  query,
  setQuery,
}: {
  hasActiveFilters: boolean;
  onOpenFilter: () => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={18} color="#9ca3af" />
        <TextInput
          placeholder="Search"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <Pressable
        style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
        onPress={onOpenFilter}
      >
        <MaterialIcons name="tune" size={18} color={hasActiveFilters ? '#fff' : '#4b5563'} />
      </Pressable>
    </View>
  );
}

export function ActiveFilterChips({
  crops,
  hasActiveFilters,
  pestTypes,
  severities,
}: {
  crops: string[];
  hasActiveFilters: boolean;
  pestTypes: string[];
  severities: string[];
}) {
  if (!hasActiveFilters) {
    return null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
      {[...crops.filter((crop) => crop !== 'All Crops'), ...pestTypes.filter((pest) => pest !== 'All Pests'), ...severities.filter((severity) => severity !== 'All')].map((chip) => (
        <View key={chip} style={styles.chip}>
          <Text style={styles.chipText}>{chip}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function pestTypeIcon(type: AlertItem['type']): keyof typeof MaterialIcons.glyphMap {
  if (type === 'Fungi') return 'scatter-plot';
  if (type === 'Weeds') return 'yard';
  if (type === 'Nematodes') return 'blur-on';
  return 'bug-report';
}

function AlertCard({
  alert,
  onPress,
  onViewMap,
}: {
  alert: AlertItem;
  onPress: () => void;
  onViewMap: () => void;
}) {
  const affectsUserFields = isAlertAffectingUserFields(alert);
  const cfg = affectsUserFields ? affectingUserConfig : notAffectingUserConfig;

  const affectingCrops = [
    ...new Set(
      alert.affectedFields.length > 0
        ? alert.affectedFields.map((field) => field.crop)
        : alert.vulnerableCropNames.length > 0
          ? alert.vulnerableCropNames
          : ['Unknown vulnerable crops']
    ),
  ]
    .slice(0, 2)
    .join(', ');

  return (
    <Pressable style={[styles.card, { backgroundColor: cfg.cardBg }]} onPress={onPress}>
      <View style={styles.cardInner}>
        <View style={[styles.severityBar, { backgroundColor: cfg.accent }]} />

        <View style={styles.pestImageBox}>
          {alert.imageUrl ? (
            <Image source={{ uri: alert.imageUrl }} style={styles.pestImage} contentFit="cover" />
          ) : (
            <View style={[styles.pestImagePlaceholder, { backgroundColor: cfg.cardBg }]}>
              <MaterialIcons name={pestTypeIcon(alert.type)} size={30} color={cfg.accent} />
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{alert.pest}</Text>
          <Text style={styles.cropLabel}>{alert.vulnerableCropLabel}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialIcons name="radio-button-unchecked" size={12} color="#9ca3af" />
              <Text style={styles.metaText} numberOfLines={1}>{alert.travelDistance}</Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <View style={styles.metaItem}>
              <MaterialIcons name="access-time" size={12} color="#9ca3af" />
              <Text style={styles.metaText} numberOfLines={1}>{alert.time}</Text>
            </View>
          </View>
          <View style={[styles.cardFooter, { borderTopColor: `${cfg.accent}40` }]}>
            <Text style={styles.affectingText} numberOfLines={1}>
              Affecting: <Text style={styles.affectingCrop}>{affectingCrops}</Text>
            </Text>
            <Pressable style={styles.viewMapBtn} onPress={(event) => { event.stopPropagation?.(); onViewMap(); }}>
              <Text style={styles.viewMapText}>Map</Text>
              <MaterialIcons name="chevron-right" size={13} color="#2d4a3e" />
            </Pressable>
          </View>
        </View>
      </View>
          {affectsUserFields && (
            <View style={styles.riskBookmark}>
              <MaterialIcons name="star" size={18} color="#dc2626" />
            </View>
          )}
    </Pressable>
  );
}

export function StateMessage({
  title, detail, action, onPress,
}: {
  title: string; detail?: string; action?: string; onPress?: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {action ? (
        <Pressable onPress={onPress} style={styles.stateButton}>
          <Text style={styles.stateButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  affectingCrop: {
    color: '#374151',
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  affectingText: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
  },
  card: {
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 5,
    justifyContent: 'center',
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInner: {
    flexDirection: 'row',
    height: 120,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 17,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
    lineHeight: 22,
  },
  chip: {
    backgroundColor: '#2d4a3e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipsContent: {
    gap: 6,
    flexDirection: 'row',
  },
  chipsRow: {
    marginTop: -4,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  cropLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
  },
  feedSection: {
    marginTop: 0,
    gap: 14,
  },
  filterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  filterBtnActive: {
    backgroundColor: '#2d4a3e',
    borderColor: '#2d4a3e',
  },
  list: {
    gap: 12,
  },
  metaDot: {
    color: '#d1d5db',
    fontSize: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    flexShrink: 1,
  },
  pestImage: {
    width: 96,
    height: 120,
  },
  pestImageBox: {
    width: 96,
    height: 120,
    position: 'relative',
  },
  pestImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  sectionHeading: {
    color: '#111827',
    fontSize: 28,
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
    letterSpacing: -0.5,
    paddingRight: 120,
  },
  sectionSubheading: {
    color: '#9ca3af',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: -8,
  },
  severityBar: {
    width: 7,
    height: '100%',
  },
  stateButton: {
    borderColor: '#e5e7eb',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  stateButtonText: {
    color: '#2d4a3e',
    fontSize: 14,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  stateDetail: {
    color: '#9ca3af',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular', fontWeight: '400',
    marginTop: 6,
    textAlign: 'center',
  },
  stateTitle: {
    color: '#111827',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold', fontWeight: '800',
  },
  riskBookmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  viewMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewMapText: {
    color: '#2d4a3e',
    fontSize: 13,
    fontFamily: 'Outfit_700Bold', fontWeight: '700',
  },
});

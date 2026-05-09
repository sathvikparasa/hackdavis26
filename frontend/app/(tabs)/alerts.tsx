import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertItem, AlertSeverity, fetchAlerts } from '@/lib/alerts';

const cropOptions = [
  { label: 'All Crops', icon: 'eco' as const },
];

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

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [openDropdown, setOpenDropdown] = useState<'crop' | 'pest' | 'severity' | null>(null);
  const [crop, setCrop] = useState('All Crops');
  const [pestType, setPestType] = useState('All Pests');
  const [severity, setSeverity] = useState('All');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAlerts() {
    try {
      setLoading(true);
      setError(null);
      setAlerts(await fetchAlerts());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  const cropFilterOptions = useMemo(() => {
    const crops = [...new Set(alerts.map((alert) => alert.crop))].sort();
    return [
      cropOptions[0],
      ...crops.map((label) => ({ label, icon: cropIcon(label) })),
    ];
  }, [alerts]);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const cropMatch = crop === 'All Crops' || alert.crop === crop;
        const pestMatch = pestType === 'All Pests' || alert.type === pestType;
        const severityMatch = severity === 'All' || alert.severity === severity;
        const queryMatch =
          query.trim().length === 0 ||
          `${alert.pest} ${alert.crop}`.toLowerCase().includes(query.trim().toLowerCase());
        return cropMatch && pestMatch && severityMatch && queryMatch;
      }),
    [alerts, crop, pestType, query, severity]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>List View</Text>
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
            value={query}
            onChangeText={setQuery}
          />
        </View>

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

        <View style={styles.list}>
          {loading ? (
            <StateMessage title="Loading alerts" />
          ) : error ? (
            <StateMessage title="Unable to load alerts" detail={error} action="Retry" onPress={loadAlerts} />
          ) : filteredAlerts.length === 0 ? (
            <StateMessage title="No alerts found" detail="New public reports will appear here." />
          ) : (
            filteredAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
          )}
        </View>
      </ScrollView>

    </SafeAreaView>
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

function AlertCard({ alert }: { alert: AlertItem }) {
  const colors = severityStyles[alert.severity];

  return (
    <Pressable style={styles.card}>
      <View style={[styles.alertIcon, { backgroundColor: colors.tint }]}>
        <MaterialIcons name="place" size={22} color={colors.pin} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {alert.pest}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.tint }]}>
            <Text style={[styles.badgeText, { color: colors.text }]}>{alert.severity}</Text>
          </View>
        </View>
        <Text style={[styles.severityText, { color: colors.text }]}>
          {alert.severity} Severity
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.distanceText}>{alert.distance}</Text>
          <Text style={styles.timeText}>{alert.time}</Text>
        </View>
      </View>
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

function StateMessage({
  title,
  detail,
  action,
  onPress,
}: {
  title: string;
  detail?: string;
  action?: string;
  onPress?: () => void;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8faf7',
  },
  content: {
    paddingBottom: 110,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  title: {
    color: '#111827',
    fontSize: 31,
    fontWeight: '900',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
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
    paddingVertical: 22,
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
  list: {
    gap: 14,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  stateDetail: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  stateButton: {
    borderColor: '#8ab69a',
    borderRadius: 8,
    borderWidth: 2,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stateButtonText: {
    color: '#2f7d32',
    fontSize: 15,
    fontWeight: '900',
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 104,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#1f2937',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
  },
  alertIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  cardTitle: {
    color: '#111827',
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '900',
  },
  severityText: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 7,
  },
  cardMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  distanceText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '700',
  },
  timeText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '700',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderColor: '#edf0ed',
    borderRadius: 17,
    borderWidth: 1,
    marginBottom: 18,
    marginTop: -10,
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
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  dropdownTextSelected: {
    color: '#1f6f2d',
    fontWeight: '900',
  },
});

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_W = Dimensions.get('window').width;
const BODY_H_PAD = 20;
const GAP4 = 8;
const ITEM4_W = (SCREEN_W - BODY_H_PAD * 2 - GAP4 * 3) / 4;

import { getFilterState, setFilterState } from '@/lib/filter-store';

type Option = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

// Hardcoded from: SELECT DISTINCT crop FROM ucipm_chunks ORDER BY crop
const CROPS: Option[] = [
  { label: 'All Crops',    icon: 'eco' },
  { label: 'Alfalfa',      icon: 'local-florist' },
  { label: 'Almond',       icon: 'spa' },
  { label: 'Corn',         icon: 'grass' },
  { label: 'Grape',        icon: 'wine-bar' },
  { label: 'Peach',        icon: 'park' },
  { label: 'Pistachio',    icon: 'nature' },
  { label: 'Rice',         icon: 'grain' },
  { label: 'Small Grains', icon: 'filter-vintage' },
  { label: 'Tomato',       icon: 'local-dining' },
  { label: 'Walnut',       icon: 'forest' },
];

const PESTS: Option[] = [
  { label: 'All Pests',  icon: 'pest-control' },
  { label: 'Insects',    icon: 'bug-report' },
  { label: 'Fungi',      icon: 'scatter-plot' },
  { label: 'Weeds',      icon: 'yard' },
  { label: 'Nematodes',  icon: 'blur-on' },
];

type SeverityOpt = Option & { color: string };

const SEVERITY: SeverityOpt[] = [
  { label: 'All',      icon: 'apps',         color: '#1a2e1a' },
  { label: 'High',     icon: 'warning',      color: '#ba1a1a' },
  { label: 'Moderate', icon: 'flag',         color: '#d97706' },
  { label: 'Low',      icon: 'check-circle', color: '#238a3b' },
];

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saved = getFilterState();

  const [selectedCrops, setSelectedCrops] = useState<string[]>(saved.crops);
  const [selectedPests, setSelectedPests] = useState<string[]>(saved.pests);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>(saved.severities);

  function toggle(
    value: string,
    current: string[],
    set: (v: string[]) => void,
    allLabel: string
  ) {
    if (value === allLabel) {
      set([allLabel]);
      return;
    }
    const without = current.filter((v) => v !== allLabel);
    if (without.includes(value)) {
      const next = without.filter((v) => v !== value);
      set(next.length === 0 ? [allLabel] : next);
    } else {
      set([...without, value]);
    }
  }

  function handleReset() {
    setSelectedCrops(['All Crops']);
    setSelectedPests(['All Pests']);
    setSelectedSeverities(['All']);
  }

  function handleApply() {
    setFilterState({ crops: selectedCrops, pests: selectedPests, severities: selectedSeverities });
    router.back();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="chevron-left" size={22} color="#191c1a" />
        </Pressable>
        <Text style={styles.headerTitle}>Filter</Text>
        <Pressable onPress={handleReset}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Crop Type — 4-column grid */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Crop Type</Text>
          <View style={styles.grid4}>
            {CROPS.map((opt) => {
              const active = selectedCrops.includes(opt.label);
              return (
                <Pressable key={opt.label} style={styles.gridItem4} onPress={() => toggle(opt.label, selectedCrops, setSelectedCrops, 'All Crops')}>
                  <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                    <MaterialIcons name={opt.icon} size={18} color={active ? '#fff' : '#424844'} />
                  </View>
                  <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Pest Type — 5-in-a-row */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pest Type</Text>
          <View style={styles.grid5}>
            {PESTS.map((opt) => {
              const active = selectedPests.includes(opt.label);
              return (
                <Pressable key={opt.label} style={styles.gridItem5} onPress={() => toggle(opt.label, selectedPests, setSelectedPests, 'All Pests')}>
                  <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                    <MaterialIcons name={opt.icon} size={18} color={active ? '#fff' : '#424844'} />
                  </View>
                  <Text style={[styles.itemLabel, active && styles.itemLabelActive]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Severity — 4-in-a-row */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Severity</Text>
          <View style={styles.grid4}>
            {SEVERITY.map((opt) => {
              const active = selectedSeverities.includes(opt.label);
              return (
                <Pressable key={opt.label} style={styles.gridItem4} onPress={() => toggle(opt.label, selectedSeverities, setSelectedSeverities, 'All')}>
                  <View style={[styles.iconBox, active && { backgroundColor: opt.color + '22', borderColor: opt.color, borderWidth: 2 }]}>
                    <MaterialIcons name={opt.icon} size={18} color={active ? opt.color : '#424844'} />
                  </View>
                  <Text style={[styles.itemLabel, active && { color: opt.color, fontWeight: '700' }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Apply */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.applyBtn} onPress={handleApply}>
          <Text style={styles.applyText}>Apply Filters</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7faf5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#546522',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
  },
  section: {
    gap: 14,
    paddingVertical: 26,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  grid4: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP4,
  },
  gridItem4: {
    width: ITEM4_W,
    alignItems: 'center',
    gap: 5,
  },
  grid5: {
    flexDirection: 'row',
    gap: 6,
  },
  gridItem5: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  iconBoxActive: {
    backgroundColor: '#1a2e1a',
    borderColor: '#1a2e1a',
  },
  itemLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  itemLabelActive: {
    color: '#1a2e1a',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  applyBtn: {
    backgroundColor: '#1a2e1a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

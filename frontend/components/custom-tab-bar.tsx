import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabConfig = {
  route: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  isCenter?: boolean;
};

const TAB_CONFIG: TabConfig[] = [
  { route: 'index',    label: 'Home',    icon: 'home' },
  { route: 'pest-map', label: 'Map',     icon: 'map' },
  { route: 'report',   label: '',        icon: 'camera-alt', isCenter: true },
  { route: 'alerts',   label: 'Alerts',  icon: 'notifications-none' },
  { route: 'profile',  label: 'Profile', icon: 'person-outline' },
];

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  function handlePress(route: string, isFocused: boolean) {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (!isFocused) {
      navigation.navigate(route);
    }
  }

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        {TAB_CONFIG.map((tab) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.route);
          const isFocused = state.index === routeIndex;

          if (tab.isCenter) {
            return (
              <TouchableOpacity
                key={tab.route}
                style={styles.centerWrapper}
                onPress={() => handlePress(tab.route, isFocused)}
                activeOpacity={0.85}
              >
                <View style={styles.centerButton}>
                  <MaterialIcons name="camera-alt" size={28} color="#fff" />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.route}
              style={styles.tab}
              onPress={() => handlePress(tab.route, isFocused)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={tab.icon}
                size={24}
                color={isFocused ? '#1a2e1a' : '#9ca3af'}
              />
              <Text style={[styles.label, isFocused && styles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 6,
  },
  label: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },
  labelActive: {
    color: '#1a2e1a',
    fontWeight: '700',
  },
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1a2e1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#1a2e1a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 10,
  },
});

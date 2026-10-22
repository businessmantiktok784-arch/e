import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useAppTheme } from '../../theme/theme-provider';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline', explore: 'compass-outline', map: 'map-outline', community: 'people-outline', profile: 'person-circle-outline',
};
export default function TabLayout() {
  const { colors } = useAppTheme();
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false, tabBarActiveTintColor: colors.forest, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { height: 64, paddingTop: 7, paddingBottom: 8, borderTopColor: colors.line, backgroundColor: colors.surface },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse-outline'} color={color as string} size={size} />,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab' }} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarAccessibilityLabel: 'Explore observations tab' }} />
    <Tabs.Screen name="map" options={{ title: 'Map', tabBarAccessibilityLabel: 'Geological map tab' }} />
    <Tabs.Screen name="community" options={{ title: 'Community', tabBarAccessibilityLabel: 'Community tab' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarAccessibilityLabel: 'Profile and settings tab' }} />
  </Tabs>;
}

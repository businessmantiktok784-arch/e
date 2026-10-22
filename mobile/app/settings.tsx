import Constants from 'expo-constants';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, ScreenTitle } from '../components/Screen';
import { useAppTheme } from '../theme/theme-provider';
import { spacing, type Palette, type ThemeMode } from '../theme/theme';
import { getApiBaseUrl } from '../services/api';

const modes: Array<{ value: ThemeMode; title: string; description: string }> = [
  { value: 'system', title: 'System', description: 'Follow your device appearance.' },
  { value: 'light', title: 'Light', description: 'Use the light Earth Talk palette.' },
  { value: 'dark', title: 'Dark', description: 'Use the dark Earth Talk palette.' },
];

export default function SettingsScreen() {
  const { mode, setMode, colors, persistenceError } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  let apiConfigured = true;
  try { getApiBaseUrl(); } catch { apiConfigured = false; }
  return <Screen>
    <ScreenTitle subtitle="Choose how Earth Talk looks and review the app's current privacy behavior.">Settings</ScreenTitle>
    <Section title="Appearance" styles={styles}>
      <Text style={styles.help}>Your preference is stored on this device and does not affect your account or server data.</Text>
      {modes.map((item) => {
        const selected = mode === item.value;
        return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={`${item.title} appearance`} accessibilityState={{ checked: selected }} onPress={() => setMode(item.value)} style={[styles.choice, selected && styles.choiceSelected]}>
          <View style={styles.choiceText}><Text style={styles.choiceTitle}>{item.title}</Text><Text style={styles.help}>{item.description}</Text></View>
          <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        </Pressable>;
      })}
      {persistenceError ? <Text accessibilityLiveRegion="polite" style={styles.warning}>The appearance changed for this session, but this device could not save it.</Text> : null}
    </Section>

    <Section title="Accessibility" styles={styles}>
      <Text style={styles.cardTitle}>System text size</Text><Text style={styles.help}>Earth Talk respects your device's text scaling. Larger text can make screens scroll farther; controls remain available without fixed-height text boxes.</Text>
      <Text style={styles.cardTitle}>Motion</Text><Text style={styles.help}>Earth Talk uses no decorative motion. Map camera transitions are provided by the native map platform.</Text>
    </Section>

    <Section title="Privacy" styles={styles}>
      <Text style={styles.help}>Public map locations follow backend privacy rules and may be generalized. This app does not request device location or send it to Earth Talk.</Text>
      <Text style={styles.help}>Observation visibility and exact-location consent are controlled by the existing Earth Talk service. This app does not offer server data deletion or privacy-setting changes.</Text>
    </Section>

    <Section title="Connection and app information" styles={styles}>
      <Text style={styles.cardTitle}>Earth Talk API</Text><Text style={styles.help}>{apiConfigured ? 'A public API address is configured.' : 'API address is missing or invalid. Update EXPO_PUBLIC_API_BASE_URL in the local mobile environment and restart Expo.'}</Text>
      <Text style={styles.cardTitle}>Version</Text><Text style={styles.help}>{Constants.expoConfig?.version ?? 'Unavailable'}</Text>
      <Text style={styles.cardTitle}>Scientific integrity</Text><Text style={styles.help}>AI-assisted and community-supported interpretations are not automatically scientific confirmation.</Text>
    </Section>
  </Screen>;
}

function Section({ title, children, styles }: React.PropsWithChildren<{ title: string; styles: ReturnType<typeof createStyles> }>) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function createStyles(colors: Palette) { return StyleSheet.create({ section: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, gap: spacing.sm }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, help: { color: colors.muted, fontSize: 14, lineHeight: 21 }, choice: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line }, choiceSelected: { borderColor: colors.forest, backgroundColor: colors.moss }, choiceText: { flex: 1, gap: 2 }, choiceTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: colors.forest }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest }, warning: { color: colors.warning, lineHeight: 19, fontSize: 13 }, cardTitle: { color: colors.ink, fontWeight: '700', marginTop: 2 } }); }

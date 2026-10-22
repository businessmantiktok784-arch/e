import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AsyncPanel } from '../../components/AsyncPanel';
import { ObservationCard } from '../../components/ObservationCard';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useRecentObservations } from '../../hooks/useObservations';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { observationDetailRoute } from '../../utils/observationNavigation';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recent = useRecentObservations();
  return <Screen>
    <View style={styles.brand}><Image accessibilityIgnoresInvertColors accessible={false} source={require('../../assets/images/icon.png')} style={styles.brandMark} /><View><Text style={styles.brandName}>Earth Talk</Text><Text style={styles.tagline}>Every rock has a story.</Text></View></View>
    <View style={styles.hero}><Eyebrow>Field notes for everyone</Eyebrow><ScreenTitle subtitle="Explore geological observations and learn what the evidence can—and cannot—tell us.">A closer look at Earth</ScreenTitle>
      <View style={styles.actions}><Link href="/(tabs)/explore" asChild><Pressable accessibilityRole="button" style={styles.primary}><Text style={styles.primaryText}>Explore observations</Text></Pressable></Link><Link href="/(tabs)/map" asChild><Pressable accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>Open map</Text></Pressable></Link></View>
    </View>
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent observations</Text><Link href="/(tabs)/explore" style={styles.link}>See all</Link></View>
    <AsyncPanel isLoading={recent.isLoading} error={recent.error} isEmpty={!recent.data?.data.length} onRetry={() => { void recent.refetch(); }} emptyTitle="No observations to show yet" emptyMessage="Public observations will appear here when the Earth Talk API returns them." />
    {recent.data?.data.map((item) => <ObservationCard key={item.passport_id} observation={item} onPress={() => router.push(observationDetailRoute(item.passport_id))} />)}
    <View style={styles.note}><Text style={styles.noteTitle}>About AI-assisted interpretations</Text><Text style={styles.noteText}>AI interpretations are preliminary and include uncertainty. They are not a substitute for expert assessment or scientific confirmation.</Text></View>
    <View style={styles.submit}><Text style={styles.submitTitle}>Have a geological observation?</Text><WhatsAppSubmissionButton /></View>
  </Screen>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }, brandMark: { width: 48, height: 48, borderRadius: 16 }, brandName: { fontWeight: '800', color: colors.ink, fontSize: 17 }, tagline: { color: colors.muted, fontSize: 12, marginTop: 2 }, hero: { padding: spacing.lg, backgroundColor: colors.moss, borderRadius: 22, gap: spacing.md }, actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, primary: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.forest, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 13 }, primaryText: { color: colors.surface, fontWeight: '700' }, secondary: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.line }, secondaryText: { color: colors.forest, fontWeight: '700' }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }, sectionTitle: { color: colors.ink, fontWeight: '800', fontSize: 19 }, link: { color: colors.forest, fontWeight: '700', padding: 8 }, note: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.warningBg, gap: 6 }, noteTitle: { color: colors.warning, fontWeight: '700' }, noteText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, submit: { padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 5 }, submitTitle: { color: colors.ink, fontWeight: '700' }, submitText: { color: colors.muted, fontSize: 13, lineHeight: 19 } }); }

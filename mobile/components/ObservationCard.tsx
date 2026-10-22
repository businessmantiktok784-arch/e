import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import type { ObservationSummary } from '../types/api';
import { observationCardViewModel } from '../utils/observationCard';

export function ObservationCard({ observation, onPress }: { observation: ObservationSummary; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fields = observationCardViewModel(observation);
  const title = fields.title;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open observation ${title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.top}><View style={styles.symbol}><Text style={styles.symbolText}>◇</Text></View><View style={styles.heading}><Text style={styles.title} numberOfLines={2}>{title}</Text><Text style={styles.category}>{fields.category}{observation.is_demo ? ' · Demonstration record' : ''}</Text></View></View>
    {fields.description ? <Text numberOfLines={3} style={styles.description}>{fields.description}</Text> : null}
    <View style={styles.footer}>{fields.location ? <Text style={styles.meta}>⌖ {fields.location}</Text> : <View />}<Text style={styles.meta}>{fields.date ?? fields.verification}</Text></View>
    {fields.evidence ? <Text style={styles.evidence}>Evidence: {fields.evidence}</Text> : null}
  </Pressable>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line }, pressed: { opacity: 0.82 }, top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' }, symbol: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.moss }, symbolText: { fontSize: 24, color: colors.forest }, heading: { flex: 1, gap: 4 }, title: { color: colors.ink, fontSize: 16, fontWeight: '700' }, category: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' }, description: { color: colors.ink, lineHeight: 21, marginTop: spacing.md, fontSize: 14 }, footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm }, meta: { color: colors.muted, fontSize: 12 }, evidence: { color: colors.muted, fontSize: 12, marginTop: 8, textTransform: 'capitalize' } }); }

import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';

export function LoadingState({ label = 'Loading Earth Talk…' }: { label?: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.box} accessibilityRole="progressbar" accessibilityLabel={label}><ActivityIndicator color={colors.forest} /><Text style={styles.body}>{label}</Text></View>;
}
export function MessageState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.box} accessibilityLiveRegion="polite"><Text style={styles.title}>{title}</Text><Text style={styles.body}>{message}</Text>{onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry: ${title}`} hitSlop={8} onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable> : null}</View>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ box: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line }, title: { color: colors.ink, fontWeight: '700', fontSize: 17, textAlign: 'center' }, body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' }, button: { marginTop: 4, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.forest, minHeight: 44, justifyContent: 'center' }, buttonText: { color: colors.surface, fontWeight: '700', textAlign: 'center' } }); }

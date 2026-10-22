import { useMemo, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.inner}>{scroll ? <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView> : children}</View></SafeAreaView>;
}
export function Eyebrow({ children }: PropsWithChildren) { const { colors } = useAppTheme(); return <Text style={{ fontSize: 11, fontWeight: '800', color: colors.earth, letterSpacing: 1.2, textTransform: 'uppercase' }}>{children}</Text>; }
export function ScreenTitle({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) { const { colors } = useAppTheme(); return <View style={{ gap: 5 }}><Text style={{ color: colors.ink, fontSize: 28, letterSpacing: -0.5, fontWeight: '800' }}>{children}</Text>{subtitle ? <Text style={{ color: colors.muted, lineHeight: 21, fontSize: 14 }}>{subtitle}</Text> : null}</View>; }
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) { return StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, inner: { flex: 1 }, content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md } }); }

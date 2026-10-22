import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { safeMediaUrl } from '../utils/media';

export function ObservationImage({ uri, label = 'Observation image', compact = false }: { uri: unknown; label?: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safeUrl = safeMediaUrl(uri);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [safeUrl]);
  if (!safeUrl || failed) return <View style={[styles.placeholder, compact && styles.compactPlaceholder]} accessibilityRole="image" accessibilityLabel="No public image available"><Text numberOfLines={2} style={styles.placeholderText}>No public image</Text></View>;
  return <Image source={{ uri: safeUrl }} accessibilityLabel={label} accessible resizeMode="cover" onError={() => setFailed(true)} style={[styles.image, compact && styles.compactImage]} />;
}
function createStyles(colors: Palette) { return StyleSheet.create({ image: { width: '100%', height: 230, borderRadius: 16, backgroundColor: colors.moss }, placeholder: { width: '100%', height: 150, borderRadius: 16, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }, compactImage: { width: 58, height: 58, borderRadius: 12 }, compactPlaceholder: { width: 58, height: 58, borderRadius: 12 }, placeholderText: { color: colors.forest, fontSize: 13, fontWeight: '600' } }); }

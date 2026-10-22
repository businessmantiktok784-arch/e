import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme-provider';
import type { Palette } from '../../theme/theme';

export function ObservationMap() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.fill}><Text style={styles.text}>Interactive map requires the native Earth Talk app.</Text></View>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.moss }, text: { color: colors.forest, textAlign: 'center', fontWeight: '700' } }); }

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MapCamera, MapRenderItem } from './geojson';
import { useAppTheme } from '../../theme/theme-provider';
import type { Palette } from '../../theme/theme';

/** Web preview fallback. Native builds resolve ObservationMap.native.tsx instead. */
export function ObservationMap({ items: _items, initialCamera: _initialCamera, cameraCommand: _cameraCommand, onSelect: _onSelect, onFailure: _onFailure, onCameraChange: _onCameraChange }: {
  items: MapRenderItem[]; initialCamera: MapCamera; cameraCommand?: { id: number; camera: MapCamera };
  onSelect: (id: string) => void; onFailure: () => void; onCameraChange?: (camera: MapCamera) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.fill}><Text style={styles.text}>Interactive map requires the native Earth Talk app.</Text></View>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.moss }, text: { color: colors.forest, textAlign: 'center', fontWeight: '700' } }); }

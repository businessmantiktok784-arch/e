import { AppleMaps, GoogleMaps } from 'expo-maps';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { MapCamera, MapRenderItem } from './geojson';
import { useAppTheme } from '../../theme/theme-provider';
import type { Palette } from '../../theme/theme';
import { useMemo } from 'react';

export function ObservationMap({ items, initialCamera, cameraCommand, onSelect, onFailure, onCameraChange }: {
  items: MapRenderItem[]; initialCamera: MapCamera; cameraCommand?: { id: number; camera: MapCamera };
  onSelect: (id: string) => void; onFailure: () => void; onCameraChange?: (camera: MapCamera) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appleRef = useRef<AppleMaps.MapView>(null);
  const googleRef = useRef<GoogleMaps.MapView>(null);
  const [ready, setReady] = useState(false);
  const initial = { coordinates: { latitude: initialCamera.latitude, longitude: initialCamera.longitude }, zoom: initialCamera.zoom };
  useEffect(() => {
    if (!cameraCommand) return;
    const camera = { coordinates: { latitude: cameraCommand.camera.latitude, longitude: cameraCommand.camera.longitude }, zoom: cameraCommand.camera.zoom };
    // Interruptions are normal when a user starts another gesture during animation.
    if (Platform.OS === 'ios') appleRef.current?.setCameraPosition(camera);
    else googleRef.current?.setCameraPosition({ ...camera, duration: 350 });
  }, [cameraCommand, onFailure]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!ready) onFailure(); }, 15_000);
    return () => clearTimeout(timer);
  }, [ready, onFailure]);

  const onMapReady = () => setReady(true);
  if (Platform.OS === 'ios') return <View style={styles.fill}>
    <AppleMaps.View ref={appleRef} style={styles.fill} cameraPosition={initial}
      markers={items.map((item) => ({ id: item.id, coordinates: { latitude: item.latitude, longitude: item.longitude }, systemImage: item.kind === 'cluster' ? 'square.grid.2x2.fill' : 'mappin.circle.fill', title: item.kind === 'cluster' ? `${item.count} observations` : item.observation.title, tintColor: item.kind === 'cluster' ? colors.forest : colors.earth }))}
      onMarkerClick={(event) => { onMapReady(); if (event.id) onSelect(event.id); }}
      onCameraMove={(event) => { onMapReady(); const latitude = event.coordinates.latitude; const longitude = event.coordinates.longitude; if (typeof latitude === 'number' && typeof longitude === 'number') onCameraChange?.({ latitude, longitude, zoom: event.zoom }); }} onMapClick={onMapReady} />
    {!ready ? <View pointerEvents="none" style={styles.status}><Text style={styles.statusText}>Opening map…</Text></View> : null}
  </View>;
  if (Platform.OS === 'android') return <View style={styles.fill}>
    <GoogleMaps.View ref={googleRef} style={styles.fill} cameraPosition={initial}
      markers={items.map((item) => ({ id: item.id, coordinates: { latitude: item.latitude, longitude: item.longitude }, title: item.kind === 'cluster' ? `${item.count} observations` : item.observation.title, snippet: item.kind === 'cluster' ? 'Tap to inspect records' : item.observation.category, showCallout: true }))}
      onMapLoaded={onMapReady} onCameraMove={(event) => { onMapReady(); const latitude = event.coordinates.latitude; const longitude = event.coordinates.longitude; if (typeof latitude === 'number' && typeof longitude === 'number') onCameraChange?.({ latitude, longitude, zoom: event.zoom }); }} onMapClick={onMapReady}
      onMarkerClick={(event) => { onMapReady(); if (event.id) onSelect(event.id); }}
      properties={{ minZoomPreference: 2.5, maxZoomPreference: 20 }}
      uiSettings={{ compassEnabled: true, zoomControlsEnabled: false, myLocationButtonEnabled: false, zoomGesturesEnabled: true, scrollGesturesEnabled: true }} />
    {!ready ? <View pointerEvents="none" style={styles.status}><Text style={styles.statusText}>Opening map…</Text></View> : null}
  </View>;
  return <View style={styles.fallback}><Text>Native maps are available on iOS and Android builds.</Text></View>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject }, status: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: `${colors.surface}E8`, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 }, statusText: { color: colors.ink, fontWeight: '600' }, fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas } }); }

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessageState } from '../../components/AsyncState';
import { ObservationImage } from '../../components/ObservationImage';
import { Screen } from '../../components/Screen';
import { useCategories, useMapData } from '../../hooks/useObservations';
import { type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { cameraForObservations, createMapRenderItems, filterMapObservations, parsePublicMapData, type MapCamera, type MapObservation } from '../../features/map/geojson';
import { ObservationMap } from '../../features/map/ObservationMap';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { userFacingError } from '../../utils/userFacingError';

const androidMapsConfigured = Constants.expoConfig?.extra?.androidMapsConfigured === true;

export default function MapScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClusterItems, setSelectedClusterItems] = useState<MapObservation[] | null>(null);
  const [camera, setCamera] = useState<MapCamera>({ latitude: -1.9403, longitude: 29.8739, zoom: 6.5 });
  const cameraRef = useRef(camera);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; camera: MapCamera }>();
  const [mapFailed, setMapFailed] = useState(false);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout>>();
  const query = useMapData({ category, search: submittedSearch });
  const categoriesQuery = useCategories();
  const parsed = useMemo(() => query.data ? parsePublicMapData(query.data) : null, [query.data]);
  const observations = useMemo(() => filterMapObservations(parsed?.observations ?? [], category), [parsed, category]);
  const renderItems = useMemo(() => createMapRenderItems(observations, camera.zoom), [observations, camera.zoom]);
  const selected = observations.find((item) => item.id === selectedId);
  const androidUnavailable = Platform.OS === 'android' && !androidMapsConfigured;
  const onMapFailure = useCallback(() => setMapFailed(true), []);

  useEffect(() => {
    if (!query.data || query.isFetching) return;
    const nextCamera = cameraForObservations(observations);
    cameraRef.current = nextCamera;
    setCamera(nextCamera);
    setCameraCommand((previous) => ({ id: (previous?.id ?? 0) + 1, camera: nextCamera }));
    setSelectedId(null);
    setSelectedClusterItems(null);
  // Reframe when backend filters change, but not when a request refreshes identical data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt]);

  useEffect(() => () => { if (searchTimer) clearTimeout(searchTimer); }, [searchTimer]);
  const updateSearch = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => setSubmittedSearch(value.trim().slice(0, 100)), 400));
  };
  const changeCategory = (value: string) => { setCategory(value); setSelectedId(null); setSelectedClusterItems(null); };
  const moveCamera = (next: MapCamera) => {
    cameraRef.current = next;
    setCamera(next);
    setCameraCommand((previous) => ({ id: (previous?.id ?? 0) + 1, camera: next }));
  };
  const selectMarker = (id: string) => {
    const item = renderItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setSelectedId(id);
    if (item.kind === 'cluster') {
      setSelectedClusterItems(item.observations);
      const zoom = Math.min(20, cameraRef.current.zoom + 2.5);
      moveCamera({ latitude: item.latitude, longitude: item.longitude, zoom });
    } else setSelectedClusterItems(null);
  };
  const onCameraChange = useCallback((next: MapCamera) => {
    cameraRef.current = next;
    setCamera((previous) => Math.abs(previous.zoom - next.zoom) >= 0.35 ? next : previous);
  }, []);
  const openObservation = (id: string) => router.push(observationDetailRoute(id));
  const nativeMapUnavailable = Platform.OS === 'web' || androidUnavailable || mapFailed;

  return <Screen scroll={false}><View style={styles.container}>
    {!nativeMapUnavailable ? <ObservationMap key={mapGeneration} items={renderItems} initialCamera={camera} cameraCommand={cameraCommand} onSelect={selectMarker} onFailure={onMapFailure} onCameraChange={onCameraChange} /> : <View style={styles.mapFallback} />}

    <View style={styles.topPanel}>
      <View style={styles.headingRow}><View><Text style={styles.eyebrow}>Earth Talk · Explore by place</Text><Text style={styles.title}>Geological map</Text></View>
        <View style={styles.controlRow}><Pressable accessibilityRole="button" accessibilityLabel="Refresh map data" onPress={() => { setMapFailed(false); setMapGeneration((value) => value + 1); void query.refetch(); }} style={styles.iconButton}><Ionicons name="refresh" size={19} color={colors.forest} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Return map to observations" onPress={() => moveCamera(cameraForObservations(observations))} style={styles.iconButton}><Ionicons name="scan-outline" size={20} color={colors.forest} /></Pressable></View>
      </View>
      <View style={styles.searchBox}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={updateSearch} placeholder="Search public observations" placeholderTextColor={colors.muted} accessibilityLabel="Search public observations on map" returnKeyType="search" onSubmitEditing={() => setSubmittedSearch(search.trim().slice(0, 100))} style={styles.searchInput} />{search ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { updateSearch(''); setSubmittedSearch(''); }} accessibilityLabel="Clear map search"><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable> : null}</View>
      <Text style={styles.hint}>Search and category filters are applied by the public map API.</Text>
      {categoriesQuery.data?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <FilterChip styles={styles} label="All" selected={!category} onPress={() => changeCategory('')} />
        {categoriesQuery.data.filter((item) => item.observation_count > 0).map((item) => <FilterChip styles={styles} key={item.category} label={item.label} selected={category === item.category} onPress={() => changeCategory(item.category)} />)}
      </ScrollView> : null}
      <Pressable accessibilityRole="link" accessibilityLabel="Open observations in the accessible list" onPress={() => router.push('/(tabs)/explore')} style={styles.listAlternative}><Text style={styles.linkText}>Browse observations as a list</Text></Pressable>
    </View>

    <View style={styles.mapControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" style={styles.zoomButton} onPress={() => moveCamera({ ...cameraRef.current, zoom: Math.min(20, cameraRef.current.zoom + 1) })}><Ionicons name="add" size={22} color={colors.forest} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" style={styles.zoomButton} onPress={() => moveCamera({ ...cameraRef.current, zoom: Math.max(2.5, cameraRef.current.zoom - 1) })}><Ionicons name="remove" size={22} color={colors.forest} /></Pressable>
    </View>

    {query.isLoading ? <View style={styles.notice}><ActivityIndicator color={colors.forest} /><Text style={styles.noticeText}>Loading public map observations…</Text></View> : null}
    {query.isError && !query.data ? <View style={styles.state}><MessageState title="Map data unavailable" message={userFacingError(query.error)} onRetry={() => { void query.refetch(); }} /></View> : null}
    {query.isError && query.data ? <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }} style={styles.staleNotice}><Text style={styles.noticeText}>Showing previously loaded results · Tap to retry</Text></Pressable> : null}
    {query.data && observations.length === 0 ? <View style={styles.state}><MessageState title={category || submittedSearch ? 'No map matches' : 'No public map points'} message={category || submittedSearch ? 'No public map observations match these filters. Clear a filter or browse Explore.' : 'No valid public coordinates were returned. Some observations may have no map-safe point; they remain available in Explore.'} /><Pressable accessibilityRole="link" onPress={() => router.push('/(tabs)/explore')} style={styles.linkButton}><Text style={styles.linkText}>Browse Explore</Text></Pressable></View> : null}
    {query.data && observations.length > 0 ? <View pointerEvents="none" style={styles.countPill}><Text style={styles.countText}>{observations.length} map {observations.length === 1 ? 'point' : 'points'}{parsed?.invalidFeatureCount ? ` · ${parsed.invalidFeatureCount} omitted` : ''}</Text></View> : null}
    <View style={styles.privacy}><Ionicons name="shield-checkmark-outline" size={15} color={colors.forest} /><Text style={styles.privacyText}>Public map locations follow Earth Talk privacy rules and may be generalized. The API does not provide precision per point.</Text></View>

    {nativeMapUnavailable ? <View style={styles.blocker}><Text style={styles.blockerTitle}>{Platform.OS === 'web' ? 'Open the native app to use the map' : androidUnavailable ? 'Android map configuration required' : 'Map could not be initialized'}</Text><Text style={styles.blockerText}>{Platform.OS === 'web' ? 'Expo Maps is a native map view and is not available in the web preview.' : androidUnavailable ? 'Configure a restricted Google Maps Android SDK key and rebuild the native app. Public observations are still available in Explore.' : 'The native map did not initialize. Retry after checking the device and map provider configuration.'}</Text><View style={styles.actionRow}><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/explore')} style={styles.primaryButton}><Text style={styles.primaryText}>Open Explore</Text></Pressable>{mapFailed && !androidUnavailable ? <Pressable accessibilityRole="button" onPress={() => { setMapFailed(false); setMapGeneration((value) => value + 1); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Retry map</Text></Pressable> : null}</View></View> : null}

    {selectedClusterItems ? <View style={styles.preview}><View style={styles.previewHeader}><View style={styles.previewTitleWrap}><Text style={styles.previewTitle}>{selectedClusterItems.length} observations grouped</Text><Text style={styles.previewMeta}>Cluster count reflects real public map points</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close cluster preview" onPress={() => { setSelectedId(null); setSelectedClusterItems(null); }}><Ionicons name="close-circle" size={26} color={colors.muted} /></Pressable></View><FlatList horizontal data={selectedClusterItems.slice(0, 8)} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => openObservation(item.id)} style={styles.clusterItem}><Text numberOfLines={2} style={styles.clusterItemTitle}>{item.title}</Text><Text style={styles.previewMeta}>{item.category}{item.district ? ` · ${item.district}` : ''}</Text></Pressable>} /><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/explore')}><Text style={styles.linkText}>Browse all in Explore</Text></Pressable></View> : null}
    {selected ? <ObservationPreview colors={colors} styles={styles} observation={selected} onClose={() => setSelectedId(null)} onDetails={() => openObservation(selected.id)} /> : null}
  </View></Screen>;
}

function FilterChip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label} map category filter`} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function ObservationPreview({ observation, onClose, onDetails, styles, colors }: { observation: MapObservation; onClose: () => void; onDetails: () => void; styles: ReturnType<typeof createStyles>; colors: Palette }) {
  return <View style={styles.preview}><View style={styles.previewHeader}>{observation.imageUrl ? <ObservationImage uri={observation.imageUrl} label={`${observation.title} map thumbnail`} compact /> : null}<View style={styles.previewTitleWrap}><Text numberOfLines={2} style={styles.previewTitle}>{observation.title}</Text><Text style={styles.previewMeta}>{observation.category}{observation.subcategory ? ` · ${observation.subcategory}` : ''}</Text>{observation.district ? <Text style={styles.previewMeta}>{observation.district}</Text> : null}<Text style={styles.previewMeta}>Public map point · precision not provided per observation</Text>{observation.evidenceState ? <Text style={styles.previewMeta}>Evidence: {observation.evidenceState}</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Close observation preview" onPress={onClose}><Ionicons name="close-circle" size={26} color={colors.muted} /></Pressable></View><Pressable accessibilityRole="button" onPress={onDetails} style={styles.primaryButton}><Text style={styles.primaryText}>View observation details</Text></Pressable></View>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ container: { flex: 1, backgroundColor: colors.canvas }, mapFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.canvas }, topPanel: { position: 'absolute', top: 8, left: 12, right: 12, backgroundColor: `${colors.surface}F2`, borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.line, elevation: 3 }, headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: colors.earth, fontWeight: '800', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' }, title: { color: colors.ink, fontSize: 19, fontWeight: '800' }, controlRow: { flexDirection: 'row', gap: 8 }, iconButton: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.moss }, searchBox: { minHeight: 44, borderRadius: 13, paddingHorizontal: 10, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 14 }, hint: { fontSize: 12, color: colors.muted }, chips: { gap: 7, paddingVertical: 1 }, chip: { minHeight: 44, justifyContent: 'center', borderRadius: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, chipSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, chipText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, chipTextSelected: { color: colors.surface }, mapControls: { position: 'absolute', top: 206, right: 14, gap: 7 }, zoomButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', elevation: 2 }, notice: { position: 'absolute', top: 226, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 14 }, noticeText: { fontSize: 12, color: colors.ink }, staleNotice: { position: 'absolute', top: 224, alignSelf: 'center', padding: 9, backgroundColor: colors.warningBg, borderRadius: 12 }, countPill: { position: 'absolute', top: 222, left: 14, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, elevation: 2 }, countText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, privacy: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: `${colors.surface}F2`, borderRadius: 13, padding: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, privacyText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.muted }, state: { position: 'absolute', top: '43%', left: 24, right: 24, gap: 6 }, linkButton: { alignSelf: 'center', padding: 12 }, listAlternative: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, linkText: { color: colors.forest, fontSize: 13, fontWeight: '800' }, blocker: { position: 'absolute', top: '40%', left: 22, right: 22, padding: 18, borderRadius: 18, backgroundColor: colors.surface, gap: 9, elevation: 4 }, blockerTitle: { fontSize: 17, color: colors.ink, fontWeight: '800' }, blockerText: { color: colors.muted, lineHeight: 19, fontSize: 13 }, actionRow: { flexDirection: 'row', gap: 9, marginTop: 3 }, primaryButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest, paddingHorizontal: 14 }, primaryText: { color: colors.surface, fontWeight: '800', fontSize: 13 }, secondaryButton: { minHeight: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.moss }, secondaryText: { color: colors.forest, fontWeight: '800', fontSize: 13 }, preview: { position: 'absolute', bottom: 50, left: 12, right: 12, padding: 12, gap: 9, backgroundColor: colors.surface, borderRadius: 18, borderColor: colors.line, borderWidth: 1, elevation: 5 }, previewHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, previewTitleWrap: { flex: 1, gap: 4 }, previewTitle: { color: colors.ink, fontWeight: '800', fontSize: 15 }, previewMeta: { color: colors.muted, fontSize: 11, lineHeight: 15 }, clusterItem: { width: 180, marginRight: 8, padding: 10, borderRadius: 12, backgroundColor: colors.canvas }, clusterItemTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 5 } }); }

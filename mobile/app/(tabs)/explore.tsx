import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessageState } from '../../components/AsyncState';
import { ObservationCard } from '../../components/ObservationCard';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useCategories, useObservations } from '../../hooks/useObservations';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { userFacingError } from '../../utils/userFacingError';

export default function ExploreScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const categories = useCategories();
  useEffect(() => { const timer = setTimeout(() => setSearch(searchInput.trim()), 350); return () => clearTimeout(timer); }, [searchInput]);
  const query = useObservations({ search, category: category || undefined });
  const observations = query.data?.pages.flatMap((page) => page.data) ?? [];

  return <Screen scroll={false}>
    <View style={styles.header}>
      <Eyebrow>Community field observations</Eyebrow>
      <ScreenTitle subtitle="Browse public records shared through Earth Talk.">Explore</ScreenTitle>
      <TextInput accessibilityLabel="Search observations" placeholder="Search public observations" placeholderTextColor={colors.muted} value={searchInput} onChangeText={setSearchInput} returnKeyType="search" style={styles.search} clearButtonMode="while-editing" />
      <Text style={styles.filterLabel}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        <FilterChip styles={styles} label="All" selected={!category} onPress={() => setCategory('')} />
        {(categories.data ?? []).map((item) => <FilterChip styles={styles} key={item.category} label={`${item.label} (${item.observation_count})`} selected={category === item.category} onPress={() => setCategory(item.category)} />)}
      </ScrollView>
      {categories.error ? <Text style={styles.filterNote}>Category filters are unavailable; you can still browse and search all records.</Text> : null}
      {search || category ? <Text style={styles.filterNote}>Search and category filters are applied by the Earth Talk API.</Text> : null}
    </View>
    {query.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>Loading observations…</Text></View>
      : query.error && observations.length === 0 ? <View style={styles.empty}><MessageState title="Explore is unavailable" message={userFacingError(query.error)} onRetry={() => { void query.refetch(); }} /></View>
      : observations.length === 0 ? <View style={styles.empty}><MessageState title={search || category ? 'No matching observations' : 'No public observations yet'} message={search || category ? 'Try a different search or category. Filters are applied by the public API.' : 'The API returned no public records for this request.'} /></View>
      : <FlatList
        style={styles.flatList}
        data={observations} keyExtractor={(item) => item.passport_id}
        renderItem={({ item }) => <ObservationCard observation={item} onPress={() => router.push(observationDetailRoute(item.passport_id))} />}
        contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => { void query.refetch(); }} tintColor={colors.forest} />}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }} onEndReachedThreshold={0.4}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.forest} style={styles.footer} /> : query.isFetchNextPageError ? <Pressable accessibilityRole="button" onPress={() => { void query.fetchNextPage(); }}><Text style={styles.retry}>Could not load more. Tap to retry.</Text></Pressable> : undefined}
        ListHeaderComponent={query.error ? <Text style={styles.stale}>Could not refresh. Showing previously loaded records.</Text> : undefined}
      />}
    <View style={styles.submit}><WhatsAppSubmissionButton /></View>
  </Screen>;
}
function FilterChip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof createStyles> }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label} category filter`} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }
function createStyles(colors: Palette) { return StyleSheet.create({ header: { padding: spacing.md, gap: 8 }, flatList: { flex: 1 }, list: { paddingHorizontal: spacing.md, paddingBottom: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }, muted: { color: colors.muted }, empty: { padding: spacing.md }, footer: { padding: 18 }, retry: { textAlign: 'center', color: colors.forest, padding: 16, minHeight: 44 }, stale: { color: colors.warning, padding: 12, textAlign: 'center' }, search: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, borderRadius: 13, paddingHorizontal: 14 }, filterLabel: { color: colors.ink, fontWeight: '700', marginTop: 2 }, chips: { gap: 8, paddingVertical: 4 }, chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, minHeight: 44, justifyContent: 'center' }, chipSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '600' }, chipTextSelected: { color: colors.surface }, filterNote: { color: colors.muted, fontSize: 12 }, submit: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm } }); }

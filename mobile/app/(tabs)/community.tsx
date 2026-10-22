import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageState } from '../../components/AsyncState';
import { ObservationCard } from '../../components/ObservationCard';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useInvestigations, useRecentObservations, useSiteVisits, useSites } from '../../hooks/useObservations';
import { castInvestigationVote, recordSiteVisit } from '../../services/api';
import { getContributorToken } from '../../services/contributorToken';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type { CommunityInvestigation, PublicSite } from '../../types/api';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { runOnce } from '../../utils/actionLock';
import { userFacingError } from '../../utils/userFacingError';

export default function CommunityScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const sites = useSites();
  const investigations = useInvestigations();
  const observations = useRecentObservations();
  const [expandedSite, setExpandedSite] = useState('');
  const [feedback, setFeedback] = useState('');
  const writeLocks = useRef(new Set<string>());
  const vote = useMutation({
    mutationFn: async ({ item, option }: { item: CommunityInvestigation; option: string }) => castInvestigationVote(item.public_id, option, await getContributorToken()),
    onSuccess: async (result) => { setFeedback(result.message); await queryClient.invalidateQueries({ queryKey: ['community', 'investigations'] }); },
    onError: (error) => setFeedback(userFacingError(error)),
  });
  const visit = useMutation({
    mutationFn: async (site: PublicSite) => recordSiteVisit(site.site_id, localDate(), await getContributorToken()),
    onSuccess: async (_result, site) => { setFeedback('Your site visit was recorded by Earth Talk.'); await queryClient.invalidateQueries({ queryKey: ['community', 'visits', site.site_id] }); },
    onError: (error) => setFeedback(userFacingError(error)),
  });
  const refreshing = sites.isRefetching || investigations.isRefetching || observations.isRefetching;
  const refresh = () => { void Promise.all([sites.refetch(), investigations.refetch(), observations.refetch()]); };

  return <Screen scroll={false}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.forest} />}>
    <Eyebrow>Shared places and questions</Eyebrow>
    <ScreenTitle subtitle="Explore public field records and contribute to open geological discussions. Community activity is not scientific confirmation.">Community</ScreenTitle>
    {feedback ? <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss message: ${feedback}`} accessibilityLiveRegion="polite" onPress={() => setFeedback('')} style={styles.feedback}><Text style={styles.feedbackText}>{feedback}  ×</Text></Pressable> : null}

    <Section styles={styles} title="Open investigations" subtitle="Vote on the options set by the investigation author. Votes represent community opinion only.">
      {investigations.isLoading ? <ActivityIndicator color={colors.forest} /> : investigations.error && !investigations.data ? <MessageState title="Investigations unavailable" message={userFacingError(investigations.error)} onRetry={() => { void investigations.refetch(); }} /> : (investigations.data?.rows.length ?? 0) === 0 ? <Text style={styles.muted}>No open investigations were returned.</Text> : investigations.data?.rows.map((item) => <InvestigationCard key={item.public_id} item={item} pending={vote.isPending} onVote={(option) => { void runOnce(writeLocks.current, `vote:${item.public_id}`, () => vote.mutateAsync({ item, option })).catch(() => undefined); }} />)}
      {investigations.error && investigations.data ? <Text style={styles.muted}>Showing previously loaded records; refresh to retry.</Text> : null}
      {vote.isPending ? <Text style={styles.muted}>Sending vote…</Text> : null}
    </Section>

    <Section styles={styles} title="Recent observations" subtitle="Public observations from the existing Earth Talk feed.">
      {observations.isLoading ? <ActivityIndicator color={colors.forest} /> : observations.error && !observations.data ? <MessageState title="Observations unavailable" message={userFacingError(observations.error)} onRetry={() => { void observations.refetch(); }} /> : observations.data?.data.length ? observations.data.data.map((item) => <ObservationCard key={item.passport_id} observation={item} onPress={() => router.push(observationDetailRoute(item.passport_id))} />) : <Text style={styles.muted}>No public observations were returned.</Text>}
    </Section>

    <Section styles={styles} title="Field sites" subtitle="Public geological sites and community-reported visits.">
      {sites.isLoading ? <ActivityIndicator color={colors.forest} /> : sites.error && !sites.data ? <MessageState title="Sites unavailable" message={userFacingError(sites.error)} onRetry={() => { void sites.refetch(); }} /> : sites.data?.rows.length ? sites.data.rows.map((site) => <SiteCard key={site.site_id} site={site} expanded={expandedSite === site.site_id} onToggle={() => setExpandedSite(expandedSite === site.site_id ? '' : site.site_id)} onVisit={() => Alert.alert('Record a site visit?', 'This will record that you visited this public site today. Your device location is not collected.', [{ text: 'Cancel', style: 'cancel' }, { text: 'I visited today', onPress: () => { void runOnce(writeLocks.current, `visit:${site.site_id}`, () => visit.mutateAsync(site)).catch(() => undefined); } }])} visitPending={visit.isPending} />) : <Text style={styles.muted}>No public sites were returned.</Text>}
      {visit.isPending ? <Text style={styles.muted}>Recording visit…</Text> : null}
    </Section>

    <View style={styles.note}><Text style={styles.noteTitle}>Community contributions and evidence</Text><Text style={styles.noteBody}>Votes, participation counts, and visits describe community activity. They do not establish mineral identity, scientific accuracy, or expert confirmation.</Text></View>
    <WhatsAppSubmissionButton variant="participate" />
  </ScrollView></Screen>;
}

function InvestigationCard({ item, pending, onVote }: { item: CommunityInvestigation; pending: boolean; onVote: (option: string) => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totals = new Map(item.vote_distribution.map((entry) => [entry.option, entry.count]));
  return <View style={styles.card}>
    <Text style={styles.question}>{item.question}{item.is_demo ? ' · Demonstration record' : ''}</Text>
    {item.passport_id ? <Pressable accessibilityRole="link" onPress={() => router.push(observationDetailRoute(item.passport_id!))}><Text style={styles.link}>Open linked observation</Text></Pressable> : null}
    {item.options.length ? <View style={styles.options}>{item.options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Vote for ${option}`} accessibilityHint="This records a community opinion and does not confirm a scientific interpretation." disabled={pending} onPress={() => onVote(option)} style={({ pressed }) => [styles.voteButton, pressed && styles.pressed, pending && styles.disabled]}><Text style={styles.voteText}>{option} · {totals.get(option) ?? 0}</Text></Pressable>)}</View> : <Text style={styles.muted}>This investigation has no fixed voting choices, so voting is unavailable in the mobile app.</Text>}
    <Text style={styles.meta}>{item.participant_count} participants · {item.evidence_count} evidence contributions · {item.vote_count} votes</Text>
    <Text style={styles.disclaimer}>Community opinion, not scientific confirmation.</Text>
  </View>;
}

function SiteCard({ site, expanded, onToggle, onVisit, visitPending }: { site: PublicSite; expanded: boolean; onToggle: () => void; onVisit: () => void; visitPending: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visits = useSiteVisits(expanded ? site.site_id : '');
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} visits for ${site.title}`} accessibilityState={{ expanded }} onPress={onToggle} style={styles.siteHeader}><View style={{ flex: 1 }}><Text style={styles.siteTitle}>{site.title}{site.is_demo ? ' · Demonstration record' : ''}</Text>{site.district ? <Text style={styles.meta}>{site.district}</Text> : null}</View><Text style={styles.link}>{expanded ? 'Hide visits' : 'Visits'}</Text></Pressable>
    {site.description ? <Text style={styles.muted}>{site.description}</Text> : null}
    {expanded ? <View style={styles.visits}>
      {visits.isLoading ? <ActivityIndicator color={colors.forest} accessibilityLabel="Loading visits" /> : visits.error && !visits.data ? <MessageState title="Visits unavailable" message={userFacingError(visits.error)} onRetry={() => { void visits.refetch(); }} /> : visits.data?.rows.length ? visits.data.rows.map((entry) => <View key={entry.id} style={styles.visitEntry}><Text style={styles.visitDate}>{entry.visited_on} · {entry.contributor_handle}</Text>{entry.notes ? <Text style={styles.muted}>{entry.notes}</Text> : null}</View>) : <Text style={styles.muted}>No public visit records.</Text>}
      {visits.error && visits.data ? <Text style={styles.muted}>Showing previously loaded visits; refresh to retry.</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Record today's visit to ${site.title}`} accessibilityHint="Asks you to confirm before recording. Does not use device location." disabled={visitPending} onPress={onVisit} style={[styles.visitButton, visitPending && styles.disabled]}><Text style={styles.visitButtonText}>I visited this site today</Text></Pressable>
    </View> : null}
  </View>;
}
function Section({ title, subtitle, children, styles }: React.PropsWithChildren<{ title: string; subtitle: string; styles: ReturnType<typeof createStyles> }>) { return <View style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.muted}>{subtitle}</Text></View>{children}</View>; }
function localDate() { const date = new Date(); const pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

function createStyles(colors: Palette) { return StyleSheet.create({ content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md }, section: { gap: spacing.sm }, sectionHeader: { gap: 4, marginBottom: 2 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 13, lineHeight: 19 }, card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, gap: 9, marginBottom: spacing.sm }, question: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' }, options: { gap: 7 }, voteButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, paddingHorizontal: 12, justifyContent: 'center' }, voteText: { color: colors.forest, fontWeight: '700' }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.55 }, meta: { color: colors.muted, fontSize: 12 }, disclaimer: { color: colors.warning, fontSize: 12, fontWeight: '700' }, link: { color: colors.forest, fontSize: 13, fontWeight: '700' }, siteHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }, siteTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, visits: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }, visitEntry: { paddingVertical: 5, gap: 3 }, visitDate: { color: colors.ink, fontSize: 13, fontWeight: '700' }, visitButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.moss, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }, visitButtonText: { color: colors.forest, fontWeight: '800' }, feedback: { padding: 11, borderRadius: 12, backgroundColor: colors.moss }, feedbackText: { color: colors.forest, fontWeight: '600' }, note: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.warningBg, gap: 6 }, noteTitle: { color: colors.warning, fontWeight: '800' }, noteBody: { color: colors.ink, lineHeight: 19, fontSize: 13 } }); }

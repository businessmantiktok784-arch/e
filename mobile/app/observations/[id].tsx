import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AsyncPanel } from '../../components/AsyncPanel';
import { ObservationImage } from '../../components/ObservationImage';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useObservation } from '../../hooks/useObservations';
import { useObservationComments } from '../../hooks/useObservations';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError, createObservationComment } from '../../services/api';
import { userFacingError } from '../../utils/userFacingError';

export default function ObservationDetailScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useObservation(id ?? '');
  const observation = query.data;
  const comments = useObservationComments(observation?.passport_id ?? '');
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [commentFeedback, setCommentFeedback] = useState('');
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!auth.token || !observation) throw new Error('Sign in to comment.');
      return createObservationComment(observation.passport_id, text, auth.token);
    },
    onSuccess: async (created) => {
      setCommentText('');
      setCommentFeedback(created.message);
      await queryClient.invalidateQueries({ queryKey: ['observation-comments', observation?.passport_id] });
    },
    onError: (error) => setCommentFeedback(userFacingError(error)),
  });
  useEffect(() => {
    if (commentMutation.error instanceof ApiError && commentMutation.error.kind === 'unauthorized') void auth.refreshSession();
  }, [commentMutation.error, auth.refreshSession]);
  return <Screen><AsyncPanel isLoading={query.isLoading} error={query.error} isEmpty={!observation} onRetry={() => { void query.refetch(); }} emptyTitle="Observation unavailable" emptyMessage="This observation was not found or is not public." />
    {observation ? <>
      <Eyebrow>{observation.passport_id}</Eyebrow><ScreenTitle subtitle={`${observation.observation_category}${observation.observation_subcategory ? ` · ${observation.observation_subcategory}` : ''}`}>{observation.post_title || observation.possible_name || observation.observation_subcategory || 'Geological observation'}</ScreenTitle>
      <ObservationImage uri={observation.primary_media_url} label={`Public image for ${observation.post_title || observation.passport_id}`} />
      <View style={styles.meta}><Text style={styles.metaText}>{observation.district || (observation.location_precision === 'private' ? 'Location kept private' : 'Location not provided')}</Text><Text style={styles.metaText}>{observation.verification_status === 'expert_verified' ? 'Expert reviewed' : 'Not expert verified'}</Text></View>
      {observation.evidence_state ? <Section title="Evidence status"><Text style={styles.body}>{observation.evidence_state.replaceAll('_', ' ')}</Text></Section> : null}
      {observation.primary_interpretation ? <Section title="Preliminary interpretation"><Text style={styles.body}>{observation.primary_interpretation}</Text></Section> : null}
      {observation.geological_context ? <Section title="Context"><Text style={styles.body}>{observation.geological_context}</Text></Section> : null}
      <Section title="What was observed">{observation.observed_features.length ? observation.observed_features.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>) : <Text style={styles.body}>No feature notes were provided.</Text>}</Section>
      <Section title="Reasoning"><Text style={styles.body}>{observation.reasoning}</Text></Section>
      <Section title="Confidence"><Text style={styles.body}>{observation.confidence} ({Math.round(observation.confidence_score * 100)}%)</Text></Section>
      {observation.uncertainties?.length ? <Section title="Uncertainties">{observation.uncertainties.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>)}</Section> : null}
      <Section title="Limitations">{observation.limitations.length ? observation.limitations.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>) : <Text style={styles.body}>No limitations were listed in this record.</Text>}</Section>
      {observation.recommended_next_steps.length ? <Section title="Suggested next steps">{observation.recommended_next_steps.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>)}</Section> : null}
      <View style={styles.warning}><Text style={styles.warningTitle}>AI-assisted, not scientific confirmation</Text><Text style={styles.body}>{observation.safety_note}</Text></View>
      <Section title="Community discussion">
        {comments.isLoading ? <Text accessibilityRole="progressbar" accessibilityLabel="Loading public comments" style={styles.body}>Loading public comments…</Text> : comments.error && !comments.data ? <View><Text style={styles.body}>Comments are unavailable right now.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading public comments" hitSlop={8} onPress={() => { void comments.refetch(); }} style={styles.commentRetry}><Text style={styles.commentLink}>Tap to retry</Text></Pressable></View> : comments.data?.data.length ? comments.data.data.map((comment) => <View key={comment.comment_id} style={styles.comment}><Text style={styles.commentAuthor}>{comment.author.display_name}{comment.author.is_demo ? ' · Demonstration record' : ''}</Text><Text style={styles.body}>{comment.body}</Text><Text style={styles.commentDate}>{new Date(comment.created_at).toLocaleDateString()}</Text>{comment.replies.map((reply) => <View key={reply.comment_id} style={styles.reply}><Text style={styles.commentAuthor}>{reply.author.display_name}</Text><Text style={styles.body}>{reply.body}</Text><Text style={styles.commentDate}>{new Date(reply.created_at).toLocaleDateString()}</Text></View>)}</View>) : <Text style={styles.body}>No public comments are available for this observation.</Text>}
        {auth.user && auth.token ? <View style={styles.commentForm}>
          <TextInput accessibilityLabel="Write a public comment" placeholder="Add a respectful observation note" placeholderTextColor={colors.muted} multiline maxLength={2000} value={commentText} onChangeText={setCommentText} style={styles.commentInput} editable={!commentMutation.isPending} />
          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!commentText.trim() || commentMutation.isPending} onPress={() => { commentMutation.mutate(commentText); }} style={[styles.commentSubmit, (!commentText.trim() || commentMutation.isPending) && styles.disabled]}>
            {commentMutation.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.commentSubmitText}>Post comment</Text>}
          </Pressable>
        </View> : <Text style={styles.commentNote}>Sign in from Profile with your WhatsApp verified account to post a comment. Browsing remains public.</Text>}
        {commentFeedback ? <Text accessibilityRole="alert" style={styles.commentNote}>{commentFeedback}</Text> : null}
        {!auth.user ? <Link href="/(tabs)/profile" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open Profile to sign in" style={styles.commentRetry}><Text style={styles.commentLink}>Open Profile to sign in</Text></Pressable></Link> : null}
      </Section>
    </> : null}
  </Screen>;
}
function Section({ title, children }: React.PropsWithChildren<{ title: string }>) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function createStyles(colors: Palette) { return StyleSheet.create({ meta: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, metaText: { color: colors.muted, fontSize: 12 }, section: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: 9 }, sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, body: { color: colors.ink, lineHeight: 21, fontSize: 14 }, bullet: { color: colors.ink, lineHeight: 21, fontSize: 14 }, warning: { padding: spacing.md, backgroundColor: colors.warningBg, borderRadius: 16, gap: 8 }, warningTitle: { color: colors.warning, fontWeight: '800' }, comment: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 5 }, reply: { marginLeft: 14, paddingTop: 7, gap: 4 }, commentAuthor: { color: colors.forest, fontSize: 13, fontWeight: '700' }, commentDate: { color: colors.muted, fontSize: 11 }, commentNote: { color: colors.muted, fontSize: 12, lineHeight: 18 }, commentForm: { gap: 8 }, commentInput: { minHeight: 78, maxHeight: 160, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 12, textAlignVertical: 'top' }, commentSubmit: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }, commentSubmitText: { color: colors.surface, fontWeight: '800' }, disabled: { opacity: 0.5 }, commentRetry: { minHeight: 44, justifyContent: 'center' }, commentLink: { color: colors.forest, fontWeight: '700' } }); }

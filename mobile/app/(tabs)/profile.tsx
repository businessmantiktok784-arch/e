import { Link } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { useAppTheme } from '../../theme/theme-provider';
import { spacing, type Palette } from '../../theme/theme';
import { useAuth } from '../../auth/AuthProvider';
import { userFacingError } from '../../utils/userFacingError';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchMyObservations } from '../../services/api';
import { observationDetailRoute } from '../../utils/observationNavigation';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const ownObservations = useQuery({
    queryKey: ['account', 'observations', auth.user?.public_user_id],
    queryFn: ({ signal }) => fetchMyObservations(auth.token!, signal),
    enabled: Boolean(auth.user && auth.token),
  });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [displayName, setDisplayName] = useState('');
  useEffect(() => { setDisplayName(auth.user?.display_name ?? ''); }, [auth.user?.display_name]);
  useEffect(() => {
    if (ownObservations.error instanceof ApiError && ownObservations.error.kind === 'unauthorized') void auth.refreshSession();
  }, [ownObservations.error, auth.refreshSession]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setFeedback('');
    try { await action(); }
    catch (error) {
      setFeedback(userFacingError(error));
      if (error instanceof ApiError && error.kind === 'unauthorized') void auth.refreshSession();
    }
    finally { setBusy(false); }
  };
  const requestCode = () => run(async () => {
    const result = await auth.requestCode(phone.trim());
    setCodeRequested(true);
    setFeedback(result.delivery === 'whatsapp' ? 'A six digit sign-in code was sent through WhatsApp. It expires soon; enter it below.' : 'Development delivery is active. Check the backend development console for the code.');
  });
  const verifyCode = () => run(async () => {
    await auth.verifyCode(phone.trim(), code.trim());
    setCode(''); setPhone(''); setCodeRequested(false); setFeedback('You are signed in.');
  });
  const signOut = () => Alert.alert('Sign out of Earth Talk?', 'Your server session will be revoked.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { void run(async () => { await auth.signOut(); queryClient.removeQueries({ queryKey: ['account', 'observations'] }); }); } },
  ]);

  return <Screen>
    <Eyebrow>Your Earth Talk</Eyebrow><ScreenTitle subtitle="Your mobile profile and app preferences.">Profile</ScreenTitle>
    {!auth.ready ? <View style={styles.panel}><Text style={styles.title}>Checking account session</Text><Text style={styles.body}>Public browsing remains available.</Text></View> : auth.user ? <View style={styles.panel}>
      <Text style={styles.title}>{auth.user.display_name || 'Earth Talk contributor'}{auth.user.is_demo ? ' · Demonstration account' : ''}</Text>
      <Text style={styles.body}>Signed in with a WhatsApp verified Earth Talk account. Your phone number is not displayed or stored in app preferences.</Text>
      <Text accessibilityLabel="Public account identifier" style={styles.body}>Public ID: {auth.user.public_user_id}</Text>
      <TextInput accessibilityLabel="Public display name" placeholder="Display name" placeholderTextColor={colors.muted} value={displayName} onChangeText={setDisplayName} maxLength={60} style={styles.input} editable={!busy} />
      <Pressable accessibilityRole="button" accessibilityLabel="Save public display name" disabled={busy} onPress={() => { void run(async () => { await auth.updateDisplayName(displayName.trim() || null); setDisplayName(''); setFeedback('Profile name updated.'); }); }} style={[styles.action, busy && styles.disabled]}><Text style={styles.actionText}>{busy ? 'Saving…' : 'Save display name'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out and revoke this session" onPress={signOut} style={styles.action} disabled={busy}><Text style={styles.actionText}>{busy ? 'Signing out…' : 'Sign out'}</Text></Pressable>
    </View> : <View style={styles.panel}>
      <Text style={styles.title}>Guest access</Text>
      <Text style={styles.body}>Browse public observations, map data, and community information without signing in. Sign-in is optional and uses the existing WhatsApp verification flow.</Text>
      {auth.restoreFailed ? <Pressable accessibilityRole="button" onPress={() => { void auth.refreshSession(); }} style={styles.action}><Text style={styles.actionText}>Retry session check</Text></Pressable> : null}
      {!auth.ready ? null : Platform.OS === 'web' ? <Text style={styles.body}>Native account sign-in is available in the iOS or Android app, not the web preview.</Text> : <>
        <TextInput accessibilityLabel="WhatsApp phone number with country code" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+250 78 123 45 67" placeholderTextColor={colors.muted} value={phone} onChangeText={setPhone} style={styles.input} editable={!busy} />
        {codeRequested ? <TextInput accessibilityLabel="Six digit WhatsApp verification code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="6 digit code" placeholderTextColor={colors.muted} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} style={styles.input} editable={!busy} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={codeRequested ? 'Send a new sign-in code through WhatsApp' : 'Request sign-in code through WhatsApp'} disabled={busy || !phone.trim()} onPress={requestCode} style={[styles.action, (busy || !phone.trim()) && styles.disabled]}><Text style={styles.actionText}>{busy ? 'Please wait…' : codeRequested ? 'Send a new code' : 'Request WhatsApp code'}</Text></Pressable>
        {codeRequested ? <Pressable accessibilityRole="button" accessibilityLabel="Verify code and sign in" disabled={busy || code.length !== 6} onPress={verifyCode} style={[styles.action, (busy || code.length !== 6) && styles.disabled]}><Text style={styles.actionText}>Verify and sign in</Text></Pressable> : null}
      </>}
    </View>}
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    {auth.user ? <View style={styles.panel}>
      <Text style={styles.title}>Your observations</Text>
      <Text style={styles.body}>This private account list is returned by Earth Talk. Coordinates are not displayed here.</Text>
      {ownObservations.isLoading ? <Text accessibilityRole="progressbar" style={styles.body}>Loading your records…</Text>
        : ownObservations.error && !ownObservations.data ? <><Text style={styles.body}>{userFacingError(ownObservations.error)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading your observations" onPress={() => { void ownObservations.refetch(); }} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable></>
          : ownObservations.data?.data.length ? ownObservations.data.data.map((item) => <View key={item.passport_id} style={styles.record}>
            {item.is_public ? <Link href={observationDetailRoute(item.passport_id)} asChild><Pressable accessibilityRole="link" accessibilityLabel={`Open public observation ${item.title}`}><Text style={styles.recordTitle}>{item.title}</Text><Text style={styles.recordMeta}>{item.passport_id} · {item.observation_category} · Public</Text></Pressable></Link>
              : <><Text style={styles.recordTitle}>{item.title}</Text><Text style={styles.recordMeta}>{item.passport_id} · {item.observation_category} · Private</Text><Text style={styles.body}>Owner-only details are not available in this mobile view.</Text></>}
            <Text style={styles.recordMeta}>{new Date(item.created_at).toLocaleDateString()} · {item.media_count} media · {item.comment_count} comments · {item.open_question_count} open questions</Text>
          </View>) : <Text style={styles.body}>No account observations were returned.</Text>}
      {ownObservations.error && ownObservations.data ? <Text style={styles.body}>Could not refresh; showing previously loaded account records.</Text> : null}
    </View> : null}
    <Link href="/settings" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open settings" style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Text style={styles.rowText}>Settings</Text><Text aria-hidden style={styles.chevron}>›</Text></Pressable></Link>
    {!auth.user ? <View style={styles.panel}><Text style={styles.title}>Account data stays optional</Text><Text style={styles.body}>Signing in is required only for account-specific actions such as posting comments. Public browsing remains available while signed out.</Text></View> : null}
    <View style={styles.panel}><Text style={styles.title}>Contribute through the supported workflow</Text><Text style={styles.body}>Observation submissions continue through the existing WhatsApp flow. This app does not upload photos for AI analysis.</Text><WhatsAppSubmissionButton variant="participate" /></View>
  </Screen>;
}
function createStyles(colors: Palette) { return StyleSheet.create({
  panel: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: 18, borderWidth: 1, borderColor: colors.line, gap: 8 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 16 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, color: colors.ink, borderRadius: 12, paddingHorizontal: 13, fontSize: 16 },
  action: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }, actionText: { color: colors.surface, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.55 }, feedback: { color: colors.ink, backgroundColor: colors.moss, padding: 12, borderRadius: 12, lineHeight: 19 },
  record: { gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }, recordTitle: { color: colors.forest, fontWeight: '800', fontSize: 15 }, recordMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  row: { minHeight: 52, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowText: { color: colors.ink, fontWeight: '700', fontSize: 15 }, chevron: { color: colors.forest, fontSize: 24 }, pressed: { opacity: 0.8 },
}); }

import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp';

export function WhatsAppSubmissionButton({ variant = 'submit' }: { variant?: 'submit' | 'participate' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [opening, setOpening] = useState(false);
  const hasRecipient = hasConfiguredWhatsAppRecipient();
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try { await Linking.openURL(buildWhatsAppStartUrl()); }
    catch { Alert.alert('WhatsApp could not be opened', 'Install WhatsApp or open the Earth Talk WhatsApp entry link from a browser. The app does not submit images directly.'); }
    finally { setOpening(false); }
  };
  const title = variant === 'participate' ? 'Participate through WhatsApp' : 'Submit an Observation via WhatsApp';
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint="Opens WhatsApp. No message is sent automatically." disabled={opening} hitSlop={4} onPress={() => { void open(); }} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{hasRecipient ? 'Opens Earth Talk’s configured WhatsApp chat with START prepared.' : 'Opens WhatsApp’s chat picker. Choose the verified Earth Talk account before continuing.'} Nothing is sent automatically; direct photo submission is not available in this app.</Text></Pressable>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ button: { minHeight: 60, padding: 16, borderRadius: 16, backgroundColor: colors.forest, gap: 6 }, pressed: { opacity: 0.85 }, title: { color: colors.surface, fontSize: 15, fontWeight: '800' }, body: { color: colors.surface, fontSize: 13, lineHeight: 19, opacity: 0.92 } }); }

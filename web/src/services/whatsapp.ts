/**
 * The single place that builds and opens the Earth Talk WhatsApp link.
 *
 * The business number is configuration, not code: it is read from
 * `VITE_WHATSAPP_NUMBER`. Until it is set, the link still points at WhatsApp's
 * "share/pick a chat" surface rather than a broken deep link, so the button
 * always does something and the number can be dropped in later without touching
 * a component.
 */

const env = (import.meta as any).env ?? {};

/** Digits-only business number, or an empty string when it is not configured. */
export const WHATSAPP_NUMBER: string = String(env.VITE_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');

export const WHATSAPP_START_MESSAGE = 'START';
/** Sent when a signed-in contributor opens My Earth Talk from WhatsApp. */
export const WHATSAPP_MY_EARTH_TALK_MESSAGE = 'MY EARTH TALK';

/** The `wa.me` deep link for a message, with or without a configured number. */
export function whatsAppUrl(message: string = WHATSAPP_START_MESSAGE): string {
  const text = encodeURIComponent(message);
  return WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/**
 * Opens WhatsApp in a new tab. Returns false when the browser blocks the popup,
 * so the caller can fall back to showing the guide card with a real link.
 *
 * The window is opened without the `noopener` feature string on purpose. Per the
 * HTML spec a browser returns `null` from `window.open` whenever `noopener` is
 * requested, which made a successful navigation indistinguishable from a blocked
 * popup and caused the caller to stack the guide card on top of an already-open
 * WhatsApp tab. The opener reference is severed manually instead, immediately
 * after a successful open, which keeps the same protection without losing the
 * ability to detect a blocked popup.
 */
export function openWhatsApp(message: string = WHATSAPP_START_MESSAGE): boolean {
  if (typeof window === 'undefined') return false;
  const opened = window.open(whatsAppUrl(message), '_blank');
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // A cross-origin window may refuse the assignment; the tab is already open.
  }
  return true;
}

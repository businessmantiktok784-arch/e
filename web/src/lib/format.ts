/**
 * Presentation-only string and date formatting.
 *
 * These were copy-pasted across the passport modal, the result list, the side
 * card and the discussion panel. They hold no business rules — the server owns
 * the values, these only render them consistently.
 */

/** Capitalises the first letter and lowercases the rest; `Unknown` when empty. */
export function formatCapitalized(text?: string | null): string {
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** `12 Jun 2026` style date used on passport and attachment cards. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Date and time for discussion threads; an empty string for an invalid value. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

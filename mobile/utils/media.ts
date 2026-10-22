export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const parsed = new URL(value.trim()); return parsed.protocol === 'https:' || parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production' ? parsed.toString() : null; }
  catch { return null; }
}

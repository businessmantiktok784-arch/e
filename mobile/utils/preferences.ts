import type { ThemeMode } from '../theme/theme';

export const THEME_PREFERENCE_KEY = 'earth-talk-preferences-v1';
export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
export interface PreferenceStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }

export async function loadThemePreference(storage: PreferenceStorage): Promise<ThemeMode> {
  try {
    const raw = await storage.getItem(THEME_PREFERENCE_KEY);
    if (raw === null) return 'system';
    try {
      const stored: unknown = JSON.parse(raw);
      if (typeof stored === 'object' && stored !== null && 'version' in stored && stored.version === 1 && 'theme' in stored) return normalizeThemeMode(stored.theme);
    } catch { /* Corrupted preference: use the safe system default. */ }
  } catch { /* Storage is optional; app startup must continue. */ }
  return 'system';
}
export async function saveThemePreference(storage: PreferenceStorage, theme: ThemeMode): Promise<void> {
  await storage.setItem(THEME_PREFERENCE_KEY, JSON.stringify({ version: 1, theme: normalizeThemeMode(theme) }));
}

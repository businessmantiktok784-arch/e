import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../services/api.ts';
import { loadThemePreference, normalizeThemeMode, saveThemePreference, THEME_PREFERENCE_KEY, type PreferenceStorage } from '../utils/preferences.ts';
import { shouldRetryRead } from '../utils/queryPolicy.ts';
import { userFacingError } from '../utils/userFacingError.ts';

function memoryStorage(initial?: string): PreferenceStorage {
  let value = initial ?? null;
  return { async getItem(key) { assert.equal(key, THEME_PREFERENCE_KEY); return value; }, async setItem(key, next) { assert.equal(key, THEME_PREFERENCE_KEY); value = next; } };
}

test('appearance preference defaults safely and round-trips supported modes', async () => {
  const storage = memoryStorage();
  assert.equal(await loadThemePreference(storage), 'system');
  await saveThemePreference(storage, 'dark');
  assert.equal(await loadThemePreference(storage), 'dark');
  await saveThemePreference(storage, 'light');
  assert.equal(await loadThemePreference(storage), 'light');
});

test('corrupt, outdated, and unavailable preference storage falls back to system', async () => {
  assert.equal(await loadThemePreference(memoryStorage('{broken')), 'system');
  assert.equal(await loadThemePreference(memoryStorage(JSON.stringify({ version: 0, theme: 'dark' }))), 'system');
  assert.equal(await loadThemePreference(memoryStorage(JSON.stringify({ version: 99, theme: 'dark' }))), 'system');
  assert.equal(await loadThemePreference(memoryStorage(JSON.stringify({ version: 1, theme: 'neon' }))), 'system');
  const unavailable: PreferenceStorage = { async getItem() { throw new Error('storage unavailable'); }, async setItem() { throw new Error('storage unavailable'); } };
  assert.equal(await loadThemePreference(unavailable), 'system');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('anything else'), 'system');
});

test('read retry policy retries only one transient network/server failure', () => {
  assert.equal(shouldRetryRead(0, new ApiError('unavailable', undefined, undefined, 'network')), true);
  assert.equal(shouldRetryRead(0, new ApiError('timeout', undefined, undefined, 'timeout')), true);
  assert.equal(shouldRetryRead(0, new ApiError('server', 503, undefined, 'server')), true);
  assert.equal(shouldRetryRead(1, new ApiError('server', 503, undefined, 'server')), false);
  for (const kind of ['configuration', 'malformed', 'unauthorized', 'forbidden', 'not-found', 'rate-limit', 'http'] as const) {
    assert.equal(shouldRetryRead(0, new ApiError('private detail', undefined, undefined, kind)), false);
  }
});

test('user-facing errors do not expose raw server details', () => {
  const error = new ApiError('database password leaked by server', 500, 'INTERNAL_ERROR', 'server');
  assert.equal(userFacingError(error), 'Earth Talk is temporarily unavailable. Try again later.');
  assert.equal(userFacingError(new Error('private low-level stack text')), 'Something went wrong. Please try again.');
});

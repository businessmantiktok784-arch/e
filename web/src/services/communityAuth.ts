import type { CommunitySession, CommunityUser } from '../types/communityPosts.js';
import { apiUrl, bearerHeaders, requestJson } from './http.js';
import { createPersistedStore } from './localStore.js';

const TOKEN_STORAGE_KEY = 'rt_community_token';

/**
 * WhatsApp verification session state (Stage 12).
 *
 * The signed-in contributor is a single shared, reactive value: the side card
 * and the MY EARTH TALK dashboard both need it, and it must change in both the
 * moment a session is established or lost. A persisted store keeps that
 * guarantee without a context provider or a global event emitter to debug.
 */

const store = createPersistedStore<CommunitySession | null>(TOKEN_STORAGE_KEY, null, {
  deserialize: (raw, fallback) => {
    const parsed = raw as CommunitySession | null;
    return parsed && parsed.token && parsed.user ? parsed : fallback;
  },
});

export function getCommunitySession(): CommunitySession | null {
  return store.get();
}

export function getCommunityToken(): string | null {
  return getCommunitySession()?.token ?? null;
}

export function setCommunitySession(next: CommunitySession | null): void {
  store.set(next);
}

export function useCommunitySession(): CommunitySession | null {
  return store.use();
}

export function useCommunityUser(): CommunityUser | null {
  return useCommunitySession()?.user ?? null;
}

export interface RequestCodeResult {
  delivery: string;
  message: string;
  expires_in_seconds: number;
}

/** POST /api/auth/request-code */
export async function requestCode(phone: string): Promise<RequestCodeResult> {
  return requestJson<RequestCodeResult>('/api/auth/request-code', {
    method: 'POST',
    headers: bearerHeaders(null),
    json: { phone },
    errorMessage: 'Sign-in request failed.',
  });
}

/** POST /api/auth/verify-code — returns a token exactly once. */
export async function verifyCode(phone: string, code: string): Promise<CommunitySession> {
  const data = await requestJson<{ token: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
      headers: bearerHeaders(null),
      json: { phone, code },
      errorMessage: 'The code could not be verified.',
    }
  );
  const next: CommunitySession = { token: data.token, expires_at: data.expires_at, user: data.user };
  setCommunitySession(next);
  return next;
}

/** GET /api/auth/session — reconciles a stored token with the server. */
export async function refreshSession(): Promise<CommunityUser | null> {
  const token = getCommunityToken();
  if (!token) return null;
  const res = await fetch(apiUrl('/api/auth/session'), { headers: bearerHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.authenticated && data.user) {
    const current = getCommunitySession();
    if (current) {
      setCommunitySession({ ...current, user: data.user });
    }
    return data.user;
  }
  setCommunitySession(null);
  return null;
}

/** POST /api/auth/sign-out */
export async function signOut(): Promise<void> {
  const token = getCommunityToken();
  try {
    if (token) {
      await fetch(apiUrl('/api/auth/sign-out'), {
        method: 'POST',
        headers: bearerHeaders(token),
      });
    }
  } catch {
    // A signed-out identity is still signed out locally.
  }
  setCommunitySession(null);
}

/** PATCH /api/auth/profile */
export async function updateProfile(displayName: string | null): Promise<CommunityUser> {
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const data = await requestJson<{ user: CommunityUser }>('/api/auth/profile', {
    method: 'PATCH',
    headers: bearerHeaders(token),
    json: { display_name: displayName },
    errorMessage: 'Profile update failed.',
  });
  const current = getCommunitySession();
  if (current) setCommunitySession({ ...current, user: data.user });
  return data.user;
}

/**
 * URL for a contributor's profile photo, or null without a public id.
 *
 * `version` busts the browser cache after a change so a replaced or removed
 * photo is not served from the old cache entry.
 */
export function userAvatarSrc(
  publicUserId: string | null | undefined,
  version?: number | string
): string | null {
  if (!publicUserId) return null;
  const base = apiUrl(`/api/users/${encodeURIComponent(publicUserId)}/avatar`);
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`;
}

/** POST /api/auth/avatar — replaces the signed-in contributor's profile photo. */
export async function setAvatar(
  contentBase64: string,
  mimeType: string
): Promise<{ updatedAt: string }> {
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const data = await requestJson<{ updatedAt: string }>('/api/auth/avatar', {
    method: 'POST',
    headers: bearerHeaders(token),
    json: { content_base64: contentBase64, mime_type: mimeType },
    errorMessage: 'The photo could not be saved.',
  });
  return { updatedAt: data.updatedAt };
}

/** DELETE /api/auth/avatar — removes the signed-in contributor's profile photo. */
export async function clearAvatar(): Promise<void> {
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  await requestJson('/api/auth/avatar', {
    method: 'DELETE',
    headers: bearerHeaders(token),
    errorMessage: 'The photo could not be removed.',
  });
}

/** Auth header for community post APIs; empty when signed out. */
export function getCommunityAuthHeaders(): Record<string, string> {
  return bearerHeaders(getCommunityToken());
}
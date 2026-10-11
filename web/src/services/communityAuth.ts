import { useSyncExternalStore } from 'react';
import type { CommunitySession, CommunityUser } from '../types/communityPosts.js';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';
const TOKEN_STORAGE_KEY = 'rt_community_token';

/**
 * WhatsApp verification session state (Stage 12).
 *
 * The signed-in contributor is a single shared, reactive value: the side card
 * and the MY EARTH TALK dashboard both need it, and it must change in both the
 * moment a session is established or lost. `useSyncExternalStore` keeps that
 * guarantee without a context provider or a global event emitter to debug.
 */

let session: CommunitySession | null = null;
let restored = false;
const listeners = new Set<() => void>();

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CommunitySession;
      if (parsed && parsed.token && parsed.user) session = parsed;
    }
  } catch {
    session = null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCommunitySession(): CommunitySession | null {
  restore();
  return session;
}

export function getCommunityToken(): string | null {
  return getCommunitySession()?.token ?? null;
}

export function setCommunitySession(next: CommunitySession | null): void {
  restore();
  session = next;
  if (next) {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  emit();
}

export function useCommunitySession(): CommunitySession | null {
  restore();
  return useSyncExternalStore(subscribe, getCommunitySession, getCommunitySession);
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
  const res = await fetch(`${API_BASE_URL}/api/auth/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message ?? data.error ?? 'Sign-in request failed.');
  }
  return data;
}

/** POST /api/auth/verify-code — returns a token exactly once. */
export async function verifyCode(phone: string, code: string): Promise<CommunitySession> {
  const res = await fetch(`${API_BASE_URL}/api/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message ?? data.error ?? 'The code could not be verified.');
  }
  const next: CommunitySession = { token: data.token, expires_at: data.expires_at, user: data.user };
  setCommunitySession(next);
  return next;
}

/** GET /api/auth/session — reconciles a stored token with the server. */
export async function refreshSession(): Promise<CommunityUser | null> {
  const token = getCommunityToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
      await fetch(`${API_BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
  const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Profile update failed.');
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
  const base = `${API_BASE_URL}/api/users/${encodeURIComponent(publicUserId)}/avatar`;
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`;
}

/** POST /api/auth/avatar — replaces the signed-in contributor's profile photo. */
export async function setAvatar(
  contentBase64: string,
  mimeType: string
): Promise<{ updatedAt: string }> {
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const res = await fetch(`${API_BASE_URL}/api/auth/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content_base64: contentBase64, mime_type: mimeType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message ?? 'The photo could not be saved.');
  return { updatedAt: data.updatedAt };
}

/** DELETE /api/auth/avatar — removes the signed-in contributor's profile photo. */
export async function clearAvatar(): Promise<void> {
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const res = await fetch(`${API_BASE_URL}/api/auth/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message ?? 'The photo could not be removed.');
  }
}

/** Auth header for community post APIs; empty when signed out. */
export function getCommunityAuthHeaders(): HeadersInit {
  const token = getCommunityToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
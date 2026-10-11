import { useSyncExternalStore } from 'react';
import type { CommunityUser } from '../types/communityPosts.js';

/**
 * Lightweight local contributor account.
 *
 * Earth Talk does not require a WhatsApp number to take part in Community
 * Discovery. A reader who wants to ask, answer or vote signs in with a display
 * name and, optionally, how they are involved in geoscience. The identity is
 * held only in this browser and carries no contact details.
 *
 * This is deliberately separate from the WhatsApp-verified `CommunitySession`
 * in `communityAuth.ts`: that session needs a database and unlocks the owner
 * features (posting and commenting on your own observations). The local account
 * is the low-friction gate that makes Community Discovery read-only for
 * anonymous visitors while still letting a named person contribute.
 */

const STORAGE_KEY = 'rt_local_account';

export interface LocalAccount {
  /** Stable id derived once and kept with the display name. */
  public_user_id: string;
  display_name: string;
  /** Optional self-declared involvement: student, geologist, researcher, ... */
  role: string | null;
  /**
   * When the display name was last changed. The name is editable once every
   * seven days, so this is the anchor the countdown reads from. Null means the
   * name has never been changed by the reader (a fresh, auto-created account),
   * which is still editable.
   */
  display_name_updated_at?: string | null;
  /** True for an account the app created on the reader's behalf. */
  auto_created?: boolean;
}

/** How long after a rename the next rename becomes available. */
export const DISPLAY_NAME_EDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const FIELD_EXPLORER_SEQ_KEY = 'rt_field_explorer_seq';

/** The next free number in this browser's "Field Explorer #N" sequence. */
function nextFieldExplorerNumber(): number {
  try {
    const raw = localStorage.getItem(FIELD_EXPLORER_SEQ_KEY);
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
    localStorage.setItem(FIELD_EXPLORER_SEQ_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

export const CONTRIBUTOR_ROLES = [
  'Student',
  'Geologist',
  'Researcher',
  'Educator',
  'Mining or engineering professional',
  'Enthusiast',
  'Other',
] as const;

let account: LocalAccount | null = null;
let restored = false;
const listeners = new Set<() => void>();

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalAccount;
      if (parsed && typeof parsed.public_user_id === 'string' && typeof parsed.display_name === 'string') {
        account = parsed;
      }
    }
  } catch {
    account = null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function newId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `local:${random}`;
}

export function getLocalAccount(): LocalAccount | null {
  restore();
  return account;
}

export function setLocalAccount(next: LocalAccount | null): void {
  restore();
  account = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode). The session lasts this page only.
  }
  emit();
}

/** Creates the local account from a display name and optional role. */
export function signInLocalAccount(displayName: string, role: string | null): LocalAccount {
  const trimmed = displayName.trim().slice(0, 60);
  const next: LocalAccount = {
    public_user_id: account?.public_user_id ?? newId(),
    display_name: trimmed || 'Anonymous contributor',
    role: role ?? null,
    display_name_updated_at: new Date().toISOString(),
    auto_created: false,
  };
  setLocalAccount(next);
  return next;
}

/**
 * The identity the app hands a reader who opens My Earth Talk without having
 * signed in: a numbered "Field Explorer" name they can rename later, but that
 * never claims to be a real person and carries no contact detail.
 */
export function createFieldExplorerAccount(): LocalAccount {
  const existing = getLocalAccount();
  // An account that already exists is returned untouched. Creating another
  // would renumber the reader's name and reset the seven-day edit anchor every
  // time they opened My Earth Talk, silently discarding a rename they had made.
  if (existing) return existing;

  const next: LocalAccount = {
    public_user_id: newId(),
    display_name: `Field Explorer #${nextFieldExplorerNumber()}`,
    role: null,
    display_name_updated_at: null,
    auto_created: true,
  };
  setLocalAccount(next);
  return next;
}

/**
 * Epoch milliseconds when the next rename is allowed; 0 means "now".
 *
 * Takes the raw "last changed" timestamp so the same rule can be applied to a
 * server-verified account, whose window is enforced by the backend, without
 * pretending it has a local account object.
 */
export function nextDisplayNameEditAtFor(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  const last = Date.parse(updatedAt);
  if (!Number.isFinite(last)) return 0;
  return last + DISPLAY_NAME_EDIT_INTERVAL_MS;
}

export function canEditDisplayNameFor(updatedAt: string | null | undefined): boolean {
  return nextDisplayNameEditAtFor(updatedAt) <= Date.now();
}

/** Epoch milliseconds when the next rename is allowed; 0 means "now". */
export function nextDisplayNameEditAt(account: LocalAccount | null): number {
  return nextDisplayNameEditAtFor(account?.display_name_updated_at);
}

export function canEditDisplayName(account: LocalAccount | null): boolean {
  return nextDisplayNameEditAt(account) <= Date.now();
}

/**
 * Renames a local account, enforcing the seven-day interval. Throws a
 * reader-facing message when the interval has not elapsed, so the UI can show
 * the same rule it enforces.
 */
export function updateLocalAccountDisplayName(name: string): LocalAccount {
  restore();
  if (!account) throw new Error('There is no local account to rename.');
  const at = nextDisplayNameEditAt(account);
  if (at > Date.now()) {
    const days = Math.ceil((at - Date.now()) / (24 * 60 * 60 * 1000));
    throw new Error(`Your name can be changed again in ${days} day${days === 1 ? '' : 's'}.`);
  }
  const trimmed = name.trim().slice(0, 60);
  const next: LocalAccount = {
    ...account,
    display_name: trimmed || 'Anonymous contributor',
    display_name_updated_at: new Date().toISOString(),
  };
  setLocalAccount(next);
  return next;
}

export function signOutLocalAccount(): void {
  setLocalAccount(null);
}

export function useLocalAccount(): LocalAccount | null {
  restore();
  return useSyncExternalStore(subscribe, getLocalAccount, getLocalAccount);
}

/**
 * Presents the local account in the same shape as a verified contributor, so
 * components that already accept a `CommunityUser` can render a display name
 * without a second code path.
 */
export function localAccountAsUser(local: LocalAccount): CommunityUser {
  return {
    public_user_id: local.public_user_id,
    display_name: local.display_name,
    is_demo: false,
  };
}

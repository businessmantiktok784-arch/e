import { useSyncExternalStore } from 'react';

/**
 * A tiny reactive store persisted to `localStorage`.
 *
 * Several surfaces the sidebar needs - saved places, the browser activity log,
 * user preferences, contribution drafts - have no server table behind them.
 * Rather than invent a backend, each one is a real value that lives in this
 * browser only, is read and written through one typed store, and is shared
 * reactively so two components showing it never disagree.
 *
 * Storage is best-effort: a browser in private mode that refuses `localStorage`
 * still gets a working in-memory store for the length of the session.
 */

export interface PersistedStore<T> {
  /** The `localStorage` key, exposed so a screen can show or clear it. */
  readonly key: string;
  get: () => T;
  set: (next: T) => void;
  update: (updater: (previous: T) => T) => void;
  reset: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Subscribe a component to this store. */
  use: () => T;
}

export function createPersistedStore<T>(key: string, initial: T): PersistedStore<T> {
  let current: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) current = JSON.parse(raw) as T;
    } catch {
      // A corrupt or unavailable value leaves the in-memory default in place.
      current = initial;
    }
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const get = (): T => {
    load();
    return current;
  };

  const set = (next: T): void => {
    load();
    current = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage refused the write; the value still holds for this session.
    }
    emit();
  };

  const update = (updater: (previous: T) => T): void => set(updater(get()));

  const reset = (): void => set(initial);

  const subscribe = (listener: () => void): (() => void) => {
    load();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const use = (): T => {
    load();
    return useSyncExternalStore(subscribe, get, get);
  };

  return { key, get, set, update, reset, subscribe, use };
}

/** Reads arbitrary JSON with a typed fallback, for one-off lookups. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** A stable, collision-free id for a locally stored record. */
export function localId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

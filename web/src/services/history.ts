import type { AppView, CommunityPanel } from '../navigation.js';
import { createPersistedStore } from './localStore.js';

/**
 * A small, local visit log for the sidebar's History destination.
 *
 * Nothing here leaves the browser: it is a convenience list of the places the
 * reader has already opened, kept in the same spirit as a browser's own
 * history. It stores no observation content, no coordinates and no identity -
 * only enough to reopen the exact screen that was visited.
 */

const STORAGE_KEY = 'rt_history';
const MAX_ENTRIES = 200;

export interface HistoryEntry {
  /** Stable key for React and for collapsing duplicate consecutive visits. */
  id: string;
  view: AppView;
  panel?: CommunityPanel;
  /** Set when the visit opened one observation's side card. */
  passportId?: string;
  /** Set when the visit opened a site explorer. */
  siteId?: string;
  /** Human-readable label shown in the list. */
  label: string;
  /** Extra line, e.g. the site code or the view description. */
  subtitle?: string;
  /** Epoch milliseconds. */
  at: number;
}

function isHistoryEntry(entry: unknown): entry is HistoryEntry {
  const value = entry as Partial<HistoryEntry> | null;
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.view === 'string' &&
    typeof value.at === 'number'
  );
}

const store = createPersistedStore<HistoryEntry[]>(STORAGE_KEY, [], {
  deserialize: (raw, fallback) =>
    Array.isArray(raw) ? raw.filter(isHistoryEntry) : fallback,
});

function keyOf(entry: Pick<HistoryEntry, 'view' | 'panel' | 'passportId' | 'siteId'>): string {
  return [entry.view, entry.panel ?? '', entry.passportId ?? '', entry.siteId ?? ''].join('|');
}

/**
 * Records a visit, newest first. An identical consecutive destination only
 * moves to the top with a fresh timestamp rather than piling up duplicates,
 * which is how a browser folds a reload of the same page into one entry.
 */
export function recordHistory(entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: number }): void {
  const at = entry.at ?? Date.now();
  const key = keyOf(entry);
  store.update((entries) => {
    const next = entries.filter((existing) => keyOf(existing) !== key);
    next.unshift({ ...entry, at, id: key });
    return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
  });
}

export function getHistory(): HistoryEntry[] {
  return store.get();
}

/** Removes one visit from the list, by its stable id. */
export function removeHistory(id: string): void {
  store.update((entries) => entries.filter((entry) => entry.id !== id));
}

export function clearHistory(): void {
  store.reset();
}

export function useHistory(): HistoryEntry[] {
  return store.use();
}

/** `HH:MM` in the reader's own locale, matching a browser history's time column. */
export function formatHistoryTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The heading for a visit: "Today", "Yesterday", or a full date. */
export function formatHistoryDay(at: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(at);
  const dayMs = 24 * 60 * 60 * 1000;
  if (day === today) return 'Today';
  if (day === today - dayMs) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface HistoryDayGroup {
  day: string;
  items: HistoryEntry[];
}

/** Buckets entries by calendar day, newest first; entries are already ordered. */
export function groupHistoryByDay(list: HistoryEntry[]): HistoryDayGroup[] {
  const groups: HistoryDayGroup[] = [];
  for (const entry of list) {
    const day = formatHistoryDay(entry.at);
    const current = groups[groups.length - 1];
    if (current && current.day === day) current.items.push(entry);
    else groups.push({ day, items: [entry] });
  }
  return groups;
}

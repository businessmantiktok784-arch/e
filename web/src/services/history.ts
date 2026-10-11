import { useSyncExternalStore } from 'react';
import type { AppView, CommunityPanel } from '../navigation.js';

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

let entries: HistoryEntry[] = [];
let restored = false;
const listeners = new Set<() => void>();

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (Array.isArray(parsed)) {
      entries = parsed.filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.view === 'string' &&
          typeof entry.at === 'number',
      );
    }
  } catch {
    entries = [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable (private mode). History lasts this page only.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function keyOf(entry: Pick<HistoryEntry, 'view' | 'panel' | 'passportId' | 'siteId'>): string {
  return [entry.view, entry.panel ?? '', entry.passportId ?? '', entry.siteId ?? ''].join('|');
}

/**
 * Records a visit, newest first. An identical consecutive destination only
 * moves to the top with a fresh timestamp rather than piling up duplicates,
 * which is how a browser folds a reload of the same page into one entry.
 */
export function recordHistory(entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: number }): void {
  restore();
  const at = entry.at ?? Date.now();
  const key = keyOf(entry);
  entries = entries.filter((existing) => keyOf(existing) !== key);
  entries.unshift({ ...entry, at, id: key });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
  persist();
  emit();
}

export function getHistory(): HistoryEntry[] {
  restore();
  return entries;
}

/** Removes one visit from the list, by its stable id. */
export function removeHistory(id: string): void {
  restore();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  persist();
  emit();
}

export function clearHistory(): void {
  restore();
  entries = [];
  persist();
  emit();
}

export function useHistory(): HistoryEntry[] {
  restore();
  return useSyncExternalStore(subscribe, getHistory, getHistory);
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

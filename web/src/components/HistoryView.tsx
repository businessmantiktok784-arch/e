import React, { useMemo, useState } from 'react';
import { History as HistoryIcon, Search, Trash2, X } from 'lucide-react';
import {
  clearHistory,
  formatHistoryTime,
  groupHistoryByDay,
  removeHistory,
  useHistory,
  type HistoryEntry,
} from '../services/history.js';

interface HistoryViewProps {
  /** Reopens the exact screen a visit recorded. */
  onOpen: (entry: HistoryEntry) => void;
}

/**
 * The sidebar's History destination, laid out like a browser's:
 * day headings ("Today", "Yesterday", then full dates), newest first, each row
 * stamped with the time it was opened and clickable to reopen that screen.
 *
 * It is a private, local list - it lives in this browser only - so there is
 * nothing to load and no error state to speak of. A search box narrows the list
 * and each row can be removed on its own, in the same spirit as a browser's own
 * history controls.
 */
export const HistoryView: React.FC<HistoryViewProps> = ({ onOpen }) => {
  const entries = useHistory();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      [entry.label, entry.subtitle ?? '', entry.view]
        .some((value) => String(value ?? '').toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  const groups = groupHistoryByDay(filtered);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium text-[#1f1f1f] flex items-center gap-2">
          <HistoryIcon className="w-5 h-5 text-[#0b57d0]" aria-hidden="true" />
          History
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            className="g-btn g-btn-text h-9 text-[12px]"
            onClick={() => clearHistory()}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear all history</span>
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="relative mt-4">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your history"
            aria-label="Search your history"
            className="g-input w-full pl-9 pr-3 h-10 text-sm"
          />
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-4 py-16 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
          <p className="font-medium text-[#1f1f1f] mb-1">No history yet.</p>
          <p className="text-xs">Places you open appear here, grouped by day, newest first.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 py-16 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
          No history item matches “{query.trim()}”.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <section key={group.day}>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-[#5e5e5e] mb-1 px-1">
                {group.day}
              </h3>
              <div className="overflow-hidden rounded-xl border border-[#e3e3e3] bg-white">
                {group.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1 border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#f0f4f9]"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(entry)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[#1f1f1f]">{entry.label}</span>
                        {entry.subtitle && (
                          <span className="block truncate text-[11px] text-[#5e5e5e]">
                            {entry.subtitle}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-[#5e5e5e]">
                        {formatHistoryTime(entry.at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHistory(entry.id)}
                      title="Remove from history"
                      aria-label={`Remove ${entry.label} from history`}
                      className="g-icon-btn mr-1 h-8 w-8 shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

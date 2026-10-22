import React, { useMemo, useState } from 'react';
import { History as HistoryIcon, Search, Trash2, X, ArrowLeft } from 'lucide-react';
import {  clearHistory,  formatHistoryTime,  groupHistoryByDay,  removeHistory,  useHistory,  type HistoryEntry,} from '../services/history.js';

interface HistoryViewProps {
  onOpen: (entry: HistoryEntry) => void;
  onBackToApp: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onOpen, onBackToApp }) => {
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
    <div className="min-h-screen bg-[#f8fafd] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e3e3e3] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e3e3e3] bg-white text-[13px] font-medium text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors shadow-2xs"
              title="Return to Earth Talk application"
            >
              <ArrowLeft className="w-4 h-4 text-[#5e5e5e]" />
              <span className="hidden sm:inline">Back to map</span>
            </button>
            <div className="h-5 w-[1px] bg-[#e3e3e3] hidden sm:block" />
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={onBackToApp}
            >
              <img
                src="/icon.png"
                alt="Earth Talk Logo"
                className="w-7 h-7 rounded-md object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="leading-tight">
                <span className="font-medium text-[15px] text-[#1f1f1f] tracking-tight group-hover:text-[#0b57d0] transition-colors">
                  Earth Talk
                </span>
                <span className="hidden md:inline-block ml-2 text-[11px] text-[#5e5e5e] font-normal">
                  Browsing History
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full space-y-6">
        <div className="bg-white rounded-2xl border border-[#e3e3e3] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#e3e3e3]">
            <div>
              <div className="flex items-center gap-2 text-[#0b57d0] font-mono text-xs uppercase tracking-wider mb-1">
                <HistoryIcon className="w-4 h-4" />
                <span>Local Session Record</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-[#1f1f1f] tracking-tight">
                History
              </h1>
              <p className="mt-1 text-sm text-[#5e5e5e]">
                Places and views you have opened, grouped by day, newest first. Stored locally in your browser.
              </p>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#e3e3e3] bg-white text-xs font-medium text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors shadow-2xs shrink-0"
                onClick={() => clearHistory()}
              >
                <Trash2 className="w-3.5 h-3.5 text-[#5e5e5e]" />
                <span>Clear all history</span>
              </button>
            )}
          </div>

          {entries.length > 0 && (
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your history"
                aria-label="Search your history"
                className="w-full pl-10 pr-4 h-11 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] text-sm text-[#1f1f1f] placeholder:text-[#8f8f8f] focus:outline-none focus:border-[#0b57d0] focus:bg-white transition-colors"
              />
            </div>
          )}

          {entries.length === 0 ? (
            <div className="py-16 text-center text-[#5e5e5e] text-sm bg-[#f8fafd] rounded-xl border border-dashed border-[#c7c7c7]">
              <p className="font-medium text-[#1f1f1f] mb-1">No history yet.</p>
              <p className="text-xs">Places you open appear here, grouped by day, newest first.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[#5e5e5e] text-sm bg-[#f8fafd] rounded-xl border border-dashed border-[#c7c7c7]">
              No history item matches “{query.trim()}”.
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.day} className="space-y-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#5e5e5e] px-1">
                    {group.day}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-[#e3e3e3] bg-white divide-y divide-[#f0f0f0]">
                    {group.items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 hover:bg-[#f0f4f9] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => onOpen(entry)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[#1f1f1f]">
                              {entry.label}
                            </span>
                            {entry.subtitle && (
                              <span className="block truncate text-[11px] text-[#5e5e5e] mt-0.5">
                                {entry.subtitle}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-[#8f8f8f]">
                            {formatHistoryTime(entry.at)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHistory(entry.id)}
                          title="Remove from history"
                          aria-label={`Remove ${entry.label} from history`}
                          className="mr-3 p-1.5 rounded-lg text-[#8f8f8f] hover:text-[#1f1f1f] hover:bg-[#e3e3e3]/50 transition-colors"
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
      </main>
    </div>
  );
};

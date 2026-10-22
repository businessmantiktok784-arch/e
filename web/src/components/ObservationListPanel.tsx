import React from 'react';
import { Loader2, MapPinned } from 'lucide-react';
import type { PublicObservationSummary } from '../types/public.js';
import { formatCapitalized } from '../lib/format.js';

interface ObservationListPanelProps {
  observations: PublicObservationSummary[];
  loading: boolean;
  selectedPassportId: string | null;
  onSelect: (passportId: string) => void;
  onResetFilters: () => void;
}

/**
 * Result list for the sidebar. Mirrors the Google Maps pattern where the
 * results sit in the same column as the navigation, so the map and the list are
 * always visible together.
 */
export const ObservationListPanel: React.FC<ObservationListPanelProps> = ({
  observations,
  loading,
  selectedPassportId,
  onSelect,
  onResetFilters,
}) => {
  return (
    <section className="g-panel" aria-label="Observation results">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-medium text-[#1f1f1f]">Results</h3>
        <span className="text-[11px] text-[#5e5e5e] font-mono">
          {loading ? '…' : observations.length}
        </span>
      </div>
      <p className="text-[10px] text-[#5e5e5e] mb-2">Public Geoscience Passports matching the current filters.</p>

      {loading && observations.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-[#5e5e5e] justify-center">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Loading observations…</span>
        </div>
      ) : observations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c7c7c7] bg-[#f8fafd] px-3 py-4 text-center">
          <p className="text-[12px] font-medium text-[#1f1f1f]">No public observations match.</p>
          <p className="text-[11px] text-[#5e5e5e] mt-1">
            Clear the search term or choose All Districts.
          </p>
          <button type="button" className="g-btn g-btn-text h-8 px-2 text-[12px] mt-1" onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      ) : (
        <ul className="-mx-4">
          {observations.map((obs) => {
            const verified = obs.verification_status === 'expert_verified';
            return (
              <li key={obs.passport_id}>
                <button
                  type="button"
                  className="g-list-row"
                  aria-selected={selectedPassportId === obs.passport_id}
                  onClick={() => onSelect(obs.passport_id)}
                >
                  <span
                    className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: verified ? '#2b7f3f' : '#0b57d0' }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#1f1f1f] truncate">
                        {formatCapitalized(obs.possible_name) || 'Unidentified specimen'}
                      </span>
                      <span className="font-mono text-[10px] text-[#0b57d0] shrink-0">
                        {obs.passport_id}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5e5e5e] truncate">
                      <MapPinned className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {obs.district ? `${obs.district} District` : 'Rwanda'} ·{' '}
                      {formatCapitalized(obs.classification)} · {formatCapitalized(obs.confidence)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

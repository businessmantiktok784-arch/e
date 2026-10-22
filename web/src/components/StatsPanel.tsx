import React from 'react';
import type { PublicStats } from '../types/public.js';

interface StatsPanelProps {
  stats: PublicStats | null;
  loading: boolean;
}

const value = (loading: boolean, stats: PublicStats | null, raw: number | undefined) =>
  loading || !stats || raw === undefined || raw === null ? '—' : raw;

/**
 * Headline counts for the sidebar. Every number is read from the API; a value
 * that has not loaded, or that the server reports as unavailable, renders as an
 * em dash rather than as a plausible-looking constant.
 */
export const StatsPanel: React.FC<StatsPanelProps> = ({ stats, loading }) => {
  const items = [
    { label: 'Public observations', raw: stats?.total_observations },
    { label: 'Districts represented', raw: stats?.districts_with_observations },
    { label: 'Rock families', raw: stats?.rock_categories },
    { label: 'Expert verified', raw: stats?.verified_observations },
  ];

  return (
    <section aria-label="Platform statistics">
      <h3 className="g-section-label mb-2">At a glance</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-[#f8fafd] border border-[#e3e3e3] px-3 py-2">
            <div className="font-mono text-lg font-medium text-[#1f1f1f] leading-tight">
              {value(loading, stats, item.raw)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[#5e5e5e] leading-tight">
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-[#5e5e5e]">
        Citizen-submitted, AI-assisted geological observations across Rwanda.
      </p>
    </section>
  );
};

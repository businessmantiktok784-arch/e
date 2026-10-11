import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { FilterPanel } from './FilterPanel.js';
import type { ObservationFilters } from '../types/public.js';

interface MapFilterControlProps {
  filters: ObservationFilters;
  onChange: (filters: ObservationFilters) => void;
  onReset: () => void;
  districts: { name: string; observation_count: number }[];
  categories?: { category: string; label: string; observation_count: number }[];
}

/**
 * The filter button, rendered inside the right edge of the map's search field.
 *
 * It opens the same filters the sidebar carries, anchored under the field, so
 * nothing is added beside the search box and the sidebar panel stays available
 * for readers who prefer it there. Both views write to one filter state, so the
 * map, the result list and the sidebar can never disagree.
 */
export const MapFilterControl: React.FC<MapFilterControlProps> = ({
  filters,
  onChange,
  onReset,
  districts,
  categories = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Counts every filter a reader could have set, including the ones added after
  // the original rock-only set. A badge that undercounts makes an active filter
  // look inactive, which is how a stale result set goes unnoticed.
  const activeCount = [
    filters.district,
    filters.category,
    filters.classification,
    filters.evidence_state,
    filters.confidence,
    filters.verification,
    filters.has_investigation,
    filters.research_opportunity,
    filters.has_evidence,
    filters.search,
  ].filter((value) => value !== undefined && value !== '' && value !== false).length;

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={`g-icon-btn w-9 h-9 ${
          isOpen || activeCount > 0 ? 'text-[#0b57d0] bg-[#e8f0fe]' : ''
        }`}
        title={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'}
        aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <SlidersHorizontal className="w-[18px] h-[18px]" />
      </button>

      {activeCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0b57d0] text-white text-[10px] font-medium flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          {activeCount}
        </span>
      )}

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(340px,calc(100vw-48px))] max-h-[min(70vh,560px)] overflow-y-auto g-scroll bg-white rounded-xl border border-[#e3e3e3] shadow-[var(--g-elev-3)] p-4">
          <FilterPanel
            filters={filters}
            onChange={onChange}
            onReset={onReset}
            districts={districts}
            categories={categories}
            idPrefix="map-filter"
          />
        </div>
      )}
    </div>
  );
};
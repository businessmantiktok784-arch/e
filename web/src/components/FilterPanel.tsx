import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { ObservationFilters } from '../types/public.js';
import {
  EVIDENCE_STATES,
  EVIDENCE_STATE_RANK,
  type EvidenceState,
} from '../types/community.js';

interface FilterPanelProps {
  filters: ObservationFilters;
  onChange: (filters: ObservationFilters) => void;
  onReset: () => void;
  districts: { name: string; observation_count: number }[];
  /**
   * Observation-category counts, served by the API.
   *
   * Used for the category filter rather than a bundled list, so a category with
   * no observations yet still appears and a category this build has never heard
   * of is not silently filtered out of the UI.
   */
  categories?: { category: string; label: string; observation_count: number }[];
  /** Compact form drops the section chrome when the panel is already inside a titled block. */
  variant?: 'panel' | 'bare';
  /**
   * Namespaces the field ids. The panel is rendered twice: in the sidebar and
   * in the filter menu attached to the map's search field, and two copies of
   * the same id would break the label association.
   */
  idPrefix?: string;
}

const ROCK_TYPES = [
  { value: '', label: 'All Rock Types' },
  { value: 'igneous', label: 'Igneous (e.g. Granite, Basalt)' },
  { value: 'sedimentary', label: 'Sedimentary (e.g. Sandstone, Shale)' },
  { value: 'metamorphic', label: 'Metamorphic (e.g. Quartzite, Gneiss, Schist)' },
  { value: 'unclassified', label: 'Unclassified / Veins' },
];

/**
 * The evidence ladder, weakest reading first.
 *
 * Ordered by rank rather than alphabetically so the list reads as a progression.
 * `insufficient_evidence` and `rejected` are included because they are genuine
 * answers to "what does this record support?" - a record that cannot be read and
 * a record that was refuted are both worth filtering for, and hiding them would
 * make an empty result look like a missing filter option.
 */
/**
 * The qualifier each rung adds to the canonical label.
 *
 * Keyed as a `Record<EvidenceState, string>` so the compiler enforces that every
 * state has one: adding a state to the ladder without describing it here is a
 * compile error, not a filter that silently matches nothing.
 */
const EVIDENCE_LEVEL_QUALIFIERS: Record<EvidenceState, string> = {
  insufficient_evidence: 'Insufficient evidence (cannot tell)',
  ai_assisted: 'AI-assisted reading',
  community_supported: 'Community supported',
  community_investigated: 'Community investigated',
  expert_reviewed: 'Expert reviewed',
  scientifically_confirmed: 'Scientifically confirmed',
  unresolved: 'Unresolved (under dispute)',
  rejected: 'Rejected',
};

/** Ordered for display, so the strongest evidence is not the first option. */
const EVIDENCE_LEVEL_ORDER: readonly EvidenceState[] = [
  ...([...EVIDENCE_STATES].sort(
    (a, b) => EVIDENCE_STATE_RANK[a] - EVIDENCE_STATE_RANK[b]
  ) as EvidenceState[]),
];

const EVIDENCE_LEVELS = EVIDENCE_LEVEL_ORDER.map((state) => ({
  value: state,
  label: EVIDENCE_LEVEL_QUALIFIERS[state],
}));

const CONFIDENCE_LEVELS = [
  { value: '', label: 'All Confidence Levels' },
  { value: 'high', label: 'High (0.80 – 1.00)' },
  { value: 'moderate', label: 'Moderate (0.60 – 0.79)' },
  { value: 'low', label: 'Low (0.30 – 0.59)' },
  { value: 'insufficient', label: 'Insufficient' },
];

const VERIFICATION_STATUSES = [
  { value: '', label: 'All Records' },
  { value: 'unverified', label: 'AI-assisted / Unverified' },
  { value: 'expert_verified', label: 'Expert Verified' },
];

interface FieldOption {
  value: string;
  label: string;
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: FieldOption[];
  onChange: (value: string) => void;
}

const Field: React.FC<FieldProps> = ({ id, label, value, allLabel, options, onChange }) => (
  <div>
    <label htmlFor={id} className="g-section-label block mb-1">
      {label}
    </label>
    <select
      id={id}
      className="g-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

/** Observation filters. Rendered inside the sidebar and in the map's filter menu, never as a page toolbar. */
export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onChange,
  onReset,
  districts,
  categories = [],
  variant = 'panel',
  idPrefix = 'filter',
}) => {
  const hasActiveFilters = Boolean(
    filters.district ||
      filters.category ||
      filters.classification ||
      filters.evidence_state ||
      filters.confidence ||
      filters.verification ||
      filters.search
  );

  // The rock-type filter only means anything for rock records. Showing it for a
  // fossil would offer four options that can only ever return nothing.
  const showRockTypeFilter = !filters.category || filters.category === 'rock';

  return (
    <section aria-label="Observation filters" className={variant === 'panel' ? 'g-panel' : ''}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-[#1f1f1f]">
          <SlidersHorizontal className="w-4 h-4 text-[#5e5e5e]" aria-hidden="true" />
          Filters
        </h3>
        {hasActiveFilters && (
          <button type="button" className="g-btn g-btn-text h-8 px-2 text-[12px]" onClick={onReset}>
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        <Field
          id={`${idPrefix}-district`}
          label="District"
          value={filters.district || ''}
          allLabel="All Districts in Rwanda"
          options={districts.map((d) => ({ value: d.name, label: `${d.name} (${d.observation_count})` }))}
          onChange={(v) => onChange({ ...filters, district: v || undefined })}
        />

        {categories.length > 0 && (
          <Field
            id={`${idPrefix}-category`}
            label="What was observed"
            value={filters.category || ''}
            allLabel="All Categories"
            options={categories.map((c) => ({
              value: c.category,
              label: `${c.label} (${c.observation_count})`,
            }))}
            onChange={(v) =>
              // Changing category clears the rock type, because a rock type chosen
              // for the previous category would silently exclude every record.
              onChange({
                ...filters,
                category: v || undefined,
                subcategory: undefined,
                classification: v === 'rock' ? filters.classification : undefined,
              })
            }
          />
        )}

        {showRockTypeFilter && (
          <Field
            id={`${idPrefix}-classification`}
            label="Rock type"
            value={filters.classification || ''}
            allLabel={ROCK_TYPES[0].label}
            options={ROCK_TYPES.slice(1)}
            onChange={(v) => onChange({ ...filters, classification: v || undefined })}
          />
        )}

        <Field
          id={`${idPrefix}-evidence`}
          label="Evidence state"
          value={filters.evidence_state || ''}
          allLabel="Any Evidence State"
          options={EVIDENCE_LEVELS}
          onChange={(v) => onChange({ ...filters, evidence_state: v || undefined })}
        />

        <Field
          id={`${idPrefix}-confidence`}
          label="AI confidence"
          value={filters.confidence || ''}
          allLabel={CONFIDENCE_LEVELS[0].label}
          options={CONFIDENCE_LEVELS.slice(1)}
          onChange={(v) => onChange({ ...filters, confidence: v || undefined })}
        />

        <Field
          id={`${idPrefix}-verification`}
          label="Verification state"
          value={filters.verification || ''}
          allLabel={VERIFICATION_STATUSES[0].label}
          options={VERIFICATION_STATUSES.slice(1)}
          onChange={(v) => onChange({ ...filters, verification: v || undefined })}
        />
      </div>

      <p className="mt-3 text-[10px] leading-snug text-[#5e5e5e]">
        <strong className="font-medium text-[#1f1f1f]">Scientific note:</strong> confidence is visual AI
        certainty from a photograph, not laboratory analysis. Evidence state records how far a
        reading has been checked - only a laboratory or a published reference reaches
        &quot;scientifically confirmed&quot;.
      </p>
    </section>
  );
};

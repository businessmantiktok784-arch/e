import React from 'react';
import { Layers } from 'lucide-react';
import { SITE_STATE_COLORS, CATEGORY_COLORS } from './MapView.js';
import {
  EVIDENCE_STATES,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
} from '../types/community.js';
import type { PublicCategoryCount } from '../types/public.js';

interface RockTypeKeyProps {
  /** Served by the API, including categories that currently hold nothing. */
  categories: PublicCategoryCount[];
}

/**
 * The category key: the lines that decode a marker on the observation layer. It
 * sits directly under the logo in the left sidebar, above the navigation, because
 * a reader needs to know what the colours mean before choosing a destination. It
 * is kept off the map surface so the search field is the only thing floating over
 * the canvas.
 */
export const RockTypeKey: React.FC<RockTypeKeyProps> = ({ categories }) => {
  // Which categories are listed depends on what the deployment actually holds.
  // A key that advertised fourteen categories while the map showed three would
  // teach the reader to distrust it, so absent categories are omitted rather
  // than shown as available.
  const present = categories.filter((c) => c.observation_count > 0);
  const shown = present.length > 0 ? present : categories;

  return (
    <div className="space-y-1 text-[11px] text-[#5e5e5e]">
      {shown.map((entry) => (
        <div key={entry.category} className="flex items-center gap-2">
          <svg
            className="shrink-0"
            width="12"
            height="15"
            viewBox="0 0 42 52"
            aria-hidden="true"
            style={{ display: 'block' }}
          >
            <path
              d="M21 2C10.5 2 2 10.1 2 20.6 2 35.9 21 49.6 21 49.6S40 35.9 40 20.6C40 10.1 31.5 2 21 2z"
              fill={CATEGORY_COLORS[entry.category] ?? '#78716c'}
              stroke="#ffffff"
              strokeWidth="4"
            />
          </svg>
          <span>
            {entry.label}
            {entry.observation_count > 0 ? ` (${entry.observation_count})` : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * The cluster entry, which decodes the aggregate markers rather than a rock
 * type. It follows the rock-type key in the same block under the logo.
 */
export const ClusterKey: React.FC = () => (
  <div className="flex items-center gap-2 text-[11px] text-[#5e5e5e]">
    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 border border-white inline-block shrink-0" />
    <span>Cluster (zoom to expand)</span>
  </div>
);

interface SiteEvidenceKeyProps {
  /** The site layer is drawn only when this is true, so the key follows it. */
  showSites: boolean;
}

/**
 * The site evidence ladder. It is kept beside the map controls it explains:
 * geological sites are coloured by evidence strength, and the key is explicit
 * that a stronger colour is not a better rock, only more evidence behind it.
 */
export const SiteEvidenceKey: React.FC<SiteEvidenceKeyProps> = ({ showSites }) => {
  if (!showSites) return null;

  return (
    <div className="g-panel">
      <h3 className="g-panel-title">
        <Layers className="w-3.5 h-3.5 text-[#5e5e5e]" aria-hidden="true" />
        <span>Site evidence</span>
      </h3>

      <div className="space-y-1 text-[11px] text-[#5e5e5e]">
        {/* Every canonical state is listed, generated from the same array the
            map expression uses. The previous hand-written key omitted
            `insufficient_evidence` and `rejected`, so a site in either state was
            drawn in a colour the legend never explained. */}
        {EVIDENCE_STATES.map((state) => (
          <div key={state} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block ring-1 ring-white shrink-0"
              style={{ backgroundColor: SITE_STATE_COLORS[state] }}
            />
            <span>{EVIDENCE_STATE_LABELS[state]}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block ring-1 ring-white shrink-0"
            style={{ backgroundColor: NO_EVIDENCE_HEX }}
          />
          <span>Nothing established</span>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-[#5e5e5e] leading-tight">
        A stronger colour means more evidence, not a better answer. Community agreement is not scientific
        confirmation.
      </p>
    </div>
  );
};
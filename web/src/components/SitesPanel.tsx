import React from 'react';
import { MapPinned } from 'lucide-react';
import {
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  type EvidenceState,
  type PublicSiteGeoJson,
} from '../types/community.js';

interface SitesPanelProps {
  sites: PublicSiteGeoJson | null;
  selectedSiteId: string | null;
  onSelect: (siteId: string) => void;
  onShowOnMap: (siteId: string) => void;
}

/**
 * Published geological sites, listed in the sidebar.
 *
 * A site that has no authorised public coordinate is never listed here and is
 * never drawn on the map: it would have to be placed at a guessed position. The
 * absence is deliberate, not a loading failure.
 */
export const SitesPanel: React.FC<SitesPanelProps> = ({
  sites,
  selectedSiteId,
  onSelect,
  onShowOnMap,
}) => {
  const features = sites?.features ?? [];

  return (
    <section className="g-panel" aria-label="Geological sites">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-medium text-[#1f1f1f]">Published sites</h3>
        <span className="text-[11px] text-[#5e5e5e] font-mono">{features.length}</span>
      </div>
      <p className="text-[10px] text-[#5e5e5e] mb-2">
        Colour shows evidence strength, not rock quality. Community agreement is not scientific confirmation.
      </p>

      {features.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c7c7c7] bg-[#f8fafd] px-3 py-4 text-center text-[11px] text-[#5e5e5e]">
          No site has a public coordinate yet.
        </div>
      ) : (
        <ul className="-mx-4">
          {features.map((feature) => {
            const p = feature.properties;
            const state: EvidenceState | null = p.highest_evidence_state;
            return (
              <li key={p.site_id}>
                <div
                  className="g-list-row"
                  aria-selected={selectedSiteId === p.site_id}
                  role="group"
                >
                  <button
                    type="button"
                    className="flex items-start gap-2 min-w-0 flex-1 text-left"
                    onClick={() => onSelect(p.site_id)}
                  >
                    <span
                      className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white"
                      style={{ background: state ? EVIDENCE_STATE_HEX[state] : NO_EVIDENCE_HEX }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[#1f1f1f] truncate">
                        {p.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#5e5e5e] truncate">
                        <span className="font-mono">{p.site_code}</span> ·{' '}
                        {p.district ? `${p.district} District` : 'Rwanda'} ·{' '}
                        {p.location_precision.replace('_', ' ')}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="g-chip">
                          {state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established'}
                        </span>
                        <span className="g-chip">
                          <MapPinned className="w-3 h-3" aria-hidden="true" />
                          {p.observation_count} obs
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="g-btn g-btn-text h-8 px-2 text-[11px] shrink-0"
                    onClick={() => onShowOnMap(p.site_id)}
                  >
                    Map
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

import React from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import type { AppView } from '../navigation.js';

interface ViewNote {
  title: string;
  bullets: string[];
}

const VIEW_NOTES: Partial<Record<AppView, ViewNote>> = {
  sites: {
    title: 'Grouping and evidence',
    bullets: [
      'Every site states its grouping basis: admin curated, observation cluster, or community suggested.',
      'Observations are never silently clustered by a distance threshold.',
      'The evidence ladder is enforced server-side: community activity alone can never reach expert reviewed or scientifically confirmed.',
    ],
  },
  community: {
    title: 'Community discovery',
    bullets: [
      'Investigations, votes, evidence, questions, answers and visits.',
      'Participation only. There are no user accounts, and raw phone numbers are never stored.',
      'Reputation reflects participation only, never authority over a scientific claim.',
    ],
  },
  research: {
    title: 'Research analytics',
    bullets: [
      'Dataset summaries, dataset versions, CSV and GeoJSON exports.',
      'Every export and every authoritative verification writes a compliance audit record.',
      'Operational metrics that are not instrumented are reported as unavailable, never as plausible constants.',
    ],
  },
  validation: {
    title: 'Field validation',
    bullets: [
      'Labelled datasets, sample management, dataset locking and reference labels.',
      'Runs are scored against expert reference labels only.',
      'Predictions call the real Gemini model. When image bytes cannot be retrieved the run fails honestly rather than returning a simulated result.',
    ],
  },
  reviews: {
    title: 'Expert verification',
    bullets: [
      'Super Admin only. There is no expert account system and no passwordless path.',
      'Every review names its reviewer as an attribute of the review itself.',
      'Community agreement never counts as expert verification.',
    ],
  },
  'how-it-works': {
    title: 'The pipeline',
    bullets: [
      'A WhatsApp photo is downloaded over an authenticated connection and validated before analysis.',
      'Gemini returns a structured interpretation against a strict runtime schema.',
      'The record is persisted and a Geoscience Passport is returned to the sender.',
    ],
  },
  about: {
    title: 'Data honesty',
    bullets: [
      'No fabricated observations, users, experts, votes, visits, locations or metrics.',
      'Production repositories hold no seed data; they return empty results or an explicit unavailable.',
      'An unconfigured database yields an honest empty read, never a fake success.',
    ],
  },
};

interface ViewInfoPanelProps {
  view: AppView;
  isAuthenticated: boolean;
  onOpenExpertPortal: () => void;
}

/** Context panel for the sidebar: what the open view means and what it cannot claim. */
export const ViewInfoPanel: React.FC<ViewInfoPanelProps> = ({
  view,
  isAuthenticated,
  onOpenExpertPortal,
}) => {
  const note = VIEW_NOTES[view];
  const gated = (view === 'reviews' || view === 'validation') && !isAuthenticated;

  if (!note) return null;

  return (
    <section className="g-panel" aria-label="About this view">
      <h3 className="text-[13px] font-medium text-[#1f1f1f]">{note.title}</h3>
      <ul className="mt-2 space-y-2">
        {note.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-[11px] leading-snug text-[#5e5e5e]">
            <span className="mt-[6px] w-1 h-1 rounded-full bg-[#0b57d0] shrink-0" aria-hidden="true" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {gated && (
        <div className="mt-3 rounded-lg bg-[#fef7e0] border border-[#ffdf99] p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#9f6108]">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Super Admin session required</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[#5e5e5e]">
            This view calls an authenticated route. Sign in to open it; nothing is faked without a session.
          </p>
          <button type="button" className="g-btn g-btn-tonal h-8 px-3 text-[12px] mt-2" onClick={onOpenExpertPortal}>
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign in</span>
          </button>
        </div>
      )}
    </section>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { fetchMyReputation } from '../services/communityApi.js';
import type { PublicReputationSummary } from '../types/community.js';

interface ReputationPanelProps {
  /** The reader's public name, shown above the tally when there is one. */
  displayName?: string | null;
}

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="g-card p-3">
    <div className="text-[20px] font-semibold text-[#1f1f1f]">{value}</div>
    <div className="text-[11px] text-[#5e5e5e]">{label}</div>
  </div>
);

/**
 * Participation-only reputation, formerly reached through the sidebar's
 * "My contributions" item. It now sits inside My Earth Talk, so everything a
 * contributor owns - posts and their contribution record - is on one screen.
 *
 * The record is recognised through a random token stored in this browser only.
 * Clearing site data starts an empty record; there is no account to recover.
 */
export const ReputationPanel: React.FC<ReputationPanelProps> = ({ displayName }) => {
  const [reputation, setReputation] = useState<PublicReputationSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setReputation(await fetchMyReputation());
      setFailed(false);
    } catch {
      // Reputation is supplementary; its absence must not break the page.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed || !reputation) {
    return (
      <div className="rounded-xl border border-dashed border-[#c7c7c7] bg-white/40 p-6 text-center">
        <p className="text-[13px] font-medium text-[#3c4043]">
          No contribution record for this browser yet.
        </p>
        <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-[#8f8f8f]">
          Participation is recognised through a random token stored in this browser only. Asking a
          question, answering one or voting starts your record. There is no account to recover.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-[#9f6108]" aria-hidden="true" />
        <h3 className="text-[13px] font-medium text-[#1f1f1f]">
          {displayName || reputation.public_handle}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Observations" value={reputation.observations_count} />
        <Stat label="Evidence" value={reputation.evidence_count} />
        <Stat label="Votes" value={reputation.votes_count} />
        <Stat label="Investigations" value={reputation.investigations_count} />
        <Stat label="Questions" value={reputation.questions_count} />
        <Stat label="Answers" value={reputation.answers_count} />
        <Stat label="Visits" value={reputation.visits_count} />
        <Stat label="Districts" value={reputation.districts_represented} />
      </div>

      <p className="text-[11px] leading-relaxed text-[#5e5e5e]">{reputation.disclaimer}</p>

      {reputation.achievements.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[12px] font-semibold text-[#1f1f1f]">Achievements</h4>
          {reputation.achievements.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e3e3] bg-[#f0f4f9] p-3"
            >
              <div>
                <div className="text-[13px] text-[#1f1f1f]">{a.label}</div>
                <div className="text-[11px] text-[#8f8f8f]">{a.description}</div>
              </div>
              {a.earned && (
                <span className="rounded-md border border-[#2b7f3f]/40 bg-[#c4eed0] px-2 py-0.5 text-[11px] text-[#2b7f3f]">
                  Earned
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

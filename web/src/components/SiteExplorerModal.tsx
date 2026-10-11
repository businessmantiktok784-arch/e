import React, { useEffect, useState } from 'react';
import {
  X,
  Bot,
  Users,
  GraduationCap,
  MapPin,
  AlertTriangle,
  Clock,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import {
  fetchSiteExplorer,
  recordVisit,
} from '../services/communityApi.js';
import { fetchResearchOpportunities } from '../services/publicApi.js';
import {
  EVIDENCE_STATE_COLORS,
  EVIDENCE_STATE_EXPLANATIONS,
  EVIDENCE_STATE_LABELS,
  categoryLabel,
  type SiteExplorerPayload,
  type EvidenceState,
} from '../types/community.js';
import type { ResearchOpportunity } from '../types/intelligence.js';

interface SiteExplorerModalProps {
  siteId: string | null;
  onClose: () => void;
}

/**
 * Site Explorer.
 *
 * The single most important rule in this component: the AI interpretation, the
 * community record and the expert review are rendered as three visually and
 * structurally separate blocks. They are never merged into one "answer", never
 * ranked against each other, and each carries its own explanation of what it
 * does and does not establish.
 */
export const SiteExplorerModal: React.FC<SiteExplorerModalProps> = ({ siteId, onClose }) => {
  const [payload, setPayload] = useState<SiteExplorerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitNote, setVisitNote] = useState('');
  const [visitStatus, setVisitStatus] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ResearchOpportunity[]>([]);

  useEffect(() => {
    if (!siteId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSiteExplorer(siteId)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        // Stage 11 — research opportunities bound to this site, derived only from
        // real flagged records. A failed or empty fetch shows the opportunity
        // section's honest empty state rather than blocking the explorer.
        return fetchResearchOpportunities(
          data.site.site_code ? { site: data.site.site_code } : {}
        )
          .then((res) => {
            if (!cancelled) setOpportunities(res.items);
          })
          .catch(() => {
            if (!cancelled) setOpportunities([]);
          });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load this site.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!siteId) return null;

  const handleRecordVisit = async () => {
    if (!payload) return;
    setVisitStatus(null);
    try {
      await recordVisit({ siteId, notes: visitNote.trim() || undefined });
      setVisitNote('');
      setVisitStatus('Visit recorded. Thank you.');
    } catch (err: unknown) {
      setVisitStatus(
        err instanceof Error ? err.message : 'The visit could not be recorded. Nothing was saved.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white border border-[#c7c7c7] rounded-xl shadow-2xl text-[#1f1f1f]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5 border-b border-[#e3e3e3] bg-white/95 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold text-[#1f1f1f]">{payload?.site.title ?? 'Loading site…'}</h2>
            {payload && (
              <p className="text-xs text-[#5e5e5e] mt-0.5">
                {payload.site.site_code}
                {payload.site.district ? ` · ${payload.site.district}` : ''}
                {payload.site.sector ? ` · ${payload.site.sector}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#eef1f6] transition-colors"
            aria-label="Close site explorer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-[#5e5e5e] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading site…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#ffdad8] border border-rose-500/30 text-[#d32f28] text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#d32f28]" />
              <span>{error}</span>
            </div>
          )}

          {payload && !loading && (
            <>
              {/* Site description */}
              {payload.site.description && (
                <p className="text-sm text-[#3c4043] leading-relaxed">{payload.site.description}</p>
              )}

              {/* Why this grouping exists */}
              <div className="p-3 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3] text-xs text-[#5e5e5e]">
                <span className="font-semibold text-[#3c4043]">How this site was formed: </span>
                {payload.site.grouping_basis === 'admin_curated'
                  ? 'Grouped by the platform owner.'
                  : payload.site.grouping_basis === 'observation_cluster'
                    ? 'Grouped from observations recorded at this location.'
                    : 'Suggested by the community and not yet verified by an administrator.'}
              </div>

              {/* ============================================================ */}
              {/* BLOCK 1 — AI INTERPRETATION                                */}
              {/* ============================================================ */}
              <section className="rounded-xl border border-[#c7c7c7] bg-white overflow-hidden">
                <header className="flex items-center gap-2 px-4 py-3 bg-[#eef1f6] border-b border-[#c7c7c7]">
                  <Bot className="w-4 h-4 text-[#3c4043]" />
                  <h3 className="text-sm font-semibold text-[#1f1f1f]">AI interpretation</h3>
                  <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e3e3e3] text-[#3c4043] border border-[#c7c7c7]">
                    Automated
                  </span>
                </header>

                <div className="p-4 space-y-3">
                  {payload.ai_interpretation ? (
                    <>
                      <p className="text-[11px] text-[#5e5e5e] italic">
                        {EVIDENCE_STATE_EXPLANATIONS.ai_assisted}
                      </p>

                      <div>
                        <div className="text-xs text-[#5e5e5e]">Reading</div>
                        <div className="text-base font-semibold text-[#1f1f1f] capitalize">
                          {payload.ai_interpretation.primary_classification}
                          {payload.ai_interpretation.possible_name
                            ? ` — ${payload.ai_interpretation.possible_name}`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-[#5e5e5e]">
                        <span className="px-2 py-0.5 rounded-md bg-[#eef1f6] border border-[#c7c7c7]">
                          Confidence: {payload.ai_interpretation.confidence}
                        </span>
                        {payload.ai_interpretation.observed_features.length > 0 && (
                          <span>Observed: {payload.ai_interpretation.observed_features.join(', ')}</span>
                        )}
                      </div>

                      {payload.ai_interpretation.reasoning && (
                        <p className="text-sm text-[#3c4043] leading-relaxed">
                          {payload.ai_interpretation.reasoning}
                        </p>
                      )}

                      {payload.ai_interpretation.alternative_possibilities.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-[#5e5e5e] mb-1">
                            Other possibilities it could be
                          </div>
                          <ul className="list-disc list-inside text-sm text-[#3c4043] space-y-0.5">
                            {payload.ai_interpretation.alternative_possibilities.map((alt, i) => (
                              <li key={i}>{alt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {payload.ai_interpretation.limitations.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-[#5e5e5e] mb-1">Limitations</div>
                          <ul className="list-disc list-inside text-sm text-[#5e5e5e] space-y-0.5">
                            {payload.ai_interpretation.limitations.map((lim, i) => (
                              <li key={i}>{lim}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p className="text-[11px] text-[#8f8f8f] pt-1">
                        Model: {payload.ai_interpretation.ai_model}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[#5e5e5e]">
                      No AI interpretation is available for this site. Nothing is being shown because no
                      interpretation has been produced.
                    </p>
                  )}
                </div>
              </section>

              {/* ============================================================ */}
              {/* BLOCK 2 — COMMUNITY RECORD                                 */}
              {/* ============================================================ */}
              <section className="rounded-xl border border-sky-500/25 bg-[#f4f8fe] overflow-hidden">
                <header className="flex items-center gap-2 px-4 py-3 bg-[#e8f0fe] border-b border-sky-500/20">
                  <Users className="w-4 h-4 text-[#0b57d0]" />
                  <h3 className="text-sm font-semibold text-[#0b57d0]">Community record</h3>
                  <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#d3e3fd] text-[#0b57d0] border border-sky-500/30">
                    What people reported
                  </span>
                </header>

                <div className="p-4 space-y-4">
                  <p className="text-[11px] text-[#0b57d0]/70 italic">
                    {EVIDENCE_STATE_EXPLANATIONS.community_investigated}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="Investigations" value={payload.community.investigation_count} />
                    <Stat label="Questions" value={payload.community.question_count} />
                    <Stat label="Evidence items" value={payload.community.evidence_count} />
                    <Stat label="Visits" value={payload.community.visit_count} />
                  </div>

                  {payload.community.investigation_count === 0 &&
                  payload.community.evidence_count === 0 ? (
                    <p className="text-sm text-[#5e5e5e]">
                      The community has not investigated this site yet. This means no one has contributed, not
                      that the site has been checked and cleared.
                    </p>
                  ) : (
                    <p className="text-sm text-[#3c4043]">
                      This is what contributors reported. It is not expert verification and not a scientific
                      determination.
                    </p>
                  )}
                </div>
              </section>

              {/* ============================================================ */}
              {/* BLOCK 3 — EXPERT REVIEW                                    */}
              {/* ============================================================ */}
              <section className="rounded-xl border border-amber-500/25 bg-[#fef7e0] overflow-hidden">
                <header className="flex items-center gap-2 px-4 py-3 bg-[#fef7e0] border-b border-amber-500/20">
                  <GraduationCap className="w-4 h-4 text-[#9f6108]" />
                  <h3 className="text-sm font-semibold text-[#9f6108]">Expert review</h3>
                  <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#fef7e0] text-[#9f6108] border border-amber-500/30">
                    Human determination
                  </span>
                </header>

                <div className="p-4 space-y-3">
                  {payload.expert_review ? (
                    <>
                      <p className="text-[11px] text-[#9f6108]/70 italic">
                        {payload.expert_review.evidence_basis
                          ? 'Reviewed against the basis shown below.'
                          : EVIDENCE_STATE_EXPLANATIONS.expert_reviewed}
                      </p>

                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[#5e5e5e]">Reviewed by</span>
                        <span className="text-[#1f1f1f] font-medium">
                          {payload.expert_review.reviewer_label}
                        </span>
                      </div>

                      {!payload.expert_review.identity_published && (
                        <p className="text-[11px] text-[#5e5e5e]">
                          The reviewer's identity has not been published, so only the fact that a review exists is
                          shown.
                        </p>
                      )}

                      {payload.expert_review.expert_rock_name && (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[#5e5e5e]">Expert reading</span>
                          <span className="text-[#1f1f1f] font-medium">
                            {payload.expert_review.expert_rock_name}
                          </span>
                        </div>
                      )}

                      {payload.expert_review.expert_classification && (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[#5e5e5e]">Classification</span>
                          <span className="text-[#1f1f1f] font-medium capitalize">
                            {payload.expert_review.expert_classification}
                          </span>
                        </div>
                      )}

                      {payload.expert_review.evidence_basis && (
                        <div>
                          <div className="text-xs font-semibold text-[#5e5e5e] mb-1">
                            Basis for the determination
                          </div>
                          <p className="text-sm text-[#3c4043]">{payload.expert_review.evidence_basis}</p>
                        </div>
                      )}

                      {payload.expert_review.scientific_remarks && (
                        <div>
                          <div className="text-xs font-semibold text-[#5e5e5e] mb-1">Scientific remarks</div>
                          <p className="text-sm text-[#3c4043]">{payload.expert_review.scientific_remarks}</p>
                        </div>
                      )}

                      {payload.expert_review.review_date && (
                        <p className="text-[11px] text-[#8f8f8f]">Reviewed: {payload.expert_review.review_date}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[#3c4043]">
                      <span className="text-[#5e5e5e]">No expert has reviewed this site.</span>{' '}
                      Nothing here has been checked by a human expert.
                    </p>
                  )}
                </div>
              </section>

              {/* Separation statement */}
              <div className="p-4 rounded-xl bg-[#f8fafd] border border-[#e3e3e3] text-xs text-[#3c4043] leading-relaxed">
                <span className="font-semibold text-[#1f1f1f]">These three are different kinds of statement.</span>{' '}
                An automated reading, a report from a member of the public, and a human expert determination do not
                carry the same weight. Community agreement is not scientific confirmation. Where they disagree, this
                site is shown as unresolved rather than resolved.
              </div>

              {/* Observations list */}
              {payload.observations.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-[#1f1f1f] mb-2">
                    Observations at this site ({payload.observations.length})
                  </h3>
                  <div className="space-y-2">
                    {payload.observations.map((obs) => (
                      <div
                        key={obs.passport_id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3]"
                      >
                        <div className="min-w-0">
                          {/* Category first: a site holding a fossil, a cave and a
                              rock shows three of the same thing if the legacy
                              classification leads. It is only shown when it adds
                              something, since "Rock / Igneous" is redundant. */}
                          <div className="text-sm font-medium text-[#1f1f1f]">
                            {categoryLabel(obs.observation_category)}
                            {obs.possible_name ? ` — ${obs.possible_name}` : ''}
                          </div>
                          {obs.observation_category !== 'rock' && obs.classification && (
                            <div className="text-xs text-[#5e5e5e] capitalize">
                              Legacy rock classification: {obs.classification}
                            </div>
                          )}
                          <div className="text-xs text-[#8f8f8f] font-mono truncate">{obs.passport_id}</div>
                        </div>
                        <EvidenceBadge state={obs.evidence_state} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Timeline */}
              {payload.timeline.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-[#1f1f1f] mb-2">Activity</h3>
                  <div className="space-y-1.5">
                    {payload.timeline.slice(0, 25).map((entry, i) => (
                      <div key={`${entry.ref_id}-${i}`} className="flex items-start gap-3 text-sm">
                        <Clock className="w-3.5 h-3.5 mt-0.5 text-[#8f8f8f] shrink-0" />
                        <span className="text-[#5e5e5e] text-xs whitespace-nowrap">
                          {new Date(entry.event_at).toLocaleDateString()}
                        </span>
                        <span className="text-[#3c4043]">{entry.summary}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Nearby observations */}
              {payload.nearby.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-[#1f1f1f] mb-2">Nearby observations</h3>
                  <p className="text-xs text-[#8f8f8f] mb-2">
                    Proximity only. Being close together does not mean two observations belong to the same site.
                  </p>
                  <div className="space-y-2">
                    {payload.nearby.slice(0, 8).map((obs) => (
                      <div
                        key={obs.passport_id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#f0f4f9] border border-[#e3e3e3]"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-[#1f1f1f]">{categoryLabel(obs.observation_category)}</div>
                          <div className="text-xs text-[#8f8f8f] font-mono truncate">{obs.passport_id}</div>
                        </div>
                        <span className="text-xs text-[#5e5e5e] whitespace-nowrap">
                          {obs.distance_km} km away
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Research opportunities (Stage 11).
                  Community-generated open questions only. Never presented as a
                  scientific finding; each item carries its mandatory disclaimer. */}
              <section className="rounded-xl border border-violet-500/25 bg-[#f7f5ff] overflow-hidden">
                <header className="flex items-center gap-2 px-4 py-3 bg-[#eef0ff] border-b border-violet-500/20">
                  <FlaskConical className="w-4 h-4 text-[#5b21b6]" />
                  <h3 className="text-sm font-semibold text-[#4c1d95]">Research opportunities</h3>
                  <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e4e4ff] text-[#5b21b6] border border-violet-500/30">
                    Open questions
                  </span>
                </header>

                <div className="p-4 space-y-3">
                  {opportunities.length === 0 ? (
                    <p className="text-sm text-[#5e5e5e]">
                      No research opportunities have been raised for this site yet. Nothing is shown because no one
                      has flagged anything — not because the geology has been cleared.
                    </p>
                  ) : (
                    opportunities.slice(0, 5).map((opportunity) => (
                      <div
                        key={opportunity.opportunity_id}
                        className="p-3 rounded-lg bg-white border border-violet-500/15"
                      >
                        <p className="text-sm text-[#1f1f1f] font-medium">{opportunity.question}</p>
                        {opportunity.summary && (
                          <p className="text-xs text-[#5e5e5e] mt-1">{opportunity.summary}</p>
                        )}
                        <p className="text-[11px] text-[#5e5e5e] mt-2 leading-snug">
                          {opportunity.disclaimer}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Record a visit */}
              <section className="p-4 rounded-xl bg-[#f0f4f9] border border-[#e3e3e3]">
                <h3 className="text-sm font-semibold text-[#1f1f1f] mb-1 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#2b7f3f]" />
                  Record a visit
                </h3>
                <p className="text-xs text-[#8f8f8f] mb-3">
                  Your phone number is never stored. You appear only as a handle such as
                  &quot;Field Explorer #A82F&quot;.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={visitNote}
                    onChange={(e) => setVisitNote(e.target.value)}
                    placeholder="What did you see? (optional)"
                    maxLength={2000}
                    className="flex-1 px-3 py-2 rounded-lg bg-white border border-[#c7c7c7] text-[#1f1f1f] text-sm placeholder-[#8f8f8f] focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                  />
                  <button
                    onClick={handleRecordVisit}
                    className="px-4 py-2 rounded-lg bg-[#2b7f3f] hover:bg-[#2b7f3f] text-white text-sm font-medium transition-colors"
                  >
                    Record visit
                  </button>
                </div>
                {visitStatus && <p className="text-xs text-[#5e5e5e] mt-2">{visitStatus}</p>}
              </section>

              {/* Empty-state honesty */}
              {payload.observations.length === 0 && (
                <div className="p-4 rounded-xl bg-[#fef7e0] border border-amber-500/30 text-[#9f6108] text-sm">
                  This site has no observations recorded against it. The site entry exists, but there is nothing
                  behind it yet.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="p-2.5 rounded-lg bg-[#f0f4f9] border border-[#e3e3e3]">
    <div className="text-lg font-semibold text-[#1f1f1f]">{value}</div>
    <div className="text-[11px] text-[#5e5e5e]">{label}</div>
  </div>
);

/**
 * Evidence badge. The `title` carries the plain-language explanation so the
 * meaning is available on hover without adding clutter to the list.
 */
export const EvidenceBadge: React.FC<{ state: EvidenceState }> = ({ state }) => (
  <span
    title={EVIDENCE_STATE_EXPLANATIONS[state]}
    className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium border ${EVIDENCE_STATE_COLORS[state]}`}
  >
    {EVIDENCE_STATE_LABELS[state]}
  </span>
);

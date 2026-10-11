import React, { useEffect, useState } from 'react';
import type { PublicObservationDetail } from '../types/public.js';
import {
  X,
  MapPin,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Microscope,
  BrainCircuit,
  Lightbulb,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  EVIDENCE_STATE_EXPLANATIONS,
  type EvidenceState,
} from '../types/community.js';
import {
  fetchObservationIntelligence,
  fetchNearbyObservations,
  fetchSimilarObservations,
} from '../services/publicApi.js';
import type {
  EvidenceSource,
  GeoscienceIntelligenceResult,
  RelatedObservationsResponse,
} from '../types/intelligence.js';

interface GeosciencePassportModalProps {
  observation: PublicObservationDetail | null;
  loading: boolean;
  onClose: () => void;
  onOpenWhatsApp: () => void;
}

function formatCapitalized(text?: string | null): string {
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Plain language per evidence source, mirrored from the server's `EvidenceSource`.
 *
 * These are presentation labels only and do not carry ranking. The client never
 * reorders sources into one reliability scale: it renders the source label with
 * each claim so a user report stays visibly different from an expert review.
 */
const SOURCE_LABELS: Record<EvidenceSource, string> = {
  observed: 'Seen in the media',
  user_reported: 'Reported by the person who sent it',
  ai_inferred: 'Reasoned by the AI',
  community_suggested: 'Suggested by the community',
  expert_reviewed: 'Placed by an expert review',
  scientific_confirmation: 'Scientific confirmation',
  nearby_observation: 'Nearby public observation',
  geological_context: 'Geological dataset',
};

/**
 * A mark per category, so the header shows what the record is at a glance.
 *
 * The rock is kept for the historical records; everything else gets a glyph that
 * does not pretend to be a rock. Emoji are a decoration, not a claim.
 */
const CATEGORY_ICONS: Record<string, string> = {
  rock: '🪨',
  mineral: '💎',
  fossil: '🦴',
  geological_structure: '🪨',
  geological_layer: '📚',
  geomorphology: '⛰️',
  volcanic_feature: '🌋',
  hydrogeological_feature: '💧',
  mining_observation: '⛏️',
  engineering_geology: '🏗️',
  other_geoscience: '🌍',
  unknown: '❓',
  insufficient_image: '❓',
  non_geoscience: '❓',
};

export const GeosciencePassportModal: React.FC<GeosciencePassportModalProps> = ({
  observation,
  loading,
  onClose,
  onOpenWhatsApp,
}) => {
  const [intelligence, setIntelligence] = useState<GeoscienceIntelligenceResult | null>(null);
  const [nearby, setNearby] = useState<RelatedObservationsResponse | null>(null);
  const [similar, setSimilar] = useState<RelatedObservationsResponse | null>(null);
  const [intelReady, setIntelReady] = useState(false);

  useEffect(() => {
    const passportId = observation?.passport_id;
    if (!passportId) return;

    let cancelled = false;
    setIntelReady(false);
    setIntelligence(null);
    setNearby(null);
    setSimilar(null);

    Promise.all([
      fetchObservationIntelligence(passportId),
      fetchNearbyObservations(passportId),
      fetchSimilarObservations(passportId),
    ])
      .then(([intel, near, sim]) => {
        if (cancelled) return;
        // A failed subset silently resolves to null rather than blanking the
        // whole presentation; the record's own passport content stays intact.
        setIntelligence(intel);
        setNearby(near);
        setSimilar(sim);
      })
      .catch(() => {
        if (!cancelled) {
          setIntelligence(null);
          setNearby(null);
          setSimilar(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIntelReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [observation?.passport_id]);

  if (!observation && !loading) return null;

  const photoCount = observation?.public_media_count ?? observation?.media_count ?? 0;
  const evidenceState = observation?.evidence_state as EvidenceState | null | undefined;
  const title =
    observation?.post_title ||
    observation?.primary_interpretation ||
    formatCapitalized(observation?.possible_name) ||
    'Geoscience Passport';
  const hero = observation?.primary_media_url;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passport-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#202124]/50 backdrop-blur-[2px] sm:items-center sm:p-6"
    >
      <div className="relative flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[var(--g-elev-3)] sm:h-auto sm:max-h-[88vh] sm:rounded-2xl">
        {/* Top bar: always visible, so the record id and the close action stay
            reachable no matter how far the body has scrolled. */}
        <div className="flex items-center gap-2 border-b border-[#e3e3e3] bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Geoscience Passport"
            className="g-icon-btn h-10 w-10 shrink-0 text-[#5e5e5e]"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="g-section-label truncate">Public Observation Record</div>
            <div className="truncate font-mono text-sm font-semibold text-[#1f1f1f]">
              {observation?.passport_id}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {observation && observation.verification_status === 'expert_verified' && (
              <span className="g-chip bg-[#c4eed0] text-[#1b4d2b]">✓ Expert verified</span>
            )}
            {observation?.is_research_opportunity && (
              <span className="g-chip bg-[#e8f3ff] text-[#0842a0]">
                <Microscope className="h-3.5 w-3.5" aria-hidden="true" />
                Research
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-[#5e5e5e]">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c7c7c7] border-t-[#0b57d0]" />
            <p className="text-sm">Loading Geoscience Passport data…</p>
          </div>
        ) : observation ? (
          <>
            {/* Hero media. A live photograph leads, as on a place profile; the
                category chip keeps the record identifiable at a glance and the
                photo count is decoration, never a claim. */}
            {hero ? (
              <div className="relative shrink-0">
                <img
                  src={hero}
                  alt=""
                  className="h-52 w-full object-cover sm:h-64"
                  loading="lazy"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent"
                  aria-hidden="true"
                />
                {photoCount > 0 && (
                  <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                    {photoCount} photo{photoCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white">
                  <span aria-hidden="true">
                    {CATEGORY_ICONS[observation.observation_category] ?? '❓'}
                  </span>
                  {formatCapitalized(observation.observation_category)}
                </span>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-[#d3e3fd] to-[#eef1f6] px-5 py-6">
                <span className="text-3xl" aria-hidden="true">
                  {CATEGORY_ICONS[observation.observation_category] ?? '❓'}
                </span>
                <div className="min-w-0">
                  <div className="g-section-label">No public photo</div>
                  <div className="truncate text-sm font-medium text-[#1f1f1f]">
                    {formatCapitalized(observation.observation_category)}
                    {observation.observation_subcategory &&
                      observation.observation_subcategory !== 'unknown' &&
                      ` · ${formatCapitalized(observation.observation_subcategory)}`}
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto g-scroll">
              <div className="space-y-5 px-5 pb-6 pt-4 sm:px-6">
                {/* Title and first-view chips — the largest text on the record,
                    then the quiet facts that frame it. */}
                <div>
                  <h2
                    id="passport-title"
                    className="text-xl font-semibold leading-snug tracking-tight text-[#1f1f1f] sm:text-[22px]"
                  >
                    {title}
                  </h2>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {observation.evidence_state && (
                      <span className="g-chip">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: EVIDENCE_STATE_HEX[evidenceState as EvidenceState] }}
                          aria-hidden="true"
                        />
                        {EVIDENCE_STATE_LABELS[evidenceState as EvidenceState]}
                      </span>
                    )}
                    <span className="g-chip">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {observation.district ? `${observation.district} District` : 'Rwanda'}
                    </span>
                    <span className="g-chip">{formatDate(observation.created_at)}</span>
                    {observation.is_demo && photoCount > 0 && (
                      <span className="g-chip">Public media: {photoCount}</span>
                    )}
                  </div>
                </div>

                {/* Key facts, as Google's label-over-value definition rows: the
                    label is quiet and uppercase, the value is the readable text. */}
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#e3e3e3]">
                  <div className="bg-white p-3.5">
                    <div className="g-section-label">Passport ID</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-[#1f1f1f]">
                      {observation.passport_id}
                    </div>
                  </div>
                  <div className="bg-white p-3.5">
                    <div className="g-section-label">Category</div>
                    <div className="mt-1 text-sm font-semibold text-[#1f1f1f]">
                      {formatCapitalized(observation.observation_category)}
                    </div>
                    {observation.observation_subcategory &&
                      observation.observation_subcategory !== 'unknown' && (
                        <div className="text-xs text-[#5e5e5e]">
                          {formatCapitalized(observation.observation_subcategory)}
                        </div>
                      )}
                  </div>
                  <div className="bg-white p-3.5">
                    {/* "Possible", because the reading is preliminary. */}
                    <div className="g-section-label">Proposed identification</div>
                    <div className="mt-1 text-sm font-semibold text-[#1f1f1f]">
                      {observation.primary_interpretation ||
                        formatCapitalized(observation.possible_name) ||
                        'Unidentified'}
                    </div>
                    {observation.classification &&
                      observation.classification !== 'non_rock' &&
                      observation.classification !== 'insufficient_image' && (
                        <div className="text-xs text-[#5e5e5e]">
                          Rock type: {formatCapitalized(observation.classification)}
                        </div>
                      )}
                  </div>
                  <div className="bg-white p-3.5">
                    <div className="g-section-label">AI confidence</div>
                    <div className="mt-1 text-sm font-semibold text-[#1f1f1f]">
                      {formatCapitalized(observation.confidence)}
                    </div>
                    {typeof observation.confidence_score === 'number' && (
                      <div className="text-xs text-[#5e5e5e]">
                        Score {Math.round(observation.confidence_score * 100)}%
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 bg-white p-3.5">
                    <div className="g-section-label">Evidence state</div>
                    {evidenceState ? (
                      <div className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-1">
                        <span
                          className="inline-flex items-center gap-1.5 text-sm font-semibold"
                          style={{ color: EVIDENCE_STATE_HEX[evidenceState as EvidenceState] }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: EVIDENCE_STATE_HEX[evidenceState as EvidenceState],
                            }}
                            aria-hidden="true"
                          />
                          {EVIDENCE_STATE_LABELS[evidenceState as EvidenceState]}
                        </span>
                        <span className="min-w-0 flex-1 text-xs leading-snug text-[#5e5e5e]">
                          {EVIDENCE_STATE_EXPLANATIONS[evidenceState as EvidenceState]}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-[#1f1f1f]">Not recorded</div>
                    )}
                  </div>
                </div>

                {observation.is_research_opportunity && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-[#a8c7ec] bg-[#e8f3ff] px-4 py-3 text-xs leading-snug text-[#0842a0]">
                    <Microscope className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold">Flagged as a research opportunity.</strong>{' '}
                      A person marked this record as worth further study. That is a question worth
                      asking, not a finding:{' '}
                      {observation.research_opportunity_count
                        ? `${observation.research_opportunity_count} related question${
                            observation.research_opportunity_count === 1 ? '' : 's'
                          } recorded.`
                        : 'No related questions recorded yet.'}
                    </span>
                  </div>
                )}

                {/* Observed Visual Evidence */}
                {observation.observed_features && observation.observed_features.length > 0 && (
                  <section>
                    <h3 className="g-panel-title">
                      <Sparkles className="h-4 w-4 text-[#9f6108]" aria-hidden="true" />
                      Observed visual evidence
                    </h3>
                    <ul className="space-y-1.5 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4 text-sm text-[#3c4043]">
                      {observation.observed_features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c7c7c7]" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Preliminary Reasoning */}
                {observation.reasoning && (
                  <section>
                    <h3 className="g-panel-title">
                      <Lightbulb className="h-4 w-4 text-[#9f6108]" aria-hidden="true" />
                      Preliminary reasoning
                    </h3>
                    <p className="rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4 text-sm leading-relaxed text-[#3c4043]">
                      {observation.reasoning}
                    </p>
                  </section>
                )}

                {/* What Is Still Uncertain */}
                {observation.uncertainties && observation.uncertainties.length > 0 && (
                  <section>
                    <h3 className="g-panel-title">
                      <HelpCircle className="h-4 w-4 text-[#8f8f8f]" aria-hidden="true" />
                      What is still uncertain
                    </h3>
                    <ul className="space-y-1 text-xs text-[#5e5e5e]">
                      {observation.uncertainties.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#c7c7c7]">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Scientific Limitations of Visual Assessment */}
                {observation.limitations && observation.limitations.length > 0 && (
                  <section>
                    <h3 className="g-panel-title">
                      <ShieldAlert className="h-4 w-4 text-[#d32f28]" aria-hidden="true" />
                      Scientific limitations of visual assessment
                    </h3>
                    <ul className="space-y-1 text-xs text-[#5e5e5e]">
                      {observation.limitations.map((lim, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#c7c7c7]">•</span>
                          <span>{lim}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Location & Privacy Notice */}
                <div className="space-y-1 rounded-xl border border-[#ffdf99] bg-[#fff8e6] p-4 text-xs text-[#5e5e5e]">
                  <div className="flex items-center gap-1.5 font-semibold text-[#7a5207]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Location &amp; privacy protection</span>
                  </div>
                  <p>
                    <strong className="font-semibold text-[#7a5207]">Area:</strong>{' '}
                    {observation.district
                      ? `${observation.district} District, Rwanda`
                      : 'Rwanda'}
                  </p>
                  <p>
                    🔒 <strong className="font-semibold text-[#7a5207]">Privacy policy:</strong>{' '}
                    Exact GPS coordinates and contributor personal data are protected and never
                    published. Generalized district-level coordinates are used.
                  </p>
                </div>

                {/* Scientific Safety Notice */}
                <div className="text-[11px] leading-relaxed text-[#5e5e5e]">
                  ⚠️ <strong className="font-medium text-[#3c4043]">Scientific disclaimer:</strong>{' '}
                  {observation.safety_note} A photograph or video cannot confirm mineral deposits,
                  ore grade, gold presence, geological age, or economic valuation, and nothing here
                  is a laboratory determination.
                </div>

                {/* Stage 11 — Geoscience Intelligence.
                    An extra interpretation layer, appended below the record. It never
                    replaces the passport content above it and never changes how the
                    record's own panels are laid out. */}
                <section
                  aria-labelledby="intelligence-title"
                  className="space-y-4 rounded-xl border border-[#d7c9ff] bg-[#f4f1ff] p-4"
                >
                  <header className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-[#5c2d91]" aria-hidden="true" />
                    <h3
                      id="intelligence-title"
                      className="g-panel-title mb-0 flex-1 text-[#3c4043]"
                    >
                      Geoscience Intelligence
                    </h3>
                    <span className="g-chip bg-white text-[#5c2d91]">
                      AI reading, not verified
                    </span>
                  </header>

                  {!intelReady ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-[#5e5e5e]">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#c7c7c7] border-t-[#5c2d91]" />
                      Assembling the intelligence presentation…
                    </div>
                  ) : intelligence ? (
                    <>
                      {intelligence.summary && (
                        <p className="text-sm leading-relaxed text-[#3c4043]">
                          {intelligence.summary}
                        </p>
                      )}

                      {/* What supports the reading, each claim tagged with its source. */}
                      {intelligence.primaryEvidence.length > 0 && (
                        <div>
                          <div className="g-section-label mb-1.5">What supports this reading</div>
                          <ul className="space-y-1">
                            {intelligence.primaryEvidence.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-xs text-[#3c4043]">
                                <span className="mt-0.5 text-[#7a50c7]">•</span>
                                <span>
                                  {item.claim}
                                  <span className="block text-[11px] text-[#5e5e5e]">
                                    {SOURCE_LABELS[item.source] ?? item.source}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {intelligence.alternativeHypotheses.length > 0 && (
                        <div>
                          <div className="g-section-label mb-1.5">
                            Other readings that remain possible
                          </div>
                          <ul className="space-y-1.5">
                            {intelligence.alternativeHypotheses.map((hyp, idx) => (
                              <li key={idx} className="text-xs text-[#3c4043]">
                                <span className="font-medium">{hyp.label}</span>
                                {hyp.evidenceFor.length > 0 && (
                                  <span className="block text-[11px] text-[#5e5e5e]">
                                    For: {hyp.evidenceFor.map((e) => e.claim).join('; ')}
                                  </span>
                                )}
                                {hyp.evidenceAgainst.length > 0 && (
                                  <span className="block text-[11px] text-[#5e5e5e]">
                                    Against: {hyp.evidenceAgainst.map((e) => e.claim).join('; ')}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {intelligence.followUpQuestions.length > 0 && (
                        <div>
                          <div className="g-section-label mb-1.5">
                            Questions for the person who submitted it
                          </div>
                          <ul className="space-y-1">
                            {intelligence.followUpQuestions.map((q, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-xs text-[#3c4043]">
                                <span className="mt-0.5 text-[#7a50c7]">?</span>
                                <span>{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {intelligence.geologicalContextNote && (
                        <p className="rounded-lg border border-[#d7c9ff]/60 bg-white px-3 py-2 text-xs text-[#5e5e5e]">
                          <span className="font-medium text-[#3c4043]">Geological context:</span>{' '}
                          {intelligence.geologicalContextNote}
                        </p>
                      )}

                      {intelligence.confidenceStatement && (
                        <p className="text-[11px] italic text-[#5e5e5e]">
                          {intelligence.confidenceStatement}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-[#5e5e5e]">
                      The intelligence presentation could not be assembled for this record. The
                      passport content above remains unaffected.
                    </p>
                  )}
                </section>

                {/* Stage 11 — Related public records (nearby + same category).
                    Proximity and shared category only; neither confirms the reading. */}
                {(nearby?.count ?? 0) + (similar?.count ?? 0) > 0 && (
                  <section aria-labelledby="related-title">
                    <h3 id="related-title" className="g-panel-title">
                      <MapPin className="h-4 w-4 text-[#8f8f8f]" aria-hidden="true" />
                      Related public records
                    </h3>
                    <div className="space-y-3">
                      {nearby && nearby.count > 0 && (
                        <div>
                          <div className="g-section-label mb-1.5">
                            Near this location — {nearby.note}
                          </div>
                          <ul className="space-y-1.5">
                            {nearby.items.slice(0, 5).map((item) => (
                              <li
                                key={item.passport_id}
                                className="flex items-center gap-3 rounded-lg border border-[#e3e3e3] bg-white p-2.5"
                              >
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f4f9] text-base"
                                  aria-hidden="true"
                                >
                                  {CATEGORY_ICONS[item.observation_category] ?? '❓'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-mono text-xs font-medium text-[#1f1f1f]">
                                    {item.passport_id}
                                  </span>
                                  <span className="block truncate text-[11px] text-[#5e5e5e]">
                                    {formatCapitalized(item.observation_category)}
                                    {item.district ? ` · ${item.district}` : ''}
                                  </span>
                                </span>
                                {item.distance_km !== null && (
                                  <span className="g-chip shrink-0">{item.distance_km} km</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {similar && similar.count > 0 && (
                        <div>
                          <div className="g-section-label mb-1.5">
                            Same category elsewhere — {similar.note}
                          </div>
                          <ul className="space-y-1.5">
                            {similar.items.slice(0, 5).map((item) => (
                              <li
                                key={item.passport_id}
                                className="flex items-center gap-3 rounded-lg border border-[#e3e3e3] bg-white p-2.5"
                              >
                                <span
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f4f9] text-base"
                                  aria-hidden="true"
                                >
                                  {CATEGORY_ICONS[item.observation_category] ?? '❓'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-mono text-xs font-medium text-[#1f1f1f]">
                                    {item.passport_id}
                                  </span>
                                  <span className="block truncate text-[11px] text-[#5e5e5e]">
                                    {formatCapitalized(item.observation_category)}
                                    {item.district ? ` · ${item.district}` : ''}
                                  </span>
                                </span>
                                {item.distance_km !== null && (
                                  <span className="g-chip shrink-0">{item.distance_km} km</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Sticky action bar — the one primary action of the record, kept in
                the thumb zone on mobile as on Google's place sheets. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e3e3e3] bg-white px-5 py-3">
              <span className="hidden shrink-0 text-[11px] text-[#8f8f8f] sm:block">
                Preliminary AI-assisted record · not a laboratory determination
              </span>
              <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
                <button type="button" onClick={onClose} className="g-btn g-btn-text">
                  Close
                </button>
                <button type="button" onClick={onOpenWhatsApp} className="g-btn g-btn-filled">
                  <span>
                    {observation.observation_category === 'rock'
                      ? 'Have a rock like this? Submit via WhatsApp'
                      : 'Have something like this? Submit via WhatsApp'}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
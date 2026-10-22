/**
 * Community Discovery client types.
 *
 * These mirror the public DTOs in `src/types/community.types.ts`. They exist
 * separately because the browser must not receive the internal record shape,
 * which contains the contributor hash.
 *
 * The eight-value evidence ladder is reproduced verbatim. The client may render
 * it but must never reorder, merge or reinterpret it.
 */

/**
 * The canonical evidence ladder, in ladder order.
 *
 * `EVIDENCE_STATES` is the single source of truth in this module. The type is
 * derived from it rather than written out separately, so the map expression, the
 * legend and the colour maps cannot fall out of step with the type they claim
 * to cover.
 *
 * The values are reproduced verbatim from `src/types/community.types.ts`, which
 * is the authority. The order here is presentation order only and carries no
 * meaning; use `EVIDENCE_STATE_RANK` for rank comparisons.
 */
export const EVIDENCE_STATES = [
  'insufficient_evidence',
  'ai_assisted',
  'community_supported',
  'community_investigated',
  'expert_reviewed',
  'scientifically_confirmed',
  'unresolved',
  'rejected',
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** True when a value is one of the canonical evidence states. */
export function isEvidenceState(value: unknown): value is EvidenceState {
  return typeof value === 'string' && (EVIDENCE_STATES as readonly string[]).includes(value);
}

export type CommunityEvidenceType =
  | 'close_up'
  | 'fresh_surface'
  | 'texture'
  | 'outcrop'
  | 'environment'
  | 'video'
  | 'field_note'
  | 'comparison'
  | 'discussion'
  | 'reference';

/** What each kind of evidence is, in the contributor's own words. */
export const EVIDENCE_TYPE_LABELS: Record<CommunityEvidenceType, string> = {
  close_up: 'A close-up photo',
  fresh_surface: 'A freshly exposed surface',
  texture: 'A texture detail',
  outcrop: 'An outcrop view',
  environment: 'The surrounding environment',
  video: 'A short video',
  field_note: 'A field note',
  comparison: 'A comparison with something known',
  discussion: 'A discussion or interpretation',
  reference: 'A reference or source',
};

/**
 * An investigation's lifecycle. Mirrors the server's `INVESTIGATION_STATUSES`
 * exactly, so a status the server can emit always has a defined presentation
 * here rather than falling through to a raw enum string.
 */
export type InvestigationStatus =
  | 'open'
  | 'investigating'
  | 'community_supported'
  | 'expert_reviewed'
  | 'resolved'
  | 'unresolved'
  | 'archived';

export const INVESTIGATION_STATUS_LABELS: Record<InvestigationStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  community_supported: 'Community-supported',
  expert_reviewed: 'Expert reviewed',
  resolved: 'Resolved',
  unresolved: 'Unresolved',
  archived: 'Archived',
};

/** Human label for a status, tolerating an unrecognised value from the server. */
export function investigationStatusLabel(status: string): string {
  return INVESTIGATION_STATUS_LABELS[status as InvestigationStatus] ?? status.replace(/_/g, ' ');
}

export type SiteGroupingBasis = 'admin_curated' | 'observation_cluster' | 'community_suggested';

export interface VoteTally {
  option: string;
  count: number;
  share_pct: number;
}

export interface PublicSiteSummary {
  site_id: string;
  site_code: string;
  title: string;
  description: string | null;
  grouping_basis: SiteGroupingBasis;
  district: string | null;
  sector: string | null;
  location_precision: 'district' | 'approximate' | 'exact';
  latitude: number | null;
  longitude: number | null;
  observation_count: number;
  visit_count: number;
  investigation_count: number;
  question_count: number;
  evidence_count: number;
  highest_evidence_state: EvidenceState | null;
  observed_classifications: string[];
  districts_covered: string[];
  /** True when this is a labelled demonstration record served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

/** One evidence request on an investigation checklist, with its community tally. */
export interface PublicChecklistItem {
  id: string;
  text: string;
  /** How many contributors said they can provide this. Not a verification. */
  check_count: number;
  /** True when this browser has checked this item off. */
  viewer_checked: boolean;
}

export interface PublicInvestigationSummary {
  public_id: string;
  question: string;
  status: InvestigationStatus;
  site_id: string | null;
  observation_id: string | null;
  passport_id: string | null;
  site_code: string | null;
  participant_count: number;
  evidence_count: number;
  vote_count: number;
  research_interest: boolean;
  /** Fixed answer choices when the investigation is run as a survey. */
  options: string[];
  /** Evidence requests the opener listed, with what the community can provide. */
  checklist: PublicChecklistItem[];
  /** Extra context the opener supplied. */
  context: string | null;
  /** Optional geoscience category id for the subject. */
  category: string | null;
  /** Attached/moderated community media ids. */
  media_ids: string[];
  vote_distribution: VoteTally[];
  opened_by_handle: string | null;
  /**
   * True when this browser opened the investigation, so an edit action can be
   * offered. It is a presentation hint only; the server re-checks ownership.
   */
  viewer_is_owner: boolean;
  /** True when this is a labelled demonstration record served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
  disclaimer: string;
}

/** Fields the opener may correct after an investigation is published. */
export interface UpdateInvestigationInput {
  question?: string;
  context?: string | null;
  category?: string | null;
  options?: string[];
  /** Replaces the evidence checklist. Omit to leave it unchanged. */
  checklist?: string[];
  researchInterest?: boolean;
}

export interface PublicEvidenceItem {
  id: string;
  evidence_type: CommunityEvidenceType;
  explanation: string | null;
  supports_evidence: boolean;
  is_challenge: boolean;
  contributor_handle: string;
  observation_id: string | null;
  site_id: string | null;
  media_id: string | null;
  media_ids: string[];
  created_at: string;
}

export interface PublicInvestigationDetail extends PublicInvestigationSummary {
  evidence: PublicEvidenceItem[];
  questions: PublicQuestionSummary[];
}

export interface PublicQuestionSummary {
  public_id: string;
  question: string;
  status: string;
  site_id: string | null;
  observation_id: string | null;
  investigation_id: string | null;
  passport_id: string | null;
  answer_count: number;
  vote_count: number;
  asked_by_handle: string;
  /** True when the asker asked for a qualified practitioner to answer. */
  requested_expert: boolean;
  /** Extra context the asker supplied. */
  context: string | null;
  /** Optional geoscience category id for the subject. */
  category: string | null;
  /** Attached/moderated community media ids. */
  media_ids: string[];
  /** True when this is a labelled demonstration record served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicAnswerItem {
  id: string;
  answer: string;
  contributor_handle: string;
  evidence_id: string | null;
  media_ids: string[];
  /** True when a qualified reviewer recorded this — never inferred from votes. */
  is_expert: boolean;
  created_at: string;
}

export type CommunityMediaKind = 'image' | 'video';

/** A stored community attachment returned by POST /api/community/media. */
export interface PublicCommunityMedia {
  id: string;
  kind: CommunityMediaKind;
  mime_type: string;
  url: string;
  moderation_status: 'visible' | 'pending_review' | 'hidden' | 'removed';
  is_demo: boolean;
  created_at: string;
}

export interface PublicQuestionDetail extends PublicQuestionSummary {
  answers: PublicAnswerItem[];
}

export interface PublicVisitSummary {
  id: string;
  site_id: string;
  contributor_handle: string;
  visited_on: string;
  notes: string | null;
  media_id: string | null;
  created_at: string;
}

export interface PublicReputationSummary {
  public_handle: string;
  observations_count: number;
  evidence_count: number;
  votes_count: number;
  questions_count: number;
  answers_count: number;
  visits_count: number;
  investigations_count: number;
  districts_represented: number;
  achievements: Array<{ id: string; label: string; description: string; earned: boolean }>;
  disclaimer: string;
}

// -----------------------------------------------------------------------------
// Site Explorer
// -----------------------------------------------------------------------------

/**
 * Plain-language category names, mirroring `GEOSCIENCE_CATEGORY_LABELS` on the
 * server. Duplicated deliberately: the map filter receives labels from the
 * category-counts endpoint, but a single site explorer's payload carries no
 * category list, so it needs its own copy rather than a lookup that resolves to
 * nothing.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  rock: 'Rock',
  mineral: 'Mineral',
  fossil: 'Fossil or paleontological',
  geological_structure: 'Geological structure',
  geological_layer: 'Geological layer or stratigraphy',
  geomorphology: 'Landform or geomorphology',
  volcanic_feature: 'Volcanic feature',
  hydrogeological_feature: 'Hydrogeological feature',
  mining_observation: 'Mining or economic geology',
  engineering_geology: 'Engineering geology',
  other_geoscience: 'Other geoscience',
  unknown: 'Undetermined',
  insufficient_image: 'Insufficient image',
  non_geoscience: 'Not geoscience',
};

/**
 * Humanises an id the label map does not carry, rather than rendering the raw
 * snake_case. A new server-side category should still be readable in the UI on
 * the day it ships, before this map is updated.
 */
export function categoryLabel(category: string | null | undefined): string {
  const id = (category ?? 'unknown').trim();
  if (CATEGORY_LABELS[id]) return CATEGORY_LABELS[id];

  const humanised = id
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return humanised || 'Undetermined';
}

export interface PublicObservationRef {
  passport_id: string;
  /**
   * What was observed, ahead of the legacy rock classification.
   *
   * The Site Explorer lists observations from a single site, so a site holding a
   * fossil, a cave and an ore-showing sighting renders three rock types without
   * this. Kept ahead of `classification` for that reason.
   */
  observation_category: string;
  observation_subcategory: string;
  classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  evidence_state: EvidenceState;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface NearbyObservation extends PublicObservationRef {
  distance_km: number;
}

/** Block 1 of 3. Automated interpretation. Never presented as confirmed. */
export interface AiInterpretationBlock {
  passport_id: string;
  is_rock: boolean;
  primary_classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  observed_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  ai_model: string;
  disclaimer: string;
}

/** Block 2 of 3. What people reported. Never presented as scientific. */
export interface SiteCommunityBlock {
  investigation_count: number;
  question_count: number;
  evidence_count: number;
  visit_count: number;
  vote_count: number;
  participants: number;
  vote_distribution: VoteTally[];
  note: string;
}

/** Block 3 of 3. A human determination, present only when one exists. */
export interface ExpertReviewBlock {
  reviewer_label: string;
  identity_published: boolean;
  status: string;
  expert_classification: string | null;
  expert_rock_name: string | null;
  expert_confidence: string | null;
  expert_observed_features: string[];
  expert_notes: string | null;
  scientific_remarks: string | null;
  evidence_basis: string | null;
  review_date: string | null;
  created_at: string;
}

export interface SiteTimelineEntry {
  event_type: 'observation' | 'investigation' | 'evidence' | 'question' | 'answer' | 'visit' | 'expert_review';
  event_at: string;
  ref_id: string;
  summary: string;
}

export interface SiteExplorerPayload {
  site: PublicSiteSummary;
  observations: PublicObservationRef[];
  timeline: SiteTimelineEntry[];
  nearby: NearbyObservation[];
  ai_interpretation: AiInterpretationBlock | null;
  community: SiteCommunityBlock;
  expert_review: ExpertReviewBlock | null;
}

// -----------------------------------------------------------------------------
// Presentation helpers
// -----------------------------------------------------------------------------

export const EVIDENCE_STATE_LABELS: Record<EvidenceState, string> = {
  insufficient_evidence: 'Insufficient evidence',
  ai_assisted: 'AI-assisted identification',
  community_supported: 'Community-supported',
  community_investigated: 'Community-investigated',
  expert_reviewed: 'Expert reviewed',
  scientifically_confirmed: 'Scientifically confirmed',
  unresolved: 'Unresolved',
  rejected: 'Rejected',
};

/**
 * Rank mirrors the backend. `unresolved` and `rejected` are deliberately the
 * highest so that a rollup cannot present a disputed or withdrawn record as
 * settled, and `insufficient_evidence` is the lowest because "nothing could be
 * concluded" is not weak support - it is the absence of a conclusion.
 */
export const EVIDENCE_STATE_RANK: Record<EvidenceState, number> = {
  insufficient_evidence: 1,
  ai_assisted: 2,
  community_supported: 3,
  community_investigated: 4,
  expert_reviewed: 5,
  scientifically_confirmed: 6,
  unresolved: 7,
  rejected: 8,
};

/**
 * Tailwind classes per state. Distinct colours keep the ladder readable.
 *
 * Use this map ONLY where a `className` is expected. Assigning one of these
 * strings to `style={{ background }}` is silently discarded by the CSS engine,
 * because `bg-zinc-800/40` is not a colour value. For inline styles, MapLibre
 * paint expressions and SVG fills, use `EVIDENCE_STATE_HEX` below.
 */
export const EVIDENCE_STATE_COLORS: Record<EvidenceState, string> = {
  // Deliberately the dullest colour on the ladder. This is what the platform says
  // when it could not reach a conclusion, and it should not look like a finding.
  insufficient_evidence: 'bg-zinc-800/40 text-zinc-400 border-zinc-700/60',
  ai_assisted: 'bg-slate-700/40 text-slate-300 border-slate-600/60',
  community_supported: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  community_investigated: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  expert_reviewed: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  scientifically_confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  unresolved: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  rejected: 'bg-neutral-900 text-neutral-500 border-neutral-700 line-through',
};

/**
 * CSS colour values per state, for contexts that cannot accept Tailwind classes.
 *
 * The hues match the Tailwind palette used above, so a dot drawn with this map
 * and a badge drawn with the class map read as the same rung of the ladder.
 *
 * `insufficient_evidence` is the darkest and `unresolved`/`rejected` are the
 * most saturated on purpose: "we could not tell" and "this is disputed" must
 * never be mistaken for a positive finding at a glance.
 */
export const EVIDENCE_STATE_HEX: Record<EvidenceState, string> = {
  insufficient_evidence: '#52525b',
  ai_assisted: '#cbd5e1',
  community_supported: '#7dd3fc',
  community_investigated: '#a5b4fc',
  expert_reviewed: '#fcd34d',
  scientifically_confirmed: '#6ee7b7',
  unresolved: '#fda4af',
  rejected: '#737373',
};

/** Shown when a record carries no evidence state at all. */
export const NO_EVIDENCE_HEX = '#8f8f8f';

/**
 * Explicit plain-language meaning of each state.
 *
 * The wording is the point: it prevents a reader from reading
 * "community-investigated" as "scientifically proven".
 */
export const EVIDENCE_STATE_EXPLANATIONS: Record<EvidenceState, string> = {
  insufficient_evidence:
    'Something was submitted but the evidence does not support any interpretation. This is not a wrong answer - it is no answer.',
  ai_assisted: 'Identified by an automated model. Not verified by a person.',
  community_supported: 'Several people agreed on a view. Agreement is not verification.',
  community_investigated: 'People contributed observations or evidence. Still not expert verified.',
  expert_reviewed: 'A human expert examined it. Their basis for the call is shown alongside.',
  scientifically_confirmed:
    'Confirmed against laboratory analysis or a documented reference specimen.',
  unresolved: 'People disagree, or the evidence conflicts. Treat this as open.',
  rejected:
    'A platform owner recorded that this should not be presented as an observation. The history is kept for audit.',
};

/**
 * GeoJSON shapes for published geological sites.
 *
 * Declared locally to match the convention in `types/public.ts`; the project
 * does not depend on `@types/geojson`, so the global `GeoJSON` namespace is not
 * available.
 *
 * `properties.highest_evidence_state` is what drives the map colour. It is the
 * site's strongest established evidence state, and it is deliberately absent
 * (`null`) when nothing has been established, so the map falls back to a
 * neutral slate rather than implying a weak positive.
 */
export interface PublicSiteFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    site_id: string;
    site_code: string;
    title: string;
    grouping_basis: SiteGroupingBasis;
    district: string | null;
    location_precision: 'district' | 'approximate' | 'exact';
    highest_evidence_state: EvidenceState | null;
    observation_count: number;
    investigation_count: number;
    question_count: number;
    /** Community evidence items attached to the site, for the filter panel. */
    evidence_count?: number;
    /** Categories observed at the site, so the category filter can apply here. */
    observed_classifications?: string[];
    is_demo?: boolean;
  };
}

export interface PublicSiteGeoJson {
  type: 'FeatureCollection';
  features: PublicSiteFeature[];
}

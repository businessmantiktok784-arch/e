/**
 * Community Discovery types.
 *
 * Scientific integrity rules encoded in these types:
 *   - `EvidenceState` is an ordered ladder. It is never derived from vote totals
 *     alone; Level 2 requires independent contributors and Level 5 requires a
 *     recorded laboratory or documented-reference basis.
 *   - Public DTOs deliberately carry a `participant_handle` (e.g.
 *     "Field Explorer #A82F") and never a `contributor_hash`, so no public
 *     response can leak the internal identity key.
 */

// ============================================================================
// Evidence ladder (spec section 4 / 65)
// ============================================================================

/**
 * The evidence ladder (specification section 12).
 *
 * This array is the single source of truth for the ladder. The database CHECK
 * constraint, the public filter validator, the research exports and the client
 * all derive their vocabulary from it, so a state cannot exist in one layer and
 * be missing from another.
 *
 * Three principles are encoded in the ordering, not just in comments:
 *
 *   - A record with no support is not a weak record, it is an absent record.
 *     `insufficient_evidence` exists so "we looked and could not tell" is a
 *     publishable answer instead of being hidden or shown as low confidence.
 *   - `rejected` is a recorded platform-owner determination, never something
 *     inferred from activity.
 *   - `unresolved` outranks `scientifically_confirmed`. A disputed record is
 *     not settled, and a rollup must never let an unrelated confirmation bury
 *     a dispute.
 */
export const EVIDENCE_STATES = [
  'ai_assisted',
  'community_supported',
  'community_investigated',
  'expert_reviewed',
  'scientifically_confirmed',
  'unresolved',
  'insufficient_evidence',
  'rejected',
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** True when the state is a valid database value. */
export function isEvidenceState(value: unknown): value is EvidenceState {
  return typeof value === 'string' && (EVIDENCE_STATES as readonly string[]).includes(value);
}

/**
 * Ordered rank, lowest first. Used for "highest evidence level" rollups.
 *
 * `unresolved` and `rejected` are ranked above `scientifically_confirmed` on
 * purpose. A disputed or withdrawn record is not weakly evidenced - it is a
 * record the platform must not present as settled. Ranking them last would let
 * a rollup quietly bury a dispute behind an unrelated confirmed reading, which
 * is the opposite of honest reporting.
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
 * The states that are explicitly NOT support for an interpretation.
 *
 * A rollup over these must never report a positive level. `insufficient_evidence`
 * means nothing could be concluded and `rejected` means the record should not be
 * presented, so treating either as evidence would be a lie in the other
 * direction.
 */
export const NON_EVIDENCE_STATES: ReadonlySet<EvidenceState> = new Set<EvidenceState>([
  'insufficient_evidence',
  'rejected',
]);

/** True when the state reflects real, recorded human or community support. */
export function isSupportiveEvidence(state: EvidenceState | null | undefined): boolean {
  return Boolean(state) && !NON_EVIDENCE_STATES.has(state as EvidenceState);
}

export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
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
 * Plain-language explanation of what each level does and does not mean.
 *
 * Served with every evidence state so a reader cannot confuse a stronger colour
 * with a better answer.
 */
export const EVIDENCE_STATE_MEANING: Record<EvidenceState, string> = {
  insufficient_evidence:
    'Something was submitted, but the available evidence cannot support any interpretation. This is not a wrong answer - it is no answer.',
  ai_assisted:
    'An automated model produced a preliminary reading. The model has not been to the site and cannot confirm anything.',
  community_supported:
    'Several independent people agreed on an interpretation. Agreement is not scientific confirmation.',
  community_investigated:
    'People contributed substantive field evidence. A well-supported observation is still not a laboratory result.',
  expert_reviewed:
    'A qualified geoscientist reviewed this record and recorded a determination. A review is not a laboratory analysis.',
  scientifically_confirmed:
    'An expert review backed by laboratory analysis or a documented reference specimen exists. This is the strongest level Earth Talk records.',
  unresolved:
    'There is a dispute or conflicting evidence. This record is deliberately not presented as settled.',
  rejected:
    'A platform owner recorded that this should not be presented as an observation. The history is retained for audit.',
};

/**
 * Mandatory wording attached to any community-derived conclusion.
 * Community agreement is never presented as scientific truth.
 */
export const COMMUNITY_DISCLAIMER =
  'Community-supported hypothesis — not scientific confirmation.';

export const AI_DISCLAIMER =
  'Preliminary AI-assisted interpretation only. Not an authorised laboratory or expert determination.';

// ============================================================================
// Enumerations
// ============================================================================

export const INVESTIGATION_STATUSES = [
  'open',
  'investigating',
  'community_supported',
  'expert_reviewed',
  'resolved',
  'unresolved',
  'archived',
] as const;

export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const EVIDENCE_TYPES = [
  'photo',
  'close_up',
  'fresh_surface',
  'texture',
  'outcrop',
  'environment',
  'video',
  'field_note',
  'comparison',
  'discussion',
  'reference',
] as const;

export type CommunityEvidenceType = (typeof EVIDENCE_TYPES)[number];

export const MODERATION_STATUSES = ['visible', 'pending_review', 'hidden', 'removed'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const QUESTION_STATUSES = [
  'open',
  'investigating',
  'community_supported',
  'expert_reviewed',
  'resolved',
  'unresolved',
] as const;

export type CommunityQuestionStatus = (typeof QUESTION_STATUSES)[number];

export const SITE_GROUPING_BASES = ['admin_curated', 'evidence_backed', 'suggested'] as const;
export type SiteGroupingBasis = (typeof SITE_GROUPING_BASES)[number];

export const SITE_GROUPING_LABEL: Record<SiteGroupingBasis, string> = {
  admin_curated: 'Curated by the platform owner',
  evidence_backed: 'Grouped from field evidence',
  suggested: 'Suggested grouping (not confirmed)',
};

// ============================================================================
// Internal records (server-side only — never serialised to public responses)
// ============================================================================

/**
 * One evidence request on an investigation's checklist.
 *
 * The opener lists what the community should gather or check (a clear close-up,
 * the location, a scratch test). It is a request, not a finding: checking one
 * off records that someone says they can provide it, never that it was met.
 */
export interface InvestigationChecklistItem {
  id: string;
  text: string;
}

/** A checklist item as shown publicly, with a real check count. */
export interface PublicChecklistItem {
  id: string;
  text: string;
  /** How many distinct contributors have checked this item off. */
  check_count: number;
  /** True when the caller has checked it off. */
  viewer_checked: boolean;
}

export interface CommunityInvestigationRecord {
  id: string;
  public_id: string;
  site_id: string | null;
  observation_id: string | null;
  question: string;
  status: InvestigationStatus;
  opened_by_hash: string | null;
  is_public: boolean;
  participant_count: number;
  evidence_count: number;
  vote_count: number;
  research_interest: boolean;
  /** Evidence requests the opener set. Stored as JSON on the row. */
  checklist?: InvestigationChecklistItem[];
  /**
   * Fixed answer choices when the investigation is run as a survey. An empty
   * array means a free-text vote, which is the original behaviour.
   */
  options?: string[];
  /** Extra context the opener supplied: what they saw and why they are unsure. */
  context?: string | null;
  /** Optional geoscience category id for the subject of the investigation. */
  category?: string | null;
  /** Attached community media ids (images), moderated like evidence media. */
  media_ids?: string[];
  /** True when this is a labelled demonstration record served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunityVoteRecord {
  id: string;
  investigation_id: string;
  contributor_hash: string;
  option: string;
  created_at: string;
  updated_at: string;
}

export interface CommunityEvidenceRecord {
  id: string;
  investigation_id: string | null;
  site_id: string | null;
  observation_id: string | null;
  media_id: string | null;
  /** Additional attached community media ids beyond the single legacy `media_id`. */
  media_ids?: string[];
  contributor_hash: string;
  evidence_type: CommunityEvidenceType;
  explanation: string | null;
  supports_evidence: boolean;
  is_challenge: boolean;
  moderation_status: ModerationStatus;
  created_at: string;
  updated_at: string;
}

export interface CommunityQuestionRecord {
  id: string;
  public_id: string;
  site_id: string | null;
  observation_id: string | null;
  investigation_id: string | null;
  question: string;
  contributor_hash: string;
  status: CommunityQuestionStatus;
  is_public: boolean;
  answer_count: number;
  vote_count: number;
  /** True when the asker asked for a qualified practitioner to answer. */
  requested_expert?: boolean;
  /** Extra context the asker supplied. */
  context?: string | null;
  /** Optional geoscience category id for the subject of the question. */
  category?: string | null;
  /** Attached community media ids (images), moderated like evidence media. */
  media_ids?: string[];
  /** True when this is a labelled demonstration record served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunityAnswerRecord {
  id: string;
  question_id: string;
  contributor_hash: string;
  answer: string;
  evidence_id: string | null;
  /** Attached community media ids (images). */
  media_ids?: string[];
  /**
   * True only when a qualified reviewer recorded this answer. It is set by the
   * platform owner, never inferred from community activity, so an "Expert
   * answer" badge always means a named human determination.
   */
  is_expert?: boolean;
  created_at: string;
}

export interface CommunityVisitRecord {
  id: string;
  site_id: string;
  contributor_hash: string;
  visited_on: string;
  notes: string | null;
  media_id: string | null;
  created_at: string;
}

/**
 * Contribution metrics only.
 *
 * There is intentionally no accuracy or correctness column. This platform does
 * not compute a scientific correctness score for a participant.
 */
export interface CommunityReputationRecord {
  contributor_hash: string;
  public_handle: string;
  observations_count: number;
  evidence_count: number;
  votes_count: number;
  questions_count: number;
  answers_count: number;
  visits_count: number;
  investigations_count: number;
  districts_represented: number;
  achievements: Achievement[];
  updated_at: string;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  /** Progress toward the achievement, e.g. 7 of 10 sites visited. */
  progress?: { current: number; required: number };
  earned: boolean;
}

// ============================================================================
// Public DTOs (safe to return from public endpoints)
// ============================================================================

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
  /**
   * Fixed answer choices when this is a survey. Empty for a free-text vote.
   * A vote is only honest if it is drawn from the choices the opener set, so the
   * client renders these and refuses an option that is not among them.
   */
  options: string[];
  /** Evidence the opener asks the community to gather, with real check counts. */
  checklist: PublicChecklistItem[];
  /** Extra context the opener supplied. */
  context: string | null;
  /** Optional geoscience category id for the subject. */
  category: string | null;
  /** Attached/moderated community media ids. */
  media_ids: string[];
  /** Aggregated vote tally. Community opinion, explicitly not scientific truth. */
  vote_distribution: VoteTally[];
  opened_by_handle: string | null;
  /**
   * True when the caller opened this investigation, so the client can offer an
   * edit action. This never grants authority on its own: the update endpoint
   * re-checks ownership against the contributor hash.
   */
  viewer_is_owner: boolean;
  /** True when the record is a labelled demonstration record in demo mode. */
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  disclaimer: string;
}

export interface PublicInvestigationDetail extends PublicInvestigationSummary {
  evidence: PublicEvidenceItem[];
  questions: PublicQuestionSummary[];
}

export interface VoteTally {
  option: string;
  count: number;
  /** Share of votes for this option, 0-100, rounded to 1 decimal. */
  share_pct: number;
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
  /** All attached community media ids, including the legacy `media_id`. */
  media_ids: string[];
  created_at: string;
}

export interface PublicQuestionSummary {
  public_id: string;
  question: string;
  status: CommunityQuestionStatus;
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
  /** True when the record is a labelled demonstration record in demo mode. */
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicQuestionDetail extends PublicQuestionSummary {
  answers: PublicAnswerItem[];
}

export interface PublicAnswerItem {
  id: string;
  answer: string;
  contributor_handle: string;
  evidence_id: string | null;
  /** Attached/moderated community media ids. */
  media_ids: string[];
  /** True when a qualified reviewer recorded this — never inferred from votes. */
  is_expert: boolean;
  created_at: string;
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

/**
 * Activity feed entry. Every entry corresponds to a real stored row; there is
 * no code path that produces an entry without an underlying record.
 */
export interface SiteTimelineEntry {
  event_type: 'observation' | 'investigation' | 'evidence' | 'question' | 'visit' | 'expert_review';
  event_at: string;
  ref_id: string | null;
  summary: string;
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
  achievements: Achievement[];
  disclaimer: string;
}

export const REPUTATION_DISCLAIMER =
  'Reputation reflects participation and contribution only. It is not a measure of scientific accuracy.';

// ============================================================================
// Input contracts
// ============================================================================

export interface CreateInvestigationInput {
  question: string;
  siteId?: string | null;
  observationId?: string | null;
  isPublic?: boolean;
  /**
   * When true the investigation is flagged as a community-generated research
   * opportunity. The opportunity summary must then say what the community
   * actually observed, not what it concluded.
   */
  researchInterest?: boolean;
  opportunitySummary?: string | null;
  opportunityBasis?: ResearchOpportunityBasis | null;
  /** Fixed answer choices when the investigation is run as a survey (2-8). */
  options?: string[];
  /** Evidence requests the opener sets for the community (up to 8). */
  checklist?: string[];
  /** Extra context: what was seen and why the opener is unsure. */
  context?: string | null;
  /** Optional geoscience category id for the subject. */
  category?: string | null;
  /** Attached community media ids. */
  mediaIds?: string[];
}

/**
 * Fields the opener may change after an investigation is published.
 *
 * Site and observation are deliberately immutable: relocating a published
 * investigation after people have voted would silently change what their vote
 * was about. Everything else the opener wrote can be corrected.
 */
export interface UpdateInvestigationInput {
  /** Corrected question text. */
  question?: string;
  /** Corrected or added context. */
  context?: string | null;
  /** Corrected subject category. */
  category?: string | null;
  /** Replacement fixed answer choices; an empty array switches to free text. */
  options?: string[];
  /** Replacement evidence checklist; an empty array clears it. */
  checklist?: string[];
  /** Whether the investigation is a research opportunity. */
  researchInterest?: boolean;
}

export interface CastVoteInput {
  investigationId: string;
  option: string;
}

export interface SubmitEvidenceInput {
  investigationId?: string | null;
  siteId?: string | null;
  observationId?: string | null;
  mediaId?: string | null;
  /** Additional attached community media ids. */
  mediaIds?: string[];
  evidenceType: CommunityEvidenceType;
  explanation?: string | null;
  supportsEvidence?: boolean;
  isChallenge?: boolean;
}

export interface AskQuestionInput {
  question: string;
  siteId?: string | null;
  observationId?: string | null;
  investigationId?: string | null;
  /** Flags the question for a qualified practitioner to answer. */
  requestedExpert?: boolean;
  /** Extra context for the question. */
  context?: string | null;
  /** Optional geoscience category id for the subject. */
  category?: string | null;
  /** Attached community media ids. */
  mediaIds?: string[];
}

export interface PostAnswerInput {
  questionId: string;
  answer: string;
  evidenceId?: string | null;
  /** Attached community media ids. */
  mediaIds?: string[];
  /** Set only by the platform owner when recording a human determination. */
  isExpert?: boolean;
}

export interface RecordVisitInput {
  siteId: string;
  visitedOn?: string;
  notes?: string | null;
  mediaId?: string | null;
}

// ============================================================================
// Community media (attachments on investigations, evidence, questions, answers)
// ============================================================================

export const COMMUNITY_MEDIA_KINDS = ['image', 'video'] as const;
export type CommunityMediaKind = (typeof COMMUNITY_MEDIA_KINDS)[number];

/**
 * A stored community attachment.
 *
 * Bytes are validated by signature rather than the declared type, and are only
 * exposed publicly once moderation has passed. `is_demo` marks in-memory
 * demonstration media served in demo mode.
 */
export interface PublicCommunityMedia {
  id: string;
  kind: CommunityMediaKind;
  mime_type: string;
  url: string;
  moderation_status: ModerationStatus;
  is_demo: boolean;
  created_at: string;
}

export interface AddCommunityMediaInput {
  /** Base64 bytes, with or without a data-URL prefix. */
  contentBase64: string;
  /** Declared MIME type; never trusted on its own. */
  mimeType?: string;
  caption?: string | null;
}

// ============================================================================
// Research opportunities (specification section 21)
// ============================================================================

/**
 * What a research opportunity was derived from.
 *
 * All three values are community activity. None is a scientific source, and
 * none of them licenses a claim that a discovery was made.
 */
export const RESEARCH_OPPORTUNITY_BASES = ['observation', 'site', 'community'] as const;
export type ResearchOpportunityBasis = (typeof RESEARCH_OPPORTUNITY_BASES)[number];

/**
 * Mandatory wording attached to every research opportunity.
 *
 * A research opportunity is an open question the community would like answered.
 * It is never an official geological discovery, a survey finding, or a
 * scientific result, and the platform must not present it as one.
 */
export const RESEARCH_OPPORTUNITY_LABEL = 'Community-generated research opportunity';

export const RESEARCH_OPPORTUNITY_DISCLAIMER =
  'Community-generated research opportunity: an open question raised from public observations. This is not an official geological discovery, a survey finding, or a scientific result.';

/**
 * A research opportunity surfaced to the public.
 *
 * Every field is derived from real rows. `observation_count` is the number of
 * genuinely published observations that triggered the pattern, so an
 * opportunity cannot be invented from nothing.
 */
export interface ResearchOpportunity {
  opportunity_id: string;
  public_id: string;
  label: typeof RESEARCH_OPPORTUNITY_LABEL;
  basis: ResearchOpportunityBasis;
  question: string;
  summary: string;
  /** Observation category that triggered the pattern, or null when not applicable. */
  observation_category: string | null;
  observation_subcategory: string | null;
  site_id: string | null;
  site_code: string | null;
  site_title: string | null;
  district: string | null;
  observation_count: number;
  investigation_count: number;
  evidence_count: number;
  contributor_count: number;
  highest_evidence_state: EvidenceState | null;
  status: InvestigationStatus;
  created_at: string;
  last_activity_at: string;
  disclaimer: typeof RESEARCH_OPPORTUNITY_DISCLAIMER;
}

// ============================================================================
// Community abuse reports (specification section 25)
// ============================================================================

/**
 * Reasons a member of the public may report a record.
 *
 * A report is an allegation. It carries no evidence, it never changes an
 * evidence state, and it is never counted as community support.
 */
export const ABUSE_REPORT_REASONS = [
  'incorrect_information',
  'privacy_concern',
  'misleading_claim',
  'commercial_or_spam',
  'abusive_content',
  'duplicate_record',
  'sensitive_location',
  'safety_principles',
  'other',
] as const;

export type AbuseReportReason = (typeof ABUSE_REPORT_REASONS)[number];

export const ABUSE_REPORT_REASON_LABEL: Record<AbuseReportReason, string> = {
  incorrect_information: 'The geological information looks incorrect',
  privacy_concern: 'It exposes someone\'s private location or identity',
  misleading_claim: 'It makes a claim the evidence does not support',
  commercial_or_spam: 'It is commercial, promotional or spam',
  abusive_content: 'It contains abusive or harmful content',
  duplicate_record: 'It duplicates an existing record',
  sensitive_location: 'The location is ecologically or culturally sensitive',
  safety_principles: 'It violates Earth Talk\'s humanitarian, community or safety principles',
  other: 'Something else',
};

export const ABUSE_REPORT_STATUSES = ['open', 'acknowledged', 'actioned', 'dismissed'] as const;
export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number];

/** A report as shown to the platform owner. */
export interface CommunityAbuseReport {
  id: string;
  public_id: string;
  target_type: AbuseReportTargetType;
  target_id: string;
  observation_passport_id?: string | null;
  reason_code: AbuseReportReason;
  details: string | null;
  reported_by_hash: string | null;
  status: AbuseReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export const ABUSE_REPORT_TARGET_TYPES = [
  'observation',
  'investigation',
  'question',
  // Comments and their replies share one target type: a reply is just a comment
  // with a parent, and a moderator works the same queue for both.
  'comment',
  'site',
  'evidence',
  'media',
] as const;
export type AbuseReportTargetType = (typeof ABUSE_REPORT_TARGET_TYPES)[number];

/** Input accepted when a member of the public files a report. */
export interface CreateAbuseReportInput {
  targetType: AbuseReportTargetType;
  targetId: string;
  reasonCode: AbuseReportReason;
  details?: string | null;
}

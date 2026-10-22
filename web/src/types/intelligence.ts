/**
 * Stage 11 — Geoscience Intelligence client types.
 *
 * These mirror the public DTOs from `src/ai/geoscience-intelligence.types.ts`
 * and `src/types/community.types.ts`. The client renders the intelligence
 * layer but must never merge its evidence sources: a user report, an AI
 * inference, a community suggestion, an expert review and a scientific
 * confirmation stay separate kinds of statement with separate wording.
 */

/** What produced a piece of evidence. See the server type for the rules. */
export type EvidenceSource =
  | 'observed'
  | 'user_reported'
  | 'ai_inferred'
  | 'community_suggested'
  | 'expert_reviewed'
  | 'scientific_confirmation'
  | 'nearby_observation'
  | 'geological_context';

export interface IntelligenceEvidenceItem {
  claim: string;
  source: EvidenceSource;
}

/** One candidate interpretation, with the evidence for and against it. */
export interface HypothesisOption {
  label: string;
  evidenceFor: IntelligenceEvidenceItem[];
  evidenceAgainst: IntelligenceEvidenceItem[];
}

/** A safe public reference to a nearby observation (never private data). */
export interface NearbyObservationRef {
  passport_id: string;
  observation_category: string;
  observation_subcategory: string;
  possible_name: string | null;
  confidence: string;
  district: string | null;
  distance_km: number | null;
  created_at: string;
}

/** What kind of evidence each source genuinely provided for a reading. */
export interface ContextUsed {
  userDescription: boolean;
  nearbyObservations: boolean;
  site: boolean;
  community: boolean;
  geologicalContext: boolean;
  expertReview: boolean;
}

/** The fully assembled Stage 11 interpretation served by `/intelligence`. */
export interface GeoscienceIntelligenceResult {
  base: {
    observationCategory: string;
    observationSubcategory: string;
    primaryClassification: string;
    confidence: string;
    confidenceScore: number;
  };
  contextUsed: ContextUsed;
  observedFromMedia: string[];
  userReported: string[];
  primaryHypothesis: string;
  primaryEvidence: IntelligenceEvidenceItem[];
  alternativeHypotheses: HypothesisOption[];
  uncertainties: string[];
  missingEvidence: string[];
  followUpQuestions: string[];
  recommendedObservations: string[];
  recommendedFieldChecks: string[];
  scientificLimitations: string;
  safetyNote: string;
  geologicalContextNote: string;
  confidenceStatement: string;
  summary: string;
}

/**
 * The bounded context served by `/context`. Every source reports an honest
 * available/unavailable state; nothing here is synthesized from absent data.
 */
export interface ObservationIntelligenceContext {
  nearbyObservations: {
    available: boolean;
    count: number;
    items: NearbyObservationRef[];
    note: string;
  };
  site: {
    available: boolean;
    siteId: string | null;
    siteCode: string | null;
    title: string | null;
    observationCount: number | null;
  } | null;
  community: {
    available: boolean;
    questionCount: number;
    evidenceCount: number;
    visitCount: number;
    note: string;
  };
  geologicalContext: {
    available: boolean;
    note: string;
  };
  expertReview: {
    available: boolean;
    reviewer: string | null;
    verdict: string | null;
  } | null;
}

/** `/nearby` and `/similar` share the same list envelope. */
export interface RelatedObservationsResponse {
  available: boolean;
  count: number;
  radius_km?: number;
  items: NearbyObservationRef[];
  note: string;
}

export type ResearchOpportunityBasis = 'observation' | 'site' | 'community';

/**
 * A research opportunity surfaced to the public. The label and disclaimer are
 * mandatory wording; every field is derived from real rows, never from absence.
 */
export interface ResearchOpportunity {
  opportunity_id: string;
  public_id: string;
  label: string;
  basis: ResearchOpportunityBasis;
  question: string;
  summary: string;
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
  highest_evidence_state: string | null;
  status: string;
  created_at: string;
  last_activity_at: string;
  disclaimer: string;
}

export interface ResearchOpportunitiesResponse {
  count: number;
  items: ResearchOpportunity[];
}
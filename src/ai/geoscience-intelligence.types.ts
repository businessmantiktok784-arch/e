/**
 * Stage 11 — Geoscience Intelligence types.
 *
 * Earth Talk's intelligence layer assembles a context-aware interpretation from
 * every available source of evidence, while keeping those sources permanently
 * distinguishable. A user report, an AI inference, a community suggestion, an
 * expert review and a scientific confirmation are different kinds of statement
 * with different reliability, and the platform never merges them.
 */

import type { GeoscienceCategory } from './geoscience-taxonomy.js';
import type { RockConfidence } from './geological.types.js';

/**
 * What produced a piece of evidence.
 *
 * These are deliberately not ranked into one scale. "Expert review" outranks an
 * AI inference for reliability, but they still say different things, and the UI
 * must keep showing that difference instead of folding everything into one
 * "confidence" number.
 */
export type EvidenceSource =
  /** Directly seen in the media by the AI. */
  | 'observed'
  /** Reported by the person who sent the media. Never an AI observation. */
  | 'user_reported'
  /** Reasoned by the AI from observed features. */
  | 'ai_inferred'
  /** Raised by the community; never a scientific confirmation. */
  | 'community_suggested'
  /** Placed by an authorised expert review. */
  | 'expert_reviewed'
  /** Established through formal scientific confirmation. */
  | 'scientific_confirmation'
  /** Found in the set of publicly available nearby observations. */
  | 'nearby_observation'
  /** Derived from legitimately configured geological datasets. */
  | 'geological_context';

export interface IntelligenceEvidenceItem {
  claim: string;
  source: EvidenceSource;
}

/**
 * One hypothesis, with the evidence that supports and weakens it.
 *
 * A hypothesis is a candidate interpretation, not a conclusion. The presence of
 * `evidence_against` is expected and is not a failure; it is what makes the
 * hypothesis honest.
 */
export interface HypothesisOption {
  label: string;
  evidenceFor: IntelligenceEvidenceItem[];
  evidenceAgainst: IntelligenceEvidenceItem[];
}

/** A single media item offered for analysis. */
export interface MediaPart {
  buffer: Buffer;
  mimeType: string;
  /** What kind of evidence this view is expected to provide. */
  viewType:
    | 'overview'
    | 'closeup'
    | 'texture'
    | 'fresh_surface'
    | 'outcrop'
    | 'environmental'
    | 'video_frame';
}

/**
 * Contextual evidence collected from the platform itself.
 *
 * Every collection is bounded and returns honest empty/unavailable states when
 * the source is not reachable or nothing is public. No field is allowed to be
 * synthesized from nothing.
 */
export interface ObservationIntelligenceContext {
  /** Publicly available observations near the observation, distance-bounded. */
  nearbyObservations: {
    available: boolean;
    count: number;
    items: NearbyObservationRef[];
    note: string;
  };
  /** The geological site the observation is attached to, if any. */
  site: {
    available: boolean;
    siteId: string | null;
    siteCode: string | null;
    title: string | null;
    observationCount: number | null;
  } | null;
  /** Public community activity (questions, evidence, visits) tied to it. */
  community: {
    available: boolean;
    questionCount: number;
    evidenceCount: number;
    visitCount: number;
    note: string;
  };
  /**
   * Whether legitimate geological datasets (units, lithology, faults, mineral
   * occurrences…) are actually configured. When false, the only allowed note is
   * "Geological context unavailable for this observation."
   */
  geologicalContext: {
    available: boolean;
    note: string;
  };
  /** The most recent public expert review, if one has been published. */
  expertReview: {
    available: boolean;
    reviewer: string | null;
    verdict: string | null;
  } | null;
}

/** A safe public reference to a nearby observation (never private data). */
export interface NearbyObservationRef {
  passport_id: string;
  observation_category: GeoscienceCategory | string;
  observation_subcategory: string;
  possible_name: string | null;
  confidence: RockConfidence;
  district: string | null;
  distance_km: number | null;
  created_at: string;
}

/**
 * Extra structured fields requested from the model on top of the standard
 * analysis. The base fields remain authoritative; these are optional and are
 * sanitised before they are allowed anywhere near the passport.
 */
export interface RawIntelligenceExtras {
  hypotheses: { label: string; evidence_for: string[]; evidence_against: string[] }[];
  missing_evidence: string[];
  recommended_observations: string[];
  recommended_field_checks: string[];
  user_observed: string[];
}

/** The fully assembled Stage 11 interpretation. */
export interface GeoscienceIntelligenceResult {
  /** The base analysis this builds on. */
  base: {
    observationCategory: GeoscienceCategory;
    observationSubcategory: string;
    primaryClassification: string;
    confidence: RockConfidence;
    confidenceScore: number;
  };
  /** Which evidence sources were actually available and used. */
  contextUsed: {
    userDescription: boolean;
    nearbyObservations: boolean;
    site: boolean;
    community: boolean;
    geologicalContext: boolean;
    expertReview: boolean;
  };
  /** Evidence declared without a source is treated as invalid. */
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
  /** Mandatory wording: AI confidence is not a calibrated probability. */
  confidenceStatement: string;
  /** A short, honest narrative tying the interpretation to the evidence. */
  summary: string;
}

/** Valid view types a contributor may send. */
export const VALID_VIEW_TYPES: MediaPart['viewType'][] = [
  'overview',
  'closeup',
  'texture',
  'fresh_surface',
  'outcrop',
  'environmental',
  'video_frame',
];

/** Mandatory wording attached to every AI-confidence statement. */
export const AI_CONFIDENCE_STATEMENT =
  'AI confidence is an internal model indicator and is not a calibrated probability.';

/** Mandatory wording when no geological dataset is configured. */
export const GEOLOGICAL_CONTEXT_UNAVAILABLE =
  'Geological context unavailable for this observation.';

/** Used when an expert review exists and differs from the AI reading. */
export const EXPERT_SEPARATION_NOTE =
  'The expert review is a separate kind of statement from the AI interpretation. Where they differ, the expert review carries more weight for identification, and the difference is shown rather than reconciled.';
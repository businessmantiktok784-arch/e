/**
 * Types for Earth Talk geological / geoscience AI analysis.
 *
 * The analysis is category-first: a photograph is classified into a geoscience
 * category and subcategory before any interpretation is attempted, so a fossil,
 * a fault, a spring and a rock all travel the same pipeline without the
 * pipeline pretending they are all rocks.
 *
 * Every existing rock-analysis field is preserved. A category that is not
 * rock-like leaves those fields honestly empty rather than filling them with a
 * plausible-looking value.
 */

import type { GeoscienceCategory } from './geoscience-taxonomy.js';

/**
 * Legacy rock-only classification, retained for backward compatibility with the
 * original Stage 2 schema and with existing Geoscience Passport rows.
 */
export type RockClassification =
  | 'igneous'
  | 'sedimentary'
  | 'metamorphic'
  | 'unclassified'
  | 'non_rock'
  | 'insufficient_image';

export type RockConfidence = 'high' | 'moderate' | 'low' | 'insufficient';

/**
 * Free-text value used for `primary_classification`-adjacent rock fields.
 *
 * Kept as the legacy union so stored Earth Talk rows remain readable; the
 * category-first fields below are what new observations use.
 */
export interface GeoscienceAnalysisResult {
  /** Legacy flag. True only when the subject is a rock or rock-like material. */
  is_rock: boolean;

  // ---------------------------------------------------------------------------
  // Category-first fields (the geoscience vocabulary)
  // ---------------------------------------------------------------------------

  /** The kind of geoscience observation this is. Set before interpretation. */
  observation_category: GeoscienceCategory;

  /** The detail within the category. Always valid for its category. */
  observation_subcategory: string;

  /** Narrower machine-facing type, e.g. `rock_specimen`, `possible_fossil`. */
  observation_type: string;

  /** True when the image is genuinely relevant to geoscience. */
  is_geoscience_relevant: boolean;

  /**
   * One-line preliminary interpretation. Hedged language is expected and
   * correct; a confident commercial, laboratory or safety claim is not.
   */
  primary_interpretation: string;

  /** Plain-language geological setting the feature appears consistent with. */
  geological_context: string;

  /** Features that actually support the interpretation (the "observed" side). */
  diagnostic_features: string[];

  /** What remains unknown after the assessment. */
  uncertainties: string[];

  /** Specific questions that would advance the interpretation. */
  questions_for_user: string[];

  /** Blocked phrases found in free text, for audit. Never published. */
  blocked_claims: string[];

  // ---------------------------------------------------------------------------
  // Existing rock-analysis fields, preserved verbatim for compatibility.
  // Empty / null for categories that are not rock-like.
  // ---------------------------------------------------------------------------

  primary_classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  observed_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;

  /**
   * The model that actually produced this result.
   *
   * Not always the requested model: on a quota error the service falls back to
   * a smaller one. Recording the served model is what lets a validation run
   * report honestly - without it, a run can be attributed to a model that never
   * answered a single specimen.
   */
  model_used: string;
}

export type GeologicalErrorCategory =
  | 'WHATSAPP_MEDIA_ERROR'
  | 'IMAGE_DOWNLOAD_ERROR'
  | 'IMAGE_VALIDATION_ERROR'
  | 'MEDIA_VALIDATION_ERROR'
  | 'GEMINI_AUTH_ERROR'
  | 'GEMINI_RATE_LIMIT_ERROR'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_INVALID_RESPONSE'
  | 'GEMINI_PROHIBITED_CLAIM'
  | 'INTERNAL_ERROR';

export class GeologicalAnalysisError extends Error {
  constructor(
    public readonly category: GeologicalErrorCategory,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GeologicalAnalysisError';
  }
}

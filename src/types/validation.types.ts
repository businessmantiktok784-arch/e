import type { RockClassification, RockConfidence } from '../ai/geological.types.js';

export type DatasetStatus = 'draft' | 'active' | 'locked' | 'archived';
export type TargetClassificationLevel = 'broad_class' | 'lithology';

export interface ValidationDataset {
  id: string;
  dataset_code: string; // e.g. ET-VAL-2026-V1
  name: string;
  description: string;
  version: string;
  status: DatasetStatus;
  target_classification_level: TargetClassificationLevel;
  created_by: string;
  created_at: string;
  updated_at: string;
  /**
   * When the dataset was frozen. Null until locked. Retained separately from
   * `updated_at` so the moment of the freeze stays verifiable.
   */
  locked_at?: string | null;
  sample_count?: number;
}

export type ValidationSourceType =
  | 'field_collected'
  | 'laboratory_reference'
  | 'university_collection'
  | 'museum_reference'
  | 'existing_verified_sample';

export type ValidationSampleStatus = 'registered' | 'labeled' | 'disputed' | 'locked' | 'excluded';

export type ValidationDataPartition = 'reference' | 'evaluation' | 'held_out_test';

export interface ValidationImage {
  id: string;
  sample_id: string;
  storage_path: string;
  image_hash: string; // SHA-256 for duplicate detection
  image_width?: number;
  image_height?: number;
  file_size_bytes?: number;
  lighting_condition?: 'natural_daylight' | 'direct_sun' | 'overcast' | 'diffuse_lab' | 'smartphone_flash' | 'mixed';
  background_condition?: 'neutral_grey' | 'scale_grid' | 'field_ground' | 'white_card' | 'natural_outcrop';
  view_type: 'overview' | 'closeup' | 'texture' | 'fresh_surface' | 'multiple_angles';
  scale_reference_present: boolean;
  quality_status: 'accepted' | 'rejected' | 'needs_review';
  quality_notes?: string;
  created_at: string;
}

export type ReferenceMethod =
  | 'expert_visual_identification'
  | 'laboratory_confirmed'
  | 'existing_curated_reference'
  | 'consensus_expert_review';

export interface ValidationReferenceLabel {
  id: string;
  sample_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_role: string;
  reviewer_organization: string;
  classification: RockClassification;
  rock_name?: string | null;
  confidence: RockConfidence;
  diagnostic_features: string[];
  notes?: string | null;
  reference_method: ReferenceMethod;
  created_at: string;
}

export interface SampleConsensus {
  sample_id: string;
  majority_classification: RockClassification | null;
  agreement_count: number;
  reviewer_count: number;
  consensus_percentage: number;
  is_disputed: boolean;
  status_label: 'unreviewed' | 'single_expert' | 'consensus' | 'disputed';
}

export interface ValidationSample {
  id: string;
  dataset_id: string;
  sample_code: string; // e.g. RT-VAL-0001
  source_type: ValidationSourceType;
  collection_date?: string | null;
  country: string;
  district?: string | null;
  site_description?: string | null;
  specimen_notes?: string | null;
  sample_status: ValidationSampleStatus;
  data_partition: ValidationDataPartition;
  research_use_consent: boolean;
  image_use_consent: boolean;
  created_at: string;
  updated_at: string;

  // Linked items
  images?: ValidationImage[];
  reference_labels?: ValidationReferenceLabel[];
  consensus?: SampleConsensus;
}

export type AiRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ValidationAiRun {
  id: string;
  dataset_id: string;
  run_code: string; // e.g. RUN-2026-VAL-001
  model_name: string;
  prompt_version: string;
  analysis_version: string;
  application_version: string;
  status: AiRunStatus;
  total_samples: number;
  successful_samples: number;
  failed_samples: number;
  /**
   * True when the run scored only part of the dataset because the per-run sample
   * cap was reached. A partial run must never be presented as a dataset-wide
   * evaluation, so the flag travels with the record.
   */
  is_partial_run: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface ValidationAiPrediction {
  id: string;
  run_id: string;
  sample_id: string;
  image_id?: string | null;
  is_rock: boolean;
  classification: RockClassification;
  possible_name?: string | null;
  confidence: RockConfidence;
  confidence_score?: number | null;
  observed_features: string[];
  reasoning: string;
  limitations: string[];
  response_time_ms: number;
  model_name: string;
  prompt_version: string;
  created_at: string;
}

export type ValidationErrorCategory =
  | 'visual_similarity'
  | 'poor_image_quality'
  | 'lighting'
  | 'weathering'
  | 'mixed_or_complex_sample'
  | 'insufficient_context'
  | 'expert_disagreement'
  | 'non_rock_confusion'
  | 'unknown';

export interface ValidationErrorRecord {
  id: string;
  run_id: string;
  sample_id: string;
  reference_classification: string;
  ai_classification: string;
  ai_confidence: string;
  error_category: ValidationErrorCategory;
  error_notes?: string | null;
  annotated_by?: string | null;
  created_at: string;
}

export interface ConfusionMatrixCell {
  reference_class: string;
  predicted_class: string;
  count: number;
}

export interface ClassPerformanceMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
}

export interface ConfidenceTierAnalysis {
  tier: 'high' | 'moderate' | 'low';
  total: number;
  correct: number;
  accuracy_pct: number;
}

/**
 * What a run is trying to say. Statistical readiness depends on the intended
 * claim, not on a single universal number: "there may be a signal here" needs
 * far less evidence than "this dataset validates the model across classes".
 */
export type EvaluationClaim =
  | 'exploratory_signal'
  | 'class_level_performance'
  | 'dataset_validation';

/**
 * How much confidence the evaluation engine has in the figures.
 *
 * - `not_measured`: no usable scored pair exists; every figure is null.
 * - `insufficient_data`: some pairs exist but too few to publish a figure.
 * - `preliminary`: figures are computed from real data, but the sample-size
 *   policy for the intended claim is not yet satisfied. They may be shown, but
 *   they are not a validated result.
 * - `reportable`: the configured policy's criteria are all met for the intended
 *   claim, so the figures may be reported as such.
 */
export type EvaluationStatus =
  | 'not_measured'
  | 'insufficient_data'
  | 'preliminary'
  | 'reportable';

/**
 * Configurable sample-size policy.
 *
 * None of these is a law of nature. They are documented, operator-tunable
 * thresholds that describe what the team is willing to stand behind for a given
 * claim. The earlier implementation hard-coded `>= 3` as "scientifically
 * sufficient", which was neither configurable nor defensible.
 */
export interface SampleSizePolicy {
  /** Minimum scored pairs before any figure is published at all. */
  metric_min_evaluated_pairs: number;
  /** Minimum scored pairs to support a claim about overall performance. */
  min_answered_total: number;
  /** Minimum reference support for every evaluated class. */
  min_per_class_support: number;
  /** Minimum reference consensus percentage trusted for scoring. */
  min_reference_agreement_pct: number;
  /** Maximum share of excluded samples before coverage is too low to report. */
  max_excluded_ratio_pct: number;
}

export interface EvaluationReadinessCriterion {
  criterion: string;
  requirement: string;
  observed: string;
  met: boolean;
}

export interface EvaluationReadiness {
  status: EvaluationStatus;
  intended_claim: EvaluationClaim;
  policy: SampleSizePolicy;
  criteria: EvaluationReadinessCriterion[];
  /** Human-readable reasons the intended claim is not yet reportable. */
  blocking_reasons: string[];
  note: string;
}

/**
 * The full accounting behind the metrics, so a reader can see the denominators
 * rather than only the ratios. Reported even when the metrics themselves are
 * null, so "not measured" is distinguishable from "measured as zero".
 */
export interface EvaluationCounts {
  attempted_predictions: number;
  /** Predictions with a usable, undisputed rock reference. */
  eligible_pairs: number;
  /** Eligible pairs the model actually answered with a rock class. */
  scored_pairs: number;
  correct: number;
  incorrect: number;
  /** The model withheld or gave a non-rock answer on an eligible specimen. */
  abstentions: number;
  excluded_no_reference: number;
  excluded_disputed_reference: number;
  excluded_non_rock_reference: number;
  excluded_abstention: number;
  /** Scored pairs as a share of eligible pairs. */
  answered_coverage_pct: number | null;
  /** Scored pairs as a share of every sample in the dataset. */
  dataset_coverage_pct: number | null;
  /** Abstentions as a share of eligible pairs. */
  abstention_rate_pct: number | null;
}

export interface EvaluationMetricResult {
  run_id: string;
  dataset_code: string;
  dataset_version: string;
  model_name: string;
  prompt_version: string;
  evaluation_timestamp: string;
  total_evaluated_samples: number;
  valid_samples: number;
  excluded_samples: number;
  correct_classifications: number;
  incorrect_classifications: number;
  /**
   * Performance figures.
   *
   * `null` means "not computable from real data". It never means zero accuracy.
   * When `sufficient_sample_size` is false these are all `null` rather than a
   * fabricated 0, because a 0% F1 would read as a measured catastrophic result
   * when in fact nothing was measured.
   */
  agreement_rate_pct: number | null;
  macro_precision: number | null;
  macro_recall: number | null;
  macro_f1: number | null;
  weighted_f1: number | null;
  /**
   * True when these metrics came from real specimen images scored by the real
   * configured model against real reference labels. False for any simulated or
   * synthetic source, in which case the metrics are meaningless.
   */
  metrics_are_real_measurements: boolean;
  per_class_metrics: Record<string, ClassPerformanceMetrics>;
  confusion_matrix: ConfusionMatrixCell[];
  confidence_analysis: ConfidenceTierAnalysis[];
  sufficient_sample_size: boolean;
  /**
   * The full accounting behind the metrics (denominators, coverage,
   * abstentions). Present even when the metrics are null.
   */
  counts: EvaluationCounts;
  /**
   * How much confidence the figures carry for the intended claim, plus the
   * policy and per-criterion evidence behind that judgement.
   */
  readiness: EvaluationReadiness;
  /**
   * True when the underlying run scored only part of the dataset because the
   * per-run sample cap was reached. The metrics are real measurements of the
   * subset that was scored, but they are not a validation of the whole dataset
   * and must never be presented as one.
   */
  is_partial_run: boolean;
  /**
   * True when the run's predictions came from more than one model - for example
   * when a quota error forced the analysis service onto a fallback model
   * mid-run. A single accuracy figure pooling two different models describes
   * neither, so the run must not be presented as a controlled evaluation.
   */
  is_mixed_model_run: boolean;
  /** Every model that actually served a prediction in this run. */
  models_observed: string[];
  disclaimer: string;
}

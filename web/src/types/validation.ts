import type { RockClassification, RockConfidence } from './public.js';

export type DatasetStatus = 'draft' | 'active' | 'locked' | 'archived';
export type TargetClassificationLevel = 'broad_class' | 'lithology';

export interface ValidationDataset {
  id: string;
  dataset_code: string;
  name: string;
  description: string;
  version: string;
  status: DatasetStatus;
  target_classification_level: TargetClassificationLevel;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** When the dataset was frozen. Null until locked. */
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

export interface ValidationImage {
  id: string;
  sample_id: string;
  storage_path: string;
  image_hash: string;
  image_width?: number;
  image_height?: number;
  file_size_bytes?: number;
  lighting_condition?: string;
  background_condition?: string;
  view_type: 'overview' | 'closeup' | 'texture' | 'fresh_surface' | 'multiple_angles';
  scale_reference_present: boolean;
  quality_status: 'accepted' | 'rejected' | 'needs_review';
  quality_notes?: string;
  created_at: string;
}

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
  reference_method: string;
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
  sample_code: string;
  source_type: ValidationSourceType;
  collection_date?: string | null;
  country: string;
  district?: string | null;
  site_description?: string | null;
  specimen_notes?: string | null;
  sample_status: ValidationSampleStatus;
  data_partition: 'reference' | 'evaluation' | 'held_out_test';
  research_use_consent: boolean;
  image_use_consent: boolean;
  created_at: string;
  updated_at: string;
  images?: ValidationImage[];
  reference_labels?: ValidationReferenceLabel[];
  consensus?: SampleConsensus;
}

export interface ValidationAiRun {
  id: string;
  dataset_id: string;
  run_code: string;
  model_name: string;
  prompt_version: string;
  analysis_version: string;
  application_version: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_samples: number;
  successful_samples: number;
  failed_samples: number;
  /** True when the run scored only a subset of its dataset. */
  is_partial_run: boolean;
  started_at?: string | null;
  completed_at?: string | null;
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
   * `null` means "not measured", never zero. These were typed as plain `number`
   * here, which is what allowed the dashboard to render a figure
   * unconditionally - a 0% accuracy would then be indistinguishable from an
   * accuracy that was never measured.
   */
  agreement_rate_pct: number | null;
  macro_precision: number | null;
  macro_recall: number | null;
  macro_f1: number | null;
  weighted_f1: number | null;
  per_class_metrics: Record<string, ClassPerformanceMetrics>;
  confusion_matrix: ConfusionMatrixCell[];
  confidence_analysis: ConfidenceTierAnalysis[];
  sufficient_sample_size: boolean;
  /**
   * False when these figures did not come from real specimen images scored by
   * the configured model. Nothing in Earth Talk should present them as a
   * measured accuracy when this is false.
   */
  metrics_are_real_measurements: boolean;
  /** True when the run covered only a subset of its dataset. */
  is_partial_run: boolean;
  /** True when more than one model served predictions in this run. */
  is_mixed_model_run: boolean;
  /** Every model that actually served a prediction in this run. */
  models_observed: string[];
  disclaimer: string;
}

export interface ValidationErrorRecord {
  id: string;
  run_id: string;
  sample_id: string;
  reference_classification: string;
  ai_classification: string;
  ai_confidence: string;
  error_category: string;
  error_notes?: string | null;
  annotated_by?: string | null;
  created_at: string;
}

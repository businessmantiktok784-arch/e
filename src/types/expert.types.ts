import type { RockClassification, RockConfidence } from '../ai/geological.types.js';
import type { VerificationStatus, PublicationStatus } from './database.types.js';

export type ExpertRole = 'expert' | 'lead_geologist' | 'admin';

export interface ExpertUser {
  id: string;
  email: string;
  name: string;
  role: ExpertRole;
  organization: string;
  avatar_url?: string;
}

export interface ExpertVerificationRecord {
  id: string;
  observation_id: string;
  passport_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_role: ExpertRole;
  reviewer_organization: string;
  status: VerificationStatus;
  expert_classification: RockClassification | null;
  expert_rock_name: string | null;
  expert_confidence: RockConfidence | null;
  expert_observed_features: string[];
  expert_notes: string | null;
  scientific_remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditAction =
  | 'assigned_review'
  | 'status_changed'
  | 'verified'
  | 'rejected'
  | 'visibility_toggled'
  | 'comment_added';

export interface VerificationAuditLogRecord {
  id: string;
  observation_id: string;
  passport_id: string;
  reviewer_id: string;
  reviewer_name: string;
  action: AuditAction;
  previous_status: VerificationStatus;
  new_status: VerificationStatus;
  notes: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ExpertReviewInput {
  verification_status: VerificationStatus;
  expert_classification?: RockClassification;
  expert_rock_name?: string;
  expert_confidence?: RockConfidence;
  expert_observed_features?: string[];
  expert_notes?: string;
  scientific_remarks?: string;
  publication_status?: PublicationStatus;
  public_visibility_reason?: 'user_consent' | 'admin_approved' | 'research_demo';
}

export interface ImmutableAiAnalysis {
  is_rock: boolean;
  /**
   * Category decided before interpretation, with its subcategory.
   *
   * Always present on the detail DTO even when the stored row predates the
   * taxonomy, so a reviewer never sees a blank category for the oldest records -
   * which are exactly the ones most likely to be waiting in the queue.
   */
  observation_category: string;
  observation_subcategory: string;
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
  ai_model: string;
  ai_prompt_version: string;
  analysis_version: string;
}

export interface ExpertObservationDetail {
  id: string;
  passport_id: string;
  source: string;
  source_contributor_hash: string; // Anonymized, never phone number
  status: string;
  created_at: string;
  updated_at: string;

  // Immutable AI Record (Never altered by review)
  ai_analysis: ImmutableAiAnalysis;

  // Location Details (with privacy protection)
  location: {
    district: string | null;
    sector: string | null;
    cell: string | null;
    village: string | null;
    precision: 'district' | 'approximate' | 'exact';
    latitude: number | null;
    longitude: number | null;
    is_public: boolean;
  };

  // Media Details
  media: {
    id: string;
    media_type: string;
    mime_type: string;
    secure_url: string;
    created_at: string;
  } | null;

  // Governance & Verification
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  published_at: string | null;
  public_visibility_reason: string | null;

  /**
   * The current position on the eight-state evidence ladder.
   *
   * Kept beside `verification_status` rather than folded into it. A reviewer
   * confirming an identification moves the record to `expert_reviewed`; it does
   * not make the reading scientifically confirmed, and collapsing the two would
   * let a single sign-off claim laboratory authority it never had.
   */
  evidence_state: string | null;

  // Current Active Expert Verification (if any)
  latest_verification: ExpertVerificationRecord | null;

  // Every verification recorded for this observation, newest first.
  verifications_history: ExpertVerificationRecord[];

  // Completeness assessment.
  // Measures structural completeness of the submission only. It is NOT a
  // measure of geological correctness and must never be presented as one.
  data_quality: DataQualityAssessment | null;

  // Audit History
  audit_logs: VerificationAuditLogRecord[];
}

export interface ExpertObservationSummary {
  id: string;
  passport_id: string;
  created_at: string;
  district: string | null;
  ai_classification: RockClassification;
  ai_possible_name: string | null;
  ai_confidence: RockConfidence;
  ai_confidence_score: number;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  expert_rock_name: string | null;
  reviewer_name: string | null;
  has_media: boolean;
}

export interface ExpertFilterOptions {
  status?: VerificationStatus | 'all';
  classification?: RockClassification;
  district?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ExpertReviewStats {
  total_observations: number;
  awaiting_review_count: number; // unverified
  under_review_count: number;
  verified_count: number;
  rejected_count: number;
  verification_rate_pct: number;
  classification_breakdown: Record<string, number>;
  verified_breakdown: Record<string, number>;
}

// ==========================================
// Stage 6: Production & Research Layer Types
// ==========================================

export interface ExpertSessionRecord {
  id: string;
  expert_user_id: string;
  token_hash: string;
  role: ExpertRole;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string;
  ip_hash?: string | null;
  user_agent_hash?: string | null;
}

export type CompletenessCategory = 'high' | 'good' | 'moderate' | 'low';

export interface DataQualityIndicators {
  has_valid_image: boolean;
  image_size_bytes?: number;
  image_mime?: string;
  image_dimensions?: { width: number; height: number };
  image_blur_indicator?: 'sharp' | 'acceptable' | 'blurry';
  image_brightness_indicator?: 'optimal' | 'dim' | 'bright';
  has_coordinates: boolean;
  has_district: boolean;
  has_sector: boolean;
  has_features: boolean;
  feature_count: number;
  has_reasoning: boolean;
  has_limitations: boolean;
  has_expert_review: boolean;
  duplicate_risk_flag: boolean;
  image_sha256?: string;
}

export interface DataQualityAssessment {
  id: string;
  observation_id: string;
  passport_id: string;
  overall_score: number; // 0 - 100
  completeness_category: CompletenessCategory;
  image_quality_score: number;
  classification_score: number;
  location_score: number;
  metadata_score: number;
  duplicate_risk_flag: boolean;
  image_sha256?: string | null;
  indicators: DataQualityIndicators;
  assessed_at: string;
}

export interface ConfusionMatrixCell {
  ai_classification: string;
  expert_classification: string;
  count: number;
}

export interface ClassPerformanceMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface AiVsExpertEvaluation {
  total_expert_reviewed: number;
  eligible_sample_count: number;
  sufficient_sample_size: boolean;
  disclaimer: string;
  overall_agreement_count: number;
  overall_disagreement_count: number;
  agreement_rate_pct: number;
  macro_f1: number;
  confusion_matrix: ConfusionMatrixCell[];
  class_metrics: Record<string, ClassPerformanceMetrics>;
}

export interface GeographicParticipationMetric {
  district: string;
  observation_count: number;
  percentage_of_total: number;
  classifications: Record<string, number>;
  verified_count: number;
}

export interface OperationalMetrics {
  total_requests: number;
  ai_analyses_completed: number;
  /**
   * Operational metrics that are not currently instrumented.
   *
   * `null` means "not measured". It never means zero, and a fabricated constant
   * must never be substituted for a real measurement.
   */
  average_ai_duration_ms: number | null;
  database_operations_count: number | null;
  rate_limit_events_count: number | null;
  metrics_instrumented: boolean;
  metrics_note: string;
  uptime_seconds: number;
}

export interface ResearchAnalyticsSummary {
  dataset_version: string;
  generated_at: string;
  observation_stats: {
    total: number;
    completed: number;
    failed: number;
    rock_count: number;
    non_rock_count: number;
    insufficient_image_count: number;
  };
  classification_stats: Record<string, number>;
  verification_stats: {
    unverified: number;
    under_review: number;
    expert_verified: number;
    rejected: number;
  };
  geographic_stats: {
    total_districts_represented: number;
    total_rwanda_districts: number;
    districts: GeographicParticipationMetric[];
    scientific_note: string;
  };
  temporal_stats: {
    observations_today: number;
    observations_this_week: number;
    observations_this_month: number;
  };
  data_quality_stats: {
    average_score: number;
    score_distribution: {
      high: number;
      good: number;
      moderate: number;
      low: number;
    };
    duplicate_suspects_count: number;
  };
  ai_vs_expert: AiVsExpertEvaluation;
  operational_metrics: OperationalMetrics;
}

export interface ResearchDatasetVersionRecord {
  id: string;
  version_tag: string;
  record_count: number;
  schema_version: string;
  description: string;
  filters_applied: Record<string, unknown>;
  exported_by_actor_id: string;
  created_at: string;
}

export interface ComplianceAuditRecord {
  id: string;
  event_id: string;
  actor_id: string;
  actor_role: string;
  event_type: string;
  target_type: string;
  target_id: string;
  request_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}


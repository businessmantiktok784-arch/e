import type { RockClassification, RockConfidence } from './public.js';

export type ExpertRole = 'expert' | 'lead_geologist' | 'admin';

export interface ExpertUser {
  id: string;
  email: string;
  name: string;
  role: ExpertRole;
  organization: string;
  avatar_url?: string;
}

export type ExpertVerificationStatus = 'unverified' | 'under_review' | 'expert_verified' | 'rejected';
export type ExpertPublicationStatus = 'private' | 'pending' | 'public' | 'hidden';

export interface VerificationAuditLogRecord {
  id: string;
  observation_id: string;
  passport_id: string;
  reviewer_id: string;
  reviewer_name: string;
  action: string;
  previous_status: ExpertVerificationStatus;
  new_status: ExpertVerificationStatus;
  notes: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ExpertVerificationRecord {
  id: string;
  observation_id: string;
  passport_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_role: ExpertRole;
  reviewer_organization: string;
  status: ExpertVerificationStatus;
  expert_classification: RockClassification | null;
  expert_rock_name: string | null;
  expert_confidence: RockConfidence | null;
  expert_observed_features: string[];
  expert_notes: string | null;
  scientific_remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImmutableAiAnalysis {
  is_rock: boolean;
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
  source_contributor_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
  ai_analysis: ImmutableAiAnalysis;
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
  media: {
    id: string;
    media_type: string;
    mime_type: string;
    secure_url: string;
    created_at: string;
  } | null;
  verification_status: ExpertVerificationStatus;
  publication_status: ExpertPublicationStatus;
  published_at: string | null;
  public_visibility_reason: string | null;
  latest_verification: ExpertVerificationRecord | null;
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
  verification_status: ExpertVerificationStatus;
  publication_status: ExpertPublicationStatus;
  expert_rock_name: string | null;
  reviewer_name: string | null;
  has_media: boolean;
}

export interface ExpertReviewStats {
  total_observations: number;
  awaiting_review_count: number;
  under_review_count: number;
  verified_count: number;
  rejected_count: number;
  verification_rate_pct: number;
  classification_breakdown: Record<string, number>;
  verified_breakdown: Record<string, number>;
}

export interface ExpertReviewInput {
  verification_status: ExpertVerificationStatus;
  expert_classification?: RockClassification;
  expert_rock_name?: string;
  expert_confidence?: RockConfidence;
  expert_observed_features?: string[];
  expert_notes?: string;
  scientific_remarks?: string;
  publication_status?: ExpertPublicationStatus;
  public_visibility_reason?: 'user_consent' | 'admin_approved' | 'research_demo';
}

// ==========================================
// Stage 6: Research Analytics & Quality Types
// ==========================================

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
  average_ai_duration_ms: number;
  database_operations_count: number;
  rate_limit_events_count: number;
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


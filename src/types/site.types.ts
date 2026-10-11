import type { EvidenceState, SiteGroupingBasis, SiteTimelineEntry } from './community.types.js';
import type { RockClassification, RockConfidence } from '../ai/geological.types.js';
import type { GeoscienceCategory } from '../ai/geoscience-taxonomy.js';

/**
 * Geological site model.
 *
 * An observation and a site are different things. One site aggregates many
 * observations, visits, media items, questions and investigations.
 *
 * Site grouping is never inferred from a distance threshold and then presented
 * as fact. `grouping_basis` records whether a grouping was curated by the
 * platform owner, backed by field evidence, or is merely a suggestion.
 */

export interface GeologicalSiteRecord {
  id: string;
  site_code: string;
  title: string;
  description: string | null;
  grouping_basis: SiteGroupingBasis;
  grouping_evidence: string | null;
  district: string | null;
  sector: string | null;
  latitude: number | null;
  longitude: number | null;
  public_location_precision: 'district' | 'approximate' | 'exact';
  is_public: boolean;
  status: 'active' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
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
  observed_classifications: RockClassification[];
  districts_covered: string[];
  /** True when this is a labelled demonstration site served in demo mode. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicObservationRef {
  passport_id: string;
  /**
   * What was observed, before the legacy rock classification.
   *
   * A site can hold a fossil, a cave and an ore-showing sighting, and
   * `classification` alone renders all three as rock types. The category is the
   * honest first label; `classification` stays for pre-taxonomy compatibility.
   */
  observation_category: GeoscienceCategory;
  observation_subcategory: string;
  classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  evidence_state: EvidenceState;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

/**
 * Everything the Site Explorer needs in one request.
 *
 * The AI interpretation, the community record, and any expert review are
 * returned as three separate blocks. They are never merged: community opinion
 * does not overwrite an AI result, and neither overwrites a review.
 */
export interface SiteExplorerPayload {
  site: PublicSiteSummary;
  observations: PublicObservationRef[];
  timeline: SiteTimelineEntry[];
  nearby: NearbyObservation[];
  ai_interpretation: AiInterpretationBlock | null;
  community: SiteCommunityBlock;
  expert_review: ExpertReviewBlock | null;
}

export interface AiInterpretationBlock {
  passport_id: string;
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
  disclaimer: string;
}

export interface SiteCommunityBlock {
  investigation_count: number;
  question_count: number;
  evidence_count: number;
  visit_count: number;
  vote_count: number;
  participants: number;
  /** Community opinion only. Always accompanied by the community disclaimer. */
  vote_distribution: Array<{ option: string; count: number; share_pct: number }>;
  note: string;
}

export interface ExpertReviewBlock {
  reviewer_label: string;
  identity_published: boolean;
  status: string;
  expert_classification: RockClassification | null;
  expert_rock_name: string | null;
  expert_confidence: RockConfidence | null;
  expert_observed_features: string[];
  expert_notes: string | null;
  scientific_remarks: string | null;
  evidence_basis: string | null;
  review_date: string | null;
  created_at: string;
}

export interface NearbyObservation {
  passport_id: string;
  classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  evidence_state: EvidenceState;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  /** Straight-line distance in kilometres, rounded to 1 decimal. */
  distance_km: number;
}

// ============================================================================
// GIS layer & basemap registry
// ============================================================================

/**
 * Category of a GIS layer.
 *
 * `earth_talk` is the current name for the platform's own observation layers.
 * `rock_talk` is retained because migration 011 wrote it into the database as a
 * CHECK-constrained enum on `gis_layers.category`, and rows using it may still
 * exist in a deployed instance. Rewriting historical rows for a cosmetic rename
 * would risk the existing migrations and data for no functional gain, so the
 * old value stays readable and new writes should use `earth_talk`.
 */
export type GisLayerCategory = 'earth_talk' | 'rock_talk' | 'classification' | 'geological' | 'base';

export interface GisLayerDefinition {
  id: string;
  display_name: string;
  category: GisLayerCategory;
  enabled: boolean;
  /** null means no legitimate dataset is configured for this layer. */
  data_source: string | null;
  source_attribution: string | null;
  sort_order: number;
  /**
   * Why the layer cannot be shown, when it cannot.
   * Either 'data_source_not_configured' or null.
   */
  unavailable_reason: 'data_source_not_configured' | null;
}

export const LAYER_UNAVAILABLE_LABEL = 'Data source not configured';

/**
 * Basemap definitions.
 *
 * Only styles with a known, attributable, key-free source are listed. Private
 * API keys must never be referenced from the browser bundle.
 */
export interface BasemapDefinition {
  id: string;
  display_name: string;
  style_url: string;
  attribution: string;
  /** Two hex colours used to tint the GIS chrome to match the basemap. */
  theme: 'light' | 'dark';
  max_zoom: number;
}

export const NO_DATA_LABEL = 'No data available yet.';

/**
 * Public Observation API types for the web client.
 *
 * These mirror `src/types/public.types.ts`, which is the contract the API
 * actually serves. The fields the server sends but this file omits are the ones
 * that break silently: a missing optional field type-checks as `undefined`, and
 * a component that renders it shows nothing rather than an error.
 */

export type RockClassification =
  | 'igneous'
  | 'sedimentary'
  | 'metamorphic'
  | 'unclassified'
  | 'non_rock'
  | 'insufficient_image';

export type RockConfidence = 'high' | 'moderate' | 'low' | 'insufficient';
/** Mirrors `src/types/public.types.ts`, including a withheld location. */
export type PublicLocationPrecision = 'private' | 'district' | 'approximate' | 'exact';
export type PublicVerificationStatus = 'unverified' | 'expert_verified';

export type PublicObservationSummary = {
  passport_id: string;
  /** Category decided before interpretation. 'rock' for the historical records. */
  observation_category: string;
  observation_subcategory: string;
  /** One-line preliminary interpretation, in cautious language. */
  primary_interpretation: string | null;
  classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  verification_status: PublicVerificationStatus;
  /**
   * How far this reading has actually been checked. Separate from
   * `verification_status`, which only records whether an expert looked at it.
   */
  evidence_state?: string | null;
  district: string | null;
  location_precision: PublicLocationPrecision;
  latitude?: number;
  longitude?: number;
  created_at: string;
  published_at?: string | null;
  /** Contributor-chosen title, when the post carries one. */
  post_title?: string | null;
  /**
   * True only for a labelled demonstration record. A demonstration entry is
   * interface content, never a collected observation, and every badge the map
   * and the list draw is built from this flag rather than from a guess.
   */
  is_demo?: boolean;
};;

export type PublicObservationDetail = PublicObservationSummary & {
  geological_context?: string | null;
  observed_features: string[];
  diagnostic_features?: string[];
  reasoning: string;
  limitations: string[];
  uncertainties?: string[];
  recommended_next_steps: string[];
  safety_note: string;
  data_quality_status?: 'complete' | 'partial' | 'insufficient';
  /** Flagged by a person as worth further study, not a scientific conclusion. */
  is_research_opportunity?: boolean | null;
  research_opportunity_count?: number | null;
  /** Total attached media, and the publicly viewable subset after moderation. */
  media_count?: number | null;
  public_media_count?: number | null;
  /** A publicly viewable still the record's hero can lead with, when one exists. */
  primary_media_url?: string | null;
  site_title?: string | null;
  sector?: string | null;
};

export type PublicObservationFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    passport_id: string;
    observation_category: string;
    observation_subcategory: string;
    primary_interpretation: string | null;
    classification: string;
    possible_name: string | null;
    confidence: string;
    verification_status: string;
    /** The ladder value a map colour is derived from. Never invented client-side. */
    evidence_state: string | null;
    /** True only for a labelled demonstration record, so the pin can say so. */
    is_demo?: boolean;
    is_research_opportunity: boolean;
    media_count: number;
    /** A publicly viewable primary image for the map preview, when one exists. */
    primary_media_url?: string | null;
    district: string | null;
    created_at: string;
  };
};

export interface PublicObservationGeoJson {
  type: 'FeatureCollection';
  features: PublicObservationFeature[];
}

export interface PublicStats {
  total_observations: number;
  districts_with_observations: number;
  rock_categories: number;
  verified_observations: number;
  unverified_observations: number;
  recent_observations: number;
}

export interface PublicDistrictCount {
  name: string;
  observation_count: number;
}

export interface PublicCategoryCount {
  category: string;
  label: string;
  observation_count: number;
}

/**
 * The filter set the map and sidebar actually apply.
 *
 * Named for the caller rather than for the server: several components imported
 * `ObservationFilters` before the type existed, and renaming it would have been
 * churn across five files for no gain. It is the same shape the API accepts.
 */
export interface ObservationFilters {
  district?: string;
  classification?: string;
  /** Observation category filter, for example 'fossil' or 'geomorphology'. */
  category?: string;
  /** Subcategory filter, for example 'landslide'. Requires `category`. */
  subcategory?: string;
  confidence?: string;
  verification?: string;
  evidence_state?: string;
  community_status?: string;
  site?: string;
  has_investigation?: boolean;
  research_opportunity?: boolean;
  has_evidence?: boolean;
  from?: string;
  to?: string;
  bbox?: string; // minLon,minLat,maxLon,maxLat
  search?: string;
}
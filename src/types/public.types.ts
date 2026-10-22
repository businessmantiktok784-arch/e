/**
 * Public Observation API & Map Types for Earth Talk
 */

import type { RockClassification, RockConfidence } from '../ai/geological.types.js';
import type { GeoscienceCategory } from '../ai/geoscience-taxonomy.js';
import type { DataQualityStatus } from './database.types.js';

/**
 * How precisely a location is published.
 *
 * `private` is included because it is a real stored value: the contributor kept
 * the point to themselves, so the API answers with the precision and no
 * coordinate rather than dropping the field and letting the reader assume the
 * most precise value.
 */
export type PublicLocationPrecision = 'private' | 'district' | 'approximate' | 'exact';
export type PublicVerificationStatus = 'unverified' | 'expert_verified';

export interface PublicObservationSummary {
  passport_id: string;
  /** Category decided before interpretation. 'rock' for the historical records. */
  observation_category: GeoscienceCategory;
  observation_subcategory: string;
  /** One-line preliminary interpretation, in cautious language. */
  primary_interpretation: string | null;
  /**
   * Legacy rock classification. Still populated for rocks; for a fossil or a
   * landform it reports what the record is rather than inventing a rock type.
   */
  classification: RockClassification;
  possible_name: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  verification_status: PublicVerificationStatus;
  /**
   * How far this reading has actually been checked.
   *
   * Separate from `verification_status`, which only records whether an expert
   * looked at it. A record can be expert-verified and still be
   * `community_investigated`; the ladder is what the reader needs in order to
   * judge the reading itself.
   */
  evidence_state?: string | null;
  district: string | null;
  location_precision: PublicLocationPrecision;
  latitude?: number;
  longitude?: number;
  created_at: string;
  published_at?: string | null;
  /**
   * Explicitly set by a person; absence is never auto-derived.
   */
  is_research_opportunity?: boolean | null;
  /** Contributor-chosen title, when the post carries one. */
  post_title?: string | null;
  /**
   * True only for a labelled demonstration record. A demonstration entry is
   * interface content, never a collected observation, and the map badge is
   * built from this flag.
   */
  is_demo?: boolean;
}

export interface PublicObservationDetail extends PublicObservationSummary {
  /** Free-text geological context, or an honest statement that none was given. */
  geological_context?: string | null;
  observed_features: string[];
  diagnostic_features?: string[];
  reasoning: string;
  limitations: string[];
  uncertainties?: string[];
  recommended_next_steps: string[];
  safety_note: string;
  data_quality_status?: DataQualityStatus;
  /** Named for the column the view publishes, so a live row and a fixture agree. */
  is_research_opportunity?: boolean | null;
  research_opportunity_count?: number | null;
  /** Total attached media, and the publicly viewable subset after moderation. */
  media_count?: number | null;
  public_media_count?: number | null;
  /**
   * A publicly viewable still the record's hero can lead with, when one exists.
   * Only ever an image, never a clip: the hero draws a frame.
   */
  primary_media_url?: string | null;
  site_title?: string | null;
  site_code?: string | null;
  sector?: string | null;
}

export interface PublicObservationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
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
    /**
     * Evidence state, carried on the feature so a map colour is never shown
     * without the ladder value it was derived from.
     */
    evidence_state: string | null;
    /** True only for a labelled demonstration record, so the pin can say so. */
    is_demo?: boolean;
    /**
     * Carried on the feature so a research-opportunity layer can be built without
     * a second query, and so the map legend can explain the symbol it draws.
     */
    is_research_opportunity: boolean;
    media_count: number;
    /**
     * A publicly viewable primary image for the map preview, when one exists.
     * Null for a record with no shareable image, so the preview draws its
     * category symbol instead of a placeholder or a broken frame.
     */
    primary_media_url?: string | null;
    district: string | null;
    created_at: string;
  };
}

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

/** Real counts per observation category. Zero means zero, never "unknown". */
export interface PublicCategoryCount {
  category: GeoscienceCategory;
  label: string;
  observation_count: number;
}

export interface PublicDistrictCount {
  name: string;
  observation_count: number;
}

export interface PublicObservationFilters {
  page?: number;
  limit?: number;
  district?: string;
  /** Legacy rock classification filter. Kept working for existing callers. */
  classification?: string;
  /** Observation category filter, for example 'fossil' or 'geomorphology'. */
  category?: string;
  /** Subcategory filter, for example 'landslide'. Requires `category` to be sane. */
  subcategory?: string;
  confidence?: string;
  verification?: string;
  /** Evidence state filter: ai_assisted through scientifically_confirmed. */
  evidence_state?: string;
  /** Investigation status filter: open, community_supported, resolved, ... */
  community_status?: string;
  /** Restricts results to one geological site code. */
  site?: string;
  from?: string;
  to?: string;
  bbox?: string; // minLon,minLat,maxLon,maxLat
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

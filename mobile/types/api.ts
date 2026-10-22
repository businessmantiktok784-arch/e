export interface ObservationSummary {
  passport_id: string;
  observation_category: string;
  observation_subcategory: string;
  primary_interpretation: string | null;
  classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  verification_status: 'unverified' | 'expert_verified';
  evidence_state?: string | null;
  district: string | null;
  location_precision: 'private' | 'district' | 'approximate' | 'exact';
  latitude?: number;
  longitude?: number;
  created_at: string;
  post_title?: string | null;
  published_at?: string | null;
  is_research_opportunity?: boolean | null;
  is_demo?: boolean;
}
export interface ObservationDetail extends ObservationSummary {
  geological_context?: string | null;
  observed_features: string[];
  diagnostic_features?: string[];
  reasoning: string;
  limitations: string[];
  uncertainties?: string[];
  recommended_next_steps: string[];
  safety_note: string;
  data_quality_status?: string;
  is_research_opportunity?: boolean | null;
  research_opportunity_count?: number | null;
  media_count?: number | null;
  public_media_count?: number | null;
  primary_media_url?: string | null;
  site_title?: string | null;
  site_code?: string | null;
  sector?: string | null;
}
export interface Paginated<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
export interface PublicSite { site_id: string; site_code: string; title: string; district: string | null; description: string | null; is_demo?: boolean }
export interface SitesResponse { rows: PublicSite[]; total: number }
export interface PublicCategory { category: string; label: string; observation_count: number }
export interface ObservationFilters { search?: string; category?: string }
export interface GeoJsonFeature { type: 'Feature'; geometry: { type?: unknown; coordinates?: unknown } | null; properties?: Record<string, unknown> }
export interface GeoJsonCollection { type: 'FeatureCollection'; features: GeoJsonFeature[] }
export interface CommunityInvestigation {
  public_id: string; question: string; status: string; site_id: string | null; observation_id: string | null; passport_id: string | null;
  site_code?: string | null; participant_count: number; evidence_count: number; vote_count: number; research_interest?: boolean;
  options: string[]; checklist?: Array<{ id: string; text: string; check_count: number; viewer_checked: boolean }>;
  context?: string | null; category?: string | null; media_ids?: string[]; vote_distribution: Array<{ option: string; count: number; share_pct?: number }>;
  opened_by_handle?: string | null; viewer_is_owner?: boolean; is_demo: boolean; created_at: string; updated_at?: string; disclaimer?: string;
}
export interface CommunityInvestigationsResponse { rows: CommunityInvestigation[]; total: number }
export interface CommunityVoteResult { option: string; changed: boolean; message: string }
export interface ContributorTokenResponse { contributor_token: string; handle_preview: string; note: string }
export interface PublicVisit { id: string; site_id: string; contributor_handle: string; visited_on: string; notes: string | null; media_id: string | null; created_at: string }
export interface PublicVisitsResponse { rows: PublicVisit[] }
export interface PublicComment {
  comment_id: string; parent_comment_id: string | null; author: { public_user_id: string; display_name: string; is_demo?: boolean };
  body: string; created_at: string; edited_at?: string | null; moderation_status: string; reply_count: number; replies: PublicComment[]; is_demo?: boolean;
}
export interface PublicCommentResponse { data: PublicComment[]; total: number }

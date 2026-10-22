/**
 * Supabase Database TypeScript Definitions for Earth Talk.
 *
 * The type contract mirrors the migrations. Migration 012 added the
 * category-first columns to `observations`; migration 013 completed the evidence
 * ladder and the media metadata. Any field present in the database and absent
 * here would be invisible to the type checker, so the two are kept in step.
 */

import type { RockClassification, RockConfidence } from '../ai/geological.types.js';
import type { GeoscienceCategory } from '../ai/geoscience-taxonomy.js';
import type { EvidenceState } from './community.types.js';
import type { MediaRole } from './community-posts.types.js';

/**
 * Re-exported so persistence code can reach the evidence type through the
 * database contract without importing the community layer. The canonical
 * definition stays in `community.types.ts`; this is the same type, not a copy.
 */
export type { EvidenceState };

export type ObservationStatus = 'processing' | 'completed' | 'failed';
export type VerificationStatus = 'unverified' | 'under_review' | 'expert_verified' | 'rejected';
export type PublicationStatus = 'private' | 'pending' | 'public' | 'hidden';
export type LocationStatus = 'not_provided' | 'user_provided' | 'approximate' | 'exact_private';
export type DataQualityStatus = 'complete' | 'partial' | 'insufficient';

/**
 * Community progress of an investigation attached to an observation. This is
 * never a scientific verdict; it records what the community has done so far.
 */
export type CommunityStatus =
  | 'not_started'
  | 'open'
  | 'community_supported'
  | 'expert_reviewed'
  | 'resolved'
  | 'unresolved';

export type LocationSource = 'user_gps' | 'user_manual' | 'admin' | 'future_import';
export type ProcessingEventType =
  | 'observation_created'
  | 'media_received'
  | 'media_validated'
  | 'ai_analysis_started'
  | 'ai_analysis_completed'
  | 'database_saved'
  | 'whatsapp_response_sent'
  | 'processing_failed';

/**
 * How precisely a coordinate may be published.
 *
 * `private` means no coordinate leaves the platform at all. `exact` is the only
 * value that reveals the real point, and it exists only where a location is
 * explicitly authorised for public release.
 */
export type PublicLocationPrecision = 'private' | 'district' | 'approximate' | 'exact';

/** Whether a media row may be shown publicly. Private is the default. */
export type MediaVisibility = 'private' | 'pending' | 'public' | 'hidden';

/** Media moderation state. Hiding or removing media requires a recorded actor. */
export type MediaModerationStatus = 'visible' | 'pending_review' | 'hidden' | 'removed';

/**
 * What kind of media a row holds. Constrained by a trigger in migration 013 so a
 * legacy table is not rewritten, but the type is enforced here too.
 */
export type MediaType = 'image' | 'video' | 'audio';

/**
 * What a media row shows. Used by the Site Explorer gallery to separate an
 * overview shot from a close-up, so a viewer can tell which photograph shows
 * what.
 */
export type MediaViewType =
  | 'overview'
  | 'close_up'
  | 'texture'
  | 'fresh_surface'
  | 'outcrop'
  | 'environment'
  | 'multiple_angles'
  | 'field_context'
  | 'context';

export interface ObservationRow {
  id: string;
  passport_id: string;
  source: string;
  source_message_id: string;
  source_user_hash: string;
  status: ObservationStatus;

  // -- Category-first fields (migration 012) --------------------------------
  /** The kind of geoscience observation. Set before any interpretation. */
  observation_category: GeoscienceCategory | null;
  /** The detail within the category. Always valid for its category. */
  observation_subcategory: string | null;
  /** Narrower machine-facing type, e.g. `rock_specimen`. */
  observation_type: string | null;
  /** One-line preliminary interpretation. Hedged language is expected. */
  primary_interpretation: string | null;
  /** Geological setting the feature appears consistent with. */
  geological_context: string | null;
  /** Visible features that support the interpretation. */
  diagnostic_features: string[];
  /** Other plausible interpretations. */
  possible_alternatives: string[];
  /** What the photograph cannot settle. */
  uncertainties: string[];
  /** Questions that would advance the interpretation. */
  questions_for_user: string[];
  /** Community progress of an attached investigation. Never a verdict. */
  community_status: CommunityStatus;

  // -- Existing rock-analysis fields, preserved verbatim --------------------
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
  user_caption: string | null;

  // -- Verification and evidence (migrations 011, 013) ---------------------
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  /** Ordered evidence ladder. Records what is established, never correctness. */
  evidence_state: EvidenceState;
  /** Required when the state is `rejected`. */
  evidence_state_reason: string | null;
  evidence_state_changed_at: string | null;
  evidence_state_changed_by: string | null;
  scientific_confirmation_basis: string | null;
  scientific_confirmed_at: string | null;

  site_id: string | null;
  location_status: LocationStatus;
  data_quality_status: DataQualityStatus;

  // -- Community post fields (migration 016) --------------------------------
  /** The verified account that owns this post, when one is linked. */
  owner_user_id: string | null;
  /** Contributor-chosen title. Falls back to the interpretation when absent. */
  post_title: string | null;
  /** What the contributor personally reported. Never AI output. */
  user_report: string | null;
  /**
   * True only for labelled demonstration records. Demo rows are excluded from
   * research, validation and accuracy accounting.
   */
  is_demo: boolean;
  /** Set when a contributor edited the post after it was created. */
  community_updated_at: string | null;

  ai_model: string;
  ai_prompt_version: string;
  analysis_version: string;
  system_version: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ObservationInsert {
  id?: string;
  passport_id?: string;
  source?: string;
  source_message_id: string;
  source_user_hash: string;
  status?: ObservationStatus;

  observation_category?: GeoscienceCategory | null;
  observation_subcategory?: string | null;
  observation_type?: string | null;
  primary_interpretation?: string | null;
  geological_context?: string | null;
  diagnostic_features?: string[];
  possible_alternatives?: string[];
  uncertainties?: string[];
  questions_for_user?: string[];
  community_status?: CommunityStatus;

  is_rock: boolean;
  primary_classification: RockClassification;
  possible_name?: string | null;
  confidence: RockConfidence;
  confidence_score: number;
  observed_features?: string[];
  reasoning: string;
  alternative_possibilities?: string[];
  limitations?: string[];
  recommended_next_steps?: string[];
  safety_note: string;
  user_caption?: string | null;

  verification_status?: VerificationStatus;
  publication_status?: PublicationStatus;
  evidence_state?: EvidenceState;
  evidence_state_reason?: string | null;
  evidence_state_changed_at?: string | null;
  evidence_state_changed_by?: string | null;
  scientific_confirmation_basis?: string | null;
  scientific_confirmed_at?: string | null;

  site_id?: string | null;
  location_status?: LocationStatus;
  data_quality_status?: DataQualityStatus;

  // -- Community post fields (migration 016) --------------------------------
  owner_user_id?: string | null;
  post_title?: string | null;
  user_report?: string | null;
  is_demo?: boolean;
  community_updated_at?: string | null;

  ai_model?: string;
  ai_prompt_version?: string;
  analysis_version?: string;
  system_version?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}

export interface ObservationMediaRow {
  id: string;
  observation_id: string;
  media_type: MediaType;
  mime_type: string;
  file_size: number;
  sha256: string | null;
  source_media_id: string;
  /** `metadata_only` means the bytes were never retained. Never a placeholder. */
  storage_status: 'metadata_only' | 'stored' | 'failed';

  // -- Media metadata (migrations 012, 013) --------------------------------
  site_id: string | null;
  /** Path to stored bytes when they genuinely exist. NULL otherwise. */
  file_path: string | null;
  capture_date: string | null;
  caption: string | null;
  media_category: GeoscienceCategory | null;
  view_type: MediaViewType | null;
  duration_seconds: number | null;
  width_px: number | null;
  height_px: number | null;
  /** Private by default. A media row existing does not make it public. */
  visibility: MediaVisibility;
  moderation_status: MediaModerationStatus;
  moderated_by: string | null;
  moderated_at: string | null;

  // -- Community gallery fields (migration 016) -----------------------------
  /** What kind of shot this is inside the post gallery. */
  media_role: MediaRole;
  /** Display order inside the post gallery. */
  sort_order: number;
  /** Whether this item belongs in the public gallery of its post. */
  is_public: boolean;
  /**
   * Base64 bytes for media uploaded through the website. NULL for
   * WhatsApp-submitted media, whose bytes are never retained: `storage_status`
   * stays `metadata_only` and the API reports the item as unavailable.
   */
  content_base64: string | null;
  /** The account that uploaded the bytes, when the upload came from the web. */
  stored_by_user_id: string | null;
  updated_at: string;

  created_at: string;
}

export interface ObservationMediaInsert {
  id?: string;
  observation_id: string;
  media_type?: MediaType;
  mime_type: string;
  file_size: number;
  sha256?: string | null;
  source_media_id: string;
  storage_status?: 'metadata_only' | 'stored' | 'failed';
  site_id?: string | null;
  file_path?: string | null;
  capture_date?: string | null;
  caption?: string | null;
  media_category?: GeoscienceCategory | null;
  view_type?: MediaViewType | null;
  duration_seconds?: number | null;
  width_px?: number | null;
  height_px?: number | null;
  visibility?: MediaVisibility;
  moderation_status?: MediaModerationStatus;
  media_role?: MediaRole;
  sort_order?: number;
  is_public?: boolean;
  content_base64?: string | null;
  stored_by_user_id?: string | null;
  updated_at?: string;
  created_at?: string;
}

export type AttachmentKind = 'document' | 'research' | 'report';

/** A file attached to an observation (field report, research paper, document). */
export interface ObservationAttachmentRow {
  id: string;
  observation_id: string;
  kind: AttachmentKind;
  title: string;
  description: string | null;
  /** Original file name as uploaded/linked. */
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  /** Root-relative or absolute URL where the file may be read. */
  url: string;
  is_public: boolean;
  /** Whether readers may download the file. False means read-only preview. */
  allow_download: boolean;
  uploader_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationAttachmentInsert {
  id?: string;
  observation_id: string;
  kind?: AttachmentKind;
  title: string;
  description?: string | null;
  filename: string;
  mime_type: string;
  size_bytes?: number | null;
  url: string;
  is_public?: boolean;
  allow_download?: boolean;
  uploader_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ObservationLocationRow {
  id: string;
  observation_id: string;
  location_source: LocationSource;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  location_text: string | null;
  geom: string | null;
  /**
   * How precisely this coordinate may be published. `private` means no
   * coordinate is published at all, whatever the underlying value is.
   */
  public_location_precision: PublicLocationPrecision;
  is_public: boolean;
  created_at: string;
}

export interface ObservationLocationInsert {
  id?: string;
  observation_id: string;
  location_source: LocationSource;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  location_text?: string | null;
  geom?: string | null;
  public_location_precision?: PublicLocationPrecision;
  is_public?: boolean;
  created_at?: string;
}

export interface ProcessingEventRow {
  id: string;
  observation_id: string | null;
  event_type: ProcessingEventType;
  status: 'started' | 'completed' | 'failed';
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
}

export interface ProcessingEventInsert {
  id?: string;
  observation_id?: string | null;
  event_type: ProcessingEventType;
  status?: 'started' | 'completed' | 'failed';
  duration_ms?: number | null;
  error_code?: string | null;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      observations: {
        Row: ObservationRow;
        Insert: ObservationInsert;
        Update: Partial<ObservationInsert>;
        Relationships: [];
      };
      observation_media: {
        Row: ObservationMediaRow;
        Insert: ObservationMediaInsert;
        Update: Partial<ObservationMediaInsert>;
        Relationships: [];
      };
      observation_locations: {
        Row: ObservationLocationRow;
        Insert: ObservationLocationInsert;
        Update: Partial<ObservationLocationInsert>;
        Relationships: [];
      };
      observation_attachments: {
        Row: ObservationAttachmentRow;
        Insert: ObservationAttachmentInsert;
        Update: Partial<ObservationAttachmentInsert>;
        Relationships: [];
      };
      processing_events: {
        Row: ProcessingEventRow;
        Insert: ProcessingEventInsert;
        Update: Partial<ProcessingEventInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

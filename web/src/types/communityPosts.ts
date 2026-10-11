/**
 * Community observation post types (Stage 12).
 *
 * These mirror `src/types/community-posts.types.ts`, the contract served by
 * `/api/posts/*` and `/api/me/observations`. Every field that appears in a
 * server response is declared here so the side card renders what the API
 * actually sends and never invents a field.
 */

export type LocationPrivacyLevel = 'private' | 'exact' | 'approximate' | 'district';
export type MediaRole = 'main' | 'close_up' | 'field' | 'context' | 'video' | 'other';

export interface PublicUserIdentity {
  public_user_id: string;
  display_name: string | null;
  /** True only for a labelled demonstration identity. */
  is_demo: boolean;
}

export interface PublicMediaItem {
  media_id: string;
  kind: 'image' | 'video';
  role: MediaRole;
  caption: string | null;
  mime_type: string;
  sort_order: number;
  url: string | null;
  poster_url: string | null;
  available: boolean;
  is_demo: boolean;
  demo_note: string | null;
  created_at: string;
}

export interface PostQuestion {
  question_id: string;
  question: string;
  asked_by: 'ai';
  asked_at: string;
  status: 'open' | 'answered';
  answer: string | null;
  answered_at: string | null;
  answered_by: 'owner' | 'whatsapp_sender' | 'system' | null;
  is_public: boolean;
  is_demo: boolean;
}

export type ModerationStatus = 'visible' | 'hidden' | 'removed';
export type AttachmentKind = 'document' | 'research' | 'report';

export interface PublicObservationAttachment {
  attachment_id: string;
  kind: AttachmentKind;
  title: string;
  description: string | null;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  allow_download: boolean;
  is_demo: boolean;
}

export interface SamePlaceSibling {
  passport_id: string;
  title: string;
  observation_category: string;
  district: string | null;
  created_at: string;
  is_demo: boolean;
}

export interface SamePlaceObservations {
  available: boolean;
  count: number;
  note: string;
  items: SamePlaceSibling[];
}

export interface PublicComment {
  comment_id: string;
  parent_comment_id: string | null;
  author: PublicUserIdentity;
  body: string;
  created_at: string;
  edited_at: string | null;
  moderation_status: ModerationStatus;
  reply_count: number;
  replies: PublicComment[];
  is_demo: boolean;
}

export interface PublicPostLocation {
  address: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrivacyLevel;
  approximate: boolean;
  privacy_note: string;
}

export interface PublicPostAi {
  primary_interpretation: string | null;
  observed_features: string[];
  diagnostic_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  uncertainties: string[];
  limitations: string[];
  recommended_next_steps: string[];
  safety_note: string;
  confidence: string;
  confidence_score: number;
  evidence_state: string | null;
  disclaimer: string;
}

export interface CommunityPostDetail {
  passport_id: string;
  title: string;
  observation_category: string;
  observation_subcategory: string;
  is_public: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  owner: PublicUserIdentity | null;
  location: PublicPostLocation;
  user_report: string | null;
  ai: PublicPostAi;
  media: PublicMediaItem[];
  questions: PostQuestion[];
  open_questions: PostQuestion[];
  comment_count: number;
  can_comment: boolean;
  viewer_is_owner: boolean;
  attachments: PublicObservationAttachment[];
  same_place: SamePlaceObservations;
}

export interface CreateCommentResult {
  comment: PublicComment;
  message: string;
}

/** One discussion thread the reader started, gathered across every post. */
export interface MyDiscussionThread {
  comment_id: string;
  passport_id: string;
  post_title: string;
  body: string;
  created_at: string;
  moderation_status: ModerationStatus;
  reply_count: number;
  replies: PublicComment[];
}

export interface MyPostSummary {
  passport_id: string;
  title: string;
  is_public: boolean;
  observation_category: string;
  created_at: string;
  comment_count: number;
  media_count: number;
  open_question_count: number;
  location_precision: LocationPrivacyLevel;
  /** The owner's own coordinate, for their private map layer only. */
  latitude?: number | null;
  longitude?: number | null;
}

export interface CommunityUser {
  public_user_id: string;
  display_name: string | null;
  is_demo: boolean;
  /**
   * When this account last changed its display name, from the server session.
   * Absent for a pseudonymous/local account, whose window is tracked in the
   * browser store instead. Used to grey out the rename control.
   */
  display_name_updated_at?: string | null;
}

export interface CommunitySession {
  token: string;
  expires_at: string;
  user: CommunityUser;
}

// ---------------------------------------------------------------------------
// Abuse reports (specification section 25)
// ---------------------------------------------------------------------------

/**
 * Reasons a reader may give when reporting content.
 *
 * A report is an allegation: it never changes an evidence state and is never
 * counted as agreement. Mirrors the server's `ABUSE_REPORT_REASONS`.
 */
export const ABUSE_REPORT_REASONS = [
  'incorrect_information',
  'privacy_concern',
  'misleading_claim',
  'commercial_or_spam',
  'abusive_content',
  'duplicate_record',
  'sensitive_location',
  'safety_principles',
  'other',
] as const;

export type AbuseReportReason = (typeof ABUSE_REPORT_REASONS)[number];

export const ABUSE_REPORT_REASON_LABEL: Record<AbuseReportReason, string> = {
  incorrect_information: 'The geological information looks incorrect',
  privacy_concern: "It exposes someone's private location or identity",
  misleading_claim: 'It makes a claim the evidence does not support',
  commercial_or_spam: 'It is commercial, promotional or spam',
  abusive_content: 'It contains abusive or harmful content',
  duplicate_record: 'It duplicates an existing record',
  sensitive_location: 'The location is ecologically or culturally sensitive',
  safety_principles: "It violates Earth Talk's humanitarian, community or safety principles",
  other: 'Something else',
};

export type AbuseReportTargetType =
  | 'observation'
  | 'investigation'
  | 'question'
  | 'comment'
  | 'site'
  | 'evidence'
  | 'media';

export interface FileAbuseReportInput {
  target_type: AbuseReportTargetType;
  target_id: string;
  reason_code: AbuseReportReason;
  details?: string | null;
  observation_passport_id?: string | null;
}

export interface FiledAbuseReport {
  public_id: string;
  status: string;
  reason_code: AbuseReportReason;
  created_at: string;
}
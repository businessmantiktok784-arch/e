/**
 * Stage 12 types: community observation posts, accounts, discussion and
 * questions.
 *
 * Everything exported from here is either a database row shape (used inside
 * the repositories) or a deliberately whitelisted public shape (used by the
 * API). There is no type in this file that carries a phone number, a
 * verification code, an authentication token or an internal prompt, because a
 * public serializer that cannot express a secret cannot leak one.
 */

/**
 * The four levels a contributor may store a coordinate at.
 *
 * `private` is a real stored value: the coordinate exists for the owner and for
 * nobody else. It is part of this type rather than bolted on beside it because
 * every switch over a precision has to answer for it.
 */
export type LocationPrivacyLevel = 'private' | 'exact' | 'approximate' | 'district';

/** How a person appears to everyone who is not them. */
export interface PublicUserIdentity {
  /** Stable, safe, published identifier, for example `ET-USER-1f42`. */
  public_user_id: string;
  /** Chosen public name. Null means "show the id", never "show a phone number". */
  display_name: string | null;
  /** True only for labelled demonstration identities. */
  is_demo: boolean;
}

/** A row from `users`. Never serialized directly to a public response. */
export interface UserRow {
  id: string;
  public_user_id: string;
  display_name: string | null;
  /**
   * When the display name was last changed. Null means it has never been
   * changed by the reader, which is still editable. Used to enforce the
   * seven-day rename window on the server, not only in the browser.
   */
  display_name_updated_at?: string | null;
  phone_hash: string;
  created_via: 'web' | 'whatsapp';
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface VerificationCodeRecord {
  id: string;
  phone_hash: string;
  code_hash: string;
  purpose: 'whatsapp_login';
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  requested_ip_hash: string | null;
  delivery: 'whatsapp' | 'development_console' | 'failed' | null;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string;
  /** Truncated hash of the issuing address. Never the address itself. */
  ip_hash: string | null;
  user_agent_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type MediaRole = 'main' | 'close_up' | 'field' | 'context' | 'video' | 'other';

/**
 * One media item as the public API publishes it.
 *
 * `url` is null when the bytes are not stored on this deployment, which is the
 * honest state for WhatsApp-submitted media: metadata was recorded, the object
 * storage backend is not wired up. `available` lets the client render an honest
 * empty state instead of a broken image.
 */
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
  /** True only for labelled demonstration media placeholders. */
  is_demo: boolean;
  /** Present for demonstration media: what the placeholder actually is. */
  demo_note: string | null;
  created_at: string;
}

export type QuestionStatus = 'open' | 'answered';

/** An AI follow-up question and, when there is one, the contributor's answer. */
export interface PostQuestion {
  question_id: string;
  question: string;
  asked_by: 'ai';
  asked_at: string;
  status: QuestionStatus;
  answer: string | null;
  answered_at: string | null;
  answered_by: 'owner' | 'whatsapp_sender' | 'system' | null;
  /** Whether the question and answer may be shown to a public reader. */
  is_public: boolean;
  is_demo: boolean;
}

export type ModerationStatus = 'visible' | 'hidden' | 'removed';

/** A comment or a reply exactly as the public API publishes it. */
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

/**
 * A comment as the Super Admin moderation queue sees it.
 *
 * Deliberately a different shape from `PublicComment`: the reader is entitled
 * only to what moderation accounts for (who, what, when, and whether it was
 * hidden and why), so it carries no replies and no public-facing assembly.
 */
export interface AdminModerationComment {
  comment_id: string;
  /** Null only for a labelled demonstration comment, which has no row. */
  observation_id: string | null;
  passport_id: string;
  parent_comment_id: string | null;
  author: PublicUserIdentity;
  body: string;
  created_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  /** True only for a labelled demonstration comment, which cannot be moderated. */
  is_demo: boolean;
}

/** A row from `observation_comments`. */
export interface CommentRow {
  id: string;
  /** Stable public key of the post the comment belongs to. */
  passport_id: string;
  /** Null only for a labelled demonstration post, which has no row. */
  observation_id: string | null;
  parent_comment_id: string | null;
  author_user_id: string;
  body: string;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row from `observation_questions`. */
export interface QuestionRow {
  id: string;
  observation_id: string;
  question_id: string;
  question: string;
  asked_by: 'ai';
  asked_at: string;
  status: QuestionStatus;
  answer: string | null;
  answered_at: string | null;
  answered_by: 'owner' | 'whatsapp_sender' | 'system' | null;
  answered_by_user_id: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Location as a public reader is allowed to see it.
 *
 * The precision is decided server-side from the stored privacy level. When the
 * owner chose an approximate or district-level location, `latitude` and
 * `longitude` are the generalised point and `approximate` is true, so the
 * client can say "Approximate location" instead of implying precision.
 */
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

/** The AI block, published with its disclaimer attached. */
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

/**
 * The community post assembled for the observation side card.
 *
 * Every field is written explicitly by the serializer. Nothing here is a
 * database row, so a forgotten column cannot become a leaked column.
 */
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
  /** AI questions that are still open, for the reader the question belongs to. */
  open_questions: PostQuestion[];
  comment_count: number;
  /** True when the viewer may comment (public post, or their own private post). */
  can_comment: boolean;
  /** True when the viewer is the owner and may edit or answer. */
  viewer_is_owner: boolean;
  /** Attached documents, research papers and field reports for this observation. */
  attachments: PublicObservationAttachment[];
  /** Other observations recorded at the exact same published coordinates. */
  same_place: SamePlaceObservations;
}

export type AttachmentKind = 'document' | 'research' | 'report';

export interface PublicObservationAttachment {
  attachment_id: string;
  kind: AttachmentKind;
  title: string;
  description: string | null;
  /** Resolvable absolute or root-relative URL where the file may be read. */
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  /** False means readers may only preview the document, never download it. */
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
  /** Human-readable description of the grouping basis, shown in the UI. */
  note: string;
  items: SamePlaceSibling[];
}

/** A viewer's identity on a request, resolved from a session server-side. */
export interface ViewerContext {
  userId: string;
  publicUserId: string;
  /**
   * Chosen public name, when the caller already resolved it. Optional because
   * ownership and authorization only ever need the ids; a missing name is
   * written as null, never as a fallback the reader would mistake for one.
   */
  displayName?: string | null;
}

/**
 * One discussion thread the viewer started, gathered across every post.
 *
 * This is the "My questions" list: the reader's own questions/comments and the
 * replies other people left on them, each carrying enough context (post id and
 * title) to reopen the observation and reply again.
 */
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

export interface CreateCommentInput {
  passportId: string;
  body: string;
  parentCommentId: string | null;
}

export interface CreateCommentResult {
  comment: PublicComment;
  /** Message shown to the author right after a successful post. */
  message: string;
}

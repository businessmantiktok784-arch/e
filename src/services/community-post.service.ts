import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
import { validateMedia } from '../utils/image-validator.js';
import { resolvePublicCoordinates } from '../utils/public-location.js';
import { squashText } from '../utils/text.js';
import { communityPostRepository } from '../repositories/community-post.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  DEMO_POSTS,
  demoComments,
  demoPublicComments,
  findDemoPost,
  type DemoPostSeed,
} from '../data/demo-posts.js';
import type {
  AdminModerationComment,
  AttachmentKind,
  CommentRow,
  CommunityPostDetail,
  CreateCommentResult,
  MediaRole,
  ModerationStatus,
  MyDiscussionThread,
  PostQuestion,
  PublicComment,
  PublicMediaItem,
  PublicObservationAttachment,
  PublicPostAi,
  PublicPostLocation,
  PublicUserIdentity,
  QuestionRow,
  SamePlaceObservations,
  SamePlaceSibling,
  ViewerContext,
} from '../types/community-posts.types.js';
import type {
  ObservationAttachmentRow,
  ObservationLocationRow,
  ObservationMediaRow,
  ObservationRow,
  PublicationStatus,
  PublicLocationPrecision,
} from '../types/database.types.js';
import { publicObservationRepository, SAME_PLACE_RADIUS_KM } from '../repositories/public-observation.repository.js';
import { haversineKm } from '../repositories/site.repository.js';

/**
 * Community observation posts (Stage 12).
 *
 * The service owns three separations that the interface must never blur:
 *
 *   * the contributor's own words (`user_report`) and the model's output
 *     (`ai`) are assembled into different fields, so a renderer cannot present
 *     one as the other;
 *   * a public reader, the owner, and an anonymous visitor each receive the
 *     location, gallery and discussion they are entitled to, decided here
 *     rather than in the browser;
 *   * a labelled demonstration post is built from the demonstration dataset
 *     and keeps its DEMO flag through every field it publishes.
 *
 * Demonstration posts never enter research, validation or accuracy accounting:
 * they are served from `demo-posts.ts`, not from the `observations` table that
 * those systems read.
 */

const AI_DISCLAIMER =
  'This is a preliminary AI-assisted identification and not a laboratory or expert determination.';

export class PostServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PostServiceError';
  }
}

/** One row of the contributor's own dashboard. */
export interface MyPostSummary {
  passport_id: string;
  title: string;
  is_public: boolean;
  observation_category: string;
  created_at: string;
  comment_count: number;
  media_count: number;
  open_question_count: number;
  location_precision: PublicLocationPrecision;
  /**
   * The contributor's own coordinate, whatever its precision.
   *
   * This is their own record, so they may place it on their private map layer
   * even when the location is withheld from everyone else. The value never
   * leaves this owner-only endpoint.
   */
  latitude?: number | null;
  longitude?: number | null;
}

function fail(status: number, code: string, message: string): never {
  throw new PostServiceError(status, code, message);
}

const MAX_TITLE_LENGTH = 120;
const MAX_REPORT_LENGTH = 4000;
const MAX_CAPTION_LENGTH = 300;
const MEDIA_ROLES: MediaRole[] = ['main', 'close_up', 'field', 'context', 'video', 'other'];
const LOCATION_PRECISIONS: PublicLocationPrecision[] = ['private', 'district', 'approximate', 'exact'];

function cleanText(value: unknown, maxLength: number): string {
  return squashText(value, maxLength);
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

function locationNote(precision: PublicLocationPrecision, viewerIsOwner: boolean): string {
  // Every note leads with the source of the position: it is supplied by the
  // contributor with the photos (WhatsApp shares the capture point or its
  // lat/long with the message - the platform never guesses a location), and
  // the AI uses that point to find nearby observations.
  if (viewerIsOwner) {
    switch (precision) {
      case 'exact':
        return 'Exact location as you shared it where the photos were taken. Public readers see this point; our AI uses it to find nearby observations.';
      case 'approximate':
        return 'Approximate location. Public readers see it generalised to about two kilometres; our AI still works from your shared point.';
      case 'district':
        return 'District level. Public readers see only the district; our AI still works from your shared point.';
      case 'private':
        return 'Private location. No public reader receives a coordinate.';
    }
  }
  switch (precision) {
    case 'exact':
      return 'Location shared by the contributor where the photos were taken; our AI uses this point to find nearby observations.';
    case 'approximate':
      return 'Location shared by the contributor, generalised to about two kilometres; our AI uses the point to find nearby observations.';
    case 'district':
      return 'Location provided by the contributor where the images were taken; our AI uses the shared co-ordinates to find nearby observations. Shown at district scale.';
    case 'private':
      return 'The contributor kept this location private.';
  }
}

function buildLocation(params: {
  location: ObservationLocationRow | null;
  viewerIsOwner: boolean;
}): PublicPostLocation {
  const { location, viewerIsOwner } = params;
  const precision: PublicLocationPrecision = location?.public_location_precision ?? 'district';

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (viewerIsOwner) {
    // The owner always sees the point they recorded, including a private one.
    if (location?.latitude !== null && location?.latitude !== undefined) latitude = location.latitude;
    if (location?.longitude !== null && location?.longitude !== undefined) longitude = location.longitude;
    if (latitude === null || longitude === null) {
      const districtCentre = resolvePublicCoordinates({
        precision: 'district',
        district: location?.district ?? null,
      });
      latitude = districtCentre?.latitude ?? null;
      longitude = districtCentre?.longitude ?? null;
    }
  } else if (precision !== 'private') {
    const resolved = resolvePublicCoordinates({
      precision: precision === 'exact' ? 'exact' : precision,
      district: location?.district ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    });
    latitude = resolved?.latitude ?? null;
    longitude = resolved?.longitude ?? null;
  }

  return {
    address: location?.location_text ?? null,
    district: location?.district ?? null,
    sector: location?.sector ?? null,
    cell: null,
    village: null,
    country: 'Rwanda',
    latitude,
    longitude,
    precision,
    approximate: precision !== 'exact',
    privacy_note: locationNote(precision, viewerIsOwner),
  };
}

function demoLocation(post: DemoPostSeed): PublicPostLocation {
  const resolved = resolvePublicCoordinates({
    precision: post.precision === 'private' ? 'district' : post.precision,
    district: post.district,
    latitude: post.latitude,
    longitude: post.longitude,
  });
  return {
    address: null,
    district: post.district,
    sector: post.sector,
    cell: post.cell ?? null,
    village: post.village ?? null,
    country: 'Rwanda',
    latitude: post.precision === 'private' ? null : (resolved?.latitude ?? null),
    longitude: post.precision === 'private' ? null : (resolved?.longitude ?? null),
    precision: post.precision,
    approximate: post.precision !== 'exact',
    privacy_note: locationNote(post.precision, false),
  };
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

function mediaItemFromRow(row: ObservationMediaRow): PublicMediaItem {
  const bytes = row.content_base64 ?? null;
  return {
    media_id: row.id,
    kind: row.media_type === 'video' ? 'video' : 'image',
    role: (row.media_role as MediaRole) ?? 'field',
    caption: row.caption ?? null,
    mime_type: row.mime_type,
    sort_order: row.sort_order ?? 0,
    url: bytes ? `data:${row.mime_type};base64,${bytes}` : null,
    poster_url: null,
    available: Boolean(bytes),
    is_demo: false,
    demo_note: bytes
      ? null
      : 'This file arrived through WhatsApp, where only its metadata is kept, so the file itself cannot be replayed here.',
    created_at: row.created_at,
  };
}

function demoMediaItem(post: DemoPostSeed, index: number): PublicMediaItem {
  const seed = post.media[index];
  return {
    media_id: `${post.passport_id}-media-${index}`,
    kind: seed.mime_type.startsWith('video/') ? 'video' : 'image',
    role: seed.role,
    caption: seed.caption,
    mime_type: seed.mime_type,
    sort_order: seed.sort_order,
    url: seed.url,
    poster_url: null,
    available: seed.url !== null,
    is_demo: true,
    demo_note: seed.demo_note,
    created_at: post.created_at,
  };
}

// ---------------------------------------------------------------------------
// Attachments and same-place visits
// ---------------------------------------------------------------------------

function attachmentFromRow(row: ObservationAttachmentRow): PublicObservationAttachment {
  return {
    attachment_id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    url: row.url,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    allow_download: row.allow_download ?? true,
    is_demo: false,
  };
}

function demoAttachmentItem(post: DemoPostSeed, index: number): PublicObservationAttachment {
  const seed = post.attachments![index];
  return {
    attachment_id: `${post.passport_id}-attachment-${index}`,
    kind: seed.kind,
    title: seed.title,
    description: seed.description ?? null,
    url: seed.url,
    filename: seed.filename,
    mime_type: seed.mime_type,
    size_bytes: seed.size_bytes ?? null,
    created_at: post.created_at,
    allow_download: seed.allow_download ?? true,
    is_demo: true,
  };
}

export function demoPublishedCoords(post: DemoPostSeed): {
  latitude: number | null;
  longitude: number | null;
} {
  if (post.precision === 'private') return { latitude: null, longitude: null };
  return { latitude: post.latitude, longitude: post.longitude };
}

const SAME_PLACE_NOTE =
  'More than one visit was recorded near this same point (within about half a kilometre of the printed coordinate). Every visit keeps its own photos, videos, reports and documents; nothing is merged.';

/**
 * Two observations are "the same place" when their published points sit within
 * SAME_PLACE_RADIUS_KM of each other. Exact equality would be unrealistic: two
 * visitors rarely capture the identical GPS decimal pair even at the same spot.
 */
function samePlaceNote(available: boolean): string {
  return available
    ? SAME_PLACE_NOTE
    : 'This observation has no published coordinates to group by.';
}

function samePlaceForDemo(post: DemoPostSeed): SamePlaceObservations {
  const origin = demoPublishedCoords(post);
  const available = origin.latitude !== null && origin.longitude !== null;
  if (!available) return { available: false, count: 0, note: samePlaceNote(false), items: [] };

  const items: SamePlaceSibling[] = DEMO_POSTS.filter(
    (candidate) =>
      candidate.passport_id !== post.passport_id &&
      (() => {
        const coords = demoPublishedCoords(candidate);
        if (coords.latitude === null || coords.longitude === null) return false;
        const distance = haversineKm(
          origin.latitude!,
          origin.longitude!,
          coords.latitude,
          coords.longitude
        );
        return Number.isFinite(distance) && distance <= SAME_PLACE_RADIUS_KM;
      })()
  )
    .map((candidate) => ({
      passport_id: candidate.passport_id,
      title: candidate.title,
      observation_category: candidate.observation_category,
      district: candidate.district ?? null,
      created_at: candidate.created_at,
      is_demo: true,
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return { available: true, count: items.length + 1, note: samePlaceNote(true), items };
}

async function samePlaceForReal(passportId: string): Promise<SamePlaceObservations> {
  const siblings = await publicObservationRepository.findSamePlacePublicObservations({ passportId });
  return {
    available: true,
    count: siblings.length + 1,
    note: samePlaceNote(true),
    items: siblings.map((sibling) => ({
      passport_id: sibling.passport_id,
      title:
        sibling.post_title ??
        (sibling.district ? `Observation in ${sibling.district}` : 'Observation'),
      observation_category: sibling.observation_category,
      district: sibling.district,
      created_at: sibling.created_at,
      is_demo: sibling.is_demo,
    })),
  };
}

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

async function identityFor(userId: string): Promise<PublicUserIdentity | null> {
  const user = await userRepository.findUserById(userId);
  if (!user) return null;
  return {
    public_user_id: user.public_user_id,
    display_name: user.display_name,
    is_demo: user.is_demo,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommunityPostService {
  // ==========================================================================
  // Read: one post
  // ==========================================================================

  async getPost(
    passportId: string,
    viewer: ViewerContext | null
  ): Promise<CommunityPostDetail | null> {
    const wanted = String(passportId ?? '').trim();
    if (!wanted) return null;

    const demo = findDemoPost(wanted);
    if (demo) return this.buildDemoPost(demo, viewer);

    const row = await communityPostRepository.findObservation(wanted);
    if (!row) return null;

    const viewerIsOwner = await this.resolveOwnership(row, viewer);
    const isPublic = row.publication_status === 'public';
    if (!isPublic && !viewerIsOwner) {
      // A private or pending post is indistinguishable from one that does not
      // exist, so an unauthorised caller learns nothing from the status code.
      return null;
    }

    const [location, mediaRows, questionRows, attachmentRows] = await Promise.all([
      communityPostRepository.findLocation(row.id),
      communityPostRepository.listMedia(row.id),
      communityPostRepository.listQuestions(row.id),
      communityPostRepository.listAttachments(row.id),
    ]);

    const ownerIdentity = row.owner_user_id ? await identityFor(row.owner_user_id) : null;
    const questions = this.assembleQuestions(row, questionRows);
    const discussion = await this.assembleComments(row.passport_id, false);

    return {
      passport_id: row.passport_id,
      title: this.titleOf(row),
      observation_category: row.observation_category ?? 'unknown',
      observation_subcategory: row.observation_subcategory ?? 'unknown',
      is_public: isPublic,
      is_demo: Boolean(row.is_demo),
      created_at: row.created_at,
      updated_at: row.community_updated_at ?? row.updated_at,
      owner: ownerIdentity,
      location: buildLocation({ location, viewerIsOwner }),
      user_report: this.reportOf(row),
      ai: this.aiBlockOf(row),
      media: mediaRows.map(mediaItemFromRow),
      questions,
      open_questions: questions.filter((question) => question.status === 'open'),
      comment_count: discussion.count,
      can_comment: isPublic || viewerIsOwner,
      viewer_is_owner: viewerIsOwner,
      attachments: attachmentRows.filter((entry) => entry.is_public || viewerIsOwner).map(attachmentFromRow),
      same_place: await samePlaceForReal(row.passport_id),
    };
  }

  /**
   * Other visits recorded at the exact same published coordinate pair.
   * Exposes the same grouping the detail endpoint carries, for callers that
   * only need the sibling list.
   */
  async samePlace(passportId: string): Promise<SamePlaceObservations> {
    const wanted = String(passportId ?? '').trim();
    if (!wanted) return { available: false, count: 0, note: samePlaceNote(false), items: [] };

    const demo = findDemoPost(wanted);
    if (demo) return samePlaceForDemo(demo);

    const row = await communityPostRepository.findObservation(wanted);
    if (!row || row.publication_status !== 'public') {
      // Same non-information behavior as getPost for private or missing posts.
      return { available: false, count: 0, note: samePlaceNote(false), items: [] };
    }
    return samePlaceForReal(row.passport_id);
  }

  private async buildDemoPost(
    demo: DemoPostSeed,
    viewer: ViewerContext | null
  ): Promise<CommunityPostDetail> {
    void viewer; // a demonstration post belongs to nobody who is signed in
    const discussion = await this.assembleComments(demo.passport_id, true);
    const questions: PostQuestion[] = demo.questions;

    return {
      passport_id: demo.passport_id,
      title: demo.title,
      observation_category: demo.observation_category,
      observation_subcategory: demo.observation_subcategory,
      is_public: true,
      is_demo: true,
      created_at: demo.created_at,
      updated_at: demo.created_at,
      owner: {
        public_user_id: demo.owner_public_user_id,
        display_name: demo.owner_display_name,
        is_demo: true,
      },
      location: demoLocation(demo),
      user_report: demo.user_report,
      ai: {
        primary_interpretation: demo.primary_interpretation,
        observed_features: demo.observed_features,
        diagnostic_features: demo.diagnostic_features,
        reasoning: demo.reasoning,
        alternative_possibilities: demo.alternative_possibilities,
        uncertainties: demo.uncertainties,
        limitations: demo.limitations,
        recommended_next_steps: demo.recommended_next_steps,
        safety_note: demo.safety_note,
        confidence: 'moderate',
        confidence_score: 0.5,
        evidence_state: 'ai_assisted',
        disclaimer: AI_DISCLAIMER,
      },
      media: demo.media.map((_, index) => demoMediaItem(demo, index)),
      questions,
      open_questions: questions.filter((question) => question.status === 'open'),
      comment_count: discussion.count,
      can_comment: true,
      viewer_is_owner: false,
      attachments: (demo.attachments ?? []).map((_, index) => demoAttachmentItem(demo, index)),
      same_place: samePlaceForDemo(demo),
    };
  }

  /**
   * Decides whether the signed-in account owns a post.
   *
   * An account that signs in with the same number that submitted the
   * observation through WhatsApp is the author of that observation, so the
   * link is made once and recorded. Nobody else can claim a post by viewing it.
   */
  private async resolveOwnership(
    row: ObservationRow,
    viewer: ViewerContext | null
  ): Promise<boolean> {
    if (!viewer) return false;
    if (row.owner_user_id) return row.owner_user_id === viewer.userId;

    const account = await userRepository.findUserById(viewer.userId);
    if (!account || !account.phone_hash || account.phone_hash !== row.source_user_hash) {
      return false;
    }

    await communityPostRepository.linkOwner(row.passport_id, viewer.userId);
    row.owner_user_id = viewer.userId;
    return true;
  }

  private titleOf(row: ObservationRow): string {
    const title = row.post_title ?? row.user_caption ?? row.primary_interpretation ?? null;
    if (title && title.trim()) return title.trim().slice(0, MAX_TITLE_LENGTH);
    return `Observation ${row.passport_id}`;
  }

  /** The contributor's own words, never the model's. */
  private reportOf(row: ObservationRow): string | null {
    const report = row.user_report ?? row.user_caption ?? null;
    return report && report.trim() ? report.trim() : null;
  }

  private aiBlockOf(row: ObservationRow): PublicPostAi {
    return {
      primary_interpretation: row.primary_interpretation ?? null,
      observed_features: row.observed_features ?? [],
      diagnostic_features: row.diagnostic_features ?? [],
      reasoning: row.reasoning ?? '',
      alternative_possibilities: row.alternative_possibilities ?? [],
      uncertainties: row.uncertainties ?? [],
      limitations: row.limitations ?? [],
      recommended_next_steps: row.recommended_next_steps ?? [],
      safety_note:
        row.safety_note ||
        'Follow local guidance and stay clear of unstable ground when visiting a site.',
      confidence: row.confidence,
      confidence_score: row.confidence_score,
      evidence_state: row.evidence_state ?? null,
      disclaimer: AI_DISCLAIMER,
    };
  }

  /**
   * Questions the model asked, plus any answer the contributor gave.
   *
   * An observation created before Stage 12 still has its questions in
   * `questions_for_user`. They are shown as open questions without being
   * rewritten on read, and the first answer materialises them, so an old
   * record behaves exactly like a new one.
   */
  private assembleQuestions(row: ObservationRow, persisted: QuestionRow[]): PostQuestion[] {
    const stored = new Map(persisted.map((entry) => [entry.question_id, entry]));
    const listed = (row.questions_for_user ?? [])
      .map((text, index) => ({ questionId: `q-${index + 1}`, text: String(text) }))
      .filter((entry) => entry.text.trim().length > 0);

    const ids = new Set<string>([
      ...listed.map((entry) => entry.questionId),
      ...persisted.map((entry) => entry.question_id),
    ]);

    const assembled: PostQuestion[] = [];
    for (const questionId of Array.from(ids)) {
      const match = stored.get(questionId);
      const text =
        match?.question ??
        listed.find((entry) => entry.questionId === questionId)?.text ??
        '';

      if (!text.trim()) continue;

      assembled.push({
        question_id: questionId,
        question: text,
        asked_by: 'ai',
        asked_at: match?.asked_at ?? row.created_at,
        status: match?.status ?? 'open',
        answer: match?.answer ?? null,
        answered_at: match?.answered_at ?? null,
        answered_by: match?.answered_by ?? null,
        is_public: match?.is_public ?? true,
        is_demo: false,
      });
    }

    return assembled.sort((a, b) => a.asked_at.localeCompare(b.asked_at));
  }

  // ==========================================================================
  // Read: discussion
  // ==========================================================================

  private async assembleComments(
    passportId: string,
    isDemo: boolean
  ): Promise<{ comments: PublicComment[]; count: number }> {
    const rows = (await communityPostRepository.listComments(passportId)).filter(
      (row) => row.moderation_status === 'visible'
    );

    const authorCache = new Map<string, PublicUserIdentity>();
    const roots: PublicComment[] = [];
    const byId = new Map<string, PublicComment>();

    for (const row of rows) {
      let author = authorCache.get(row.author_user_id);
      if (!author) {
        author =
          (await identityFor(row.author_user_id)) ?? {
            public_user_id: 'ET-USER-UNKNOWN',
            display_name: null,
            is_demo: false,
          };
        authorCache.set(row.author_user_id, author);
      }

      const comment: PublicComment = {
        comment_id: row.id,
        parent_comment_id: row.parent_comment_id,
        author,
        body: row.body,
        created_at: row.created_at,
        edited_at: row.edited_at,
        moderation_status: row.moderation_status,
        reply_count: 0,
        replies: [],
        is_demo: false,
      };
      byId.set(row.id, comment);
    }

    for (const comment of byId.values()) {
      const parent = comment.parent_comment_id ? byId.get(comment.parent_comment_id) : null;
      if (parent) {
        parent.replies.push(comment);
        parent.reply_count = parent.replies.length;
      } else {
        roots.push(comment);
      }
    }

    roots.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const root of roots) {
      root.replies.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    let comments = roots;
    let count = rows.length;

    if (isDemo) {
      // Demonstration discussion lives in the demonstration dataset; anything
      // a real reader posts is appended to it, never mixed into it.
      const demoRoots = demoPublicComments(passportId);
      comments = [...demoRoots, ...roots];
      count += demoRoots.reduce((total, root) => total + 1 + root.replies.length, 0);
    }

    return { comments, count };
  }

  async listComments(passportId: string, viewer: ViewerContext | null): Promise<PublicComment[]> {
    const demo = findDemoPost(passportId);
    if (!demo) {
      const row = await communityPostRepository.findObservation(passportId);
      if (!row) return [];
      const viewerIsOwner = await this.resolveOwnership(row, viewer);
      if (row.publication_status !== 'public' && !viewerIsOwner) return [];
    }
    return (await this.assembleComments(passportId, Boolean(demo))).comments;
  }

  // ==========================================================================
  // Moderation (Super Admin)
  // ==========================================================================

  /**
   * The whole discussion across every post, newest first, for the Super Admin.
   *
   * Demonstration comments are listed so the queue is inspectable on a fresh
   * deployment, each one flagged `is_demo: true` and carrying no moderation
   * record. They are included read-only: `moderateComment` rejects them, so a
   * fake thread can never be edited to look moderated or unmoderated.
   */
  async listCommentsForModeration(params: {
    limit?: number;
    offset?: number;
    passportId?: string;
    status?: ModerationStatus;
  }): Promise<{ rows: AdminModerationComment[]; total: number }> {
    const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
    const offset = Math.max(0, params.offset ?? 0);

    // Both sources are read in full and merged here so the queue is one
    // newest-first list with honest pagination. Reading the database page and
    // pasting the demonstration rows around it would make the two sources
    // truncate each other's pages.
    const source = await communityPostRepository.listCommentsForModeration({
      limit: 10_000,
      offset: 0,
    });

    const rows: AdminModerationComment[] = [];
    for (const row of source.rows) {
      if (params.status && row.moderation_status !== params.status) continue;
      if (params.passportId && row.passport_id.toUpperCase() !== params.passportId.trim().toUpperCase()) continue;
      rows.push(
        await this.toAdminComment(row, {
          public_user_id: 'ET-USER-UNKNOWN',
          display_name: null,
          is_demo: false,
        })
      );
    }

    const demoRows = this.listDemoCommentsForModeration().filter((row) => {
      if (params.status && row.moderation_status !== params.status) return false;
      if (params.passportId && row.passport_id.toUpperCase() !== params.passportId.trim().toUpperCase()) {
        return false;
      }
      return true;
    });

    const combined = [...demoRows, ...rows];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = combined.length;
    return { rows: combined.slice(offset, offset + limit), total };
  }

  /**
   * Hides, restores or removes one comment, recording the actor and reason.
   * A labelled demonstration comment cannot be moderated and is refused.
   */
  async moderateComment(input: {
    commentId: string;
    status: ModerationStatus;
    reason: string;
    moderatedBy: string;
  }): Promise<AdminModerationComment> {
    const { commentId, status, reason, moderatedBy } = input;
    const reasonText = String(reason ?? '').trim();
    if (!reasonText) fail(400, 'REASON_REQUIRED', 'A reason is required for moderation.');
    if (reasonText.length > 500) {
      fail(400, 'REASON_TOO_LONG', 'A moderation reason is limited to 500 characters.');
    }

    const demo = DEMO_POSTS.some((post) =>
      post.comments.some((comment) => comment.comment_id === commentId)
    );
    if (demo) {
      fail(
        400,
        'DEMO_COMMENT_READ_ONLY',
        'A labelled demonstration comment is part of the demonstration dataset and cannot be moderated.'
      );
    }

    const updated = await communityPostRepository.setCommentModeration(
      commentId,
      status,
      reasonText,
      moderatedBy
    );
    if (!updated) fail(404, 'COMMENT_NOT_FOUND', 'That comment does not exist.');

    return this.toAdminComment(updated, {
      public_user_id: 'ET-USER-UNKNOWN',
      display_name: null,
      is_demo: false,
    });
  }

  private async toAdminComment(
    row: CommentRow,
    fallback: PublicUserIdentity
  ): Promise<AdminModerationComment> {
    const author = (await identityFor(row.author_user_id)) ?? fallback;
    return {
      comment_id: row.id,
      observation_id: row.observation_id,
      passport_id: row.passport_id,
      parent_comment_id: row.parent_comment_id,
      author,
      body: row.body,
      created_at: row.created_at,
      moderated_at: row.moderated_at,
      moderated_by: row.moderated_by,
      moderation_status: row.moderation_status,
      moderation_reason: row.moderation_reason,
      is_demo: false,
    };
  }

  private listDemoCommentsForModeration(): AdminModerationComment[] {
    const rows: AdminModerationComment[] = [];
    for (const post of DEMO_POSTS) {
      for (const comment of post.comments) {
        rows.push({
          comment_id: comment.comment_id,
          observation_id: null,
          passport_id: post.passport_id,
          parent_comment_id: comment.parent_comment_id,
          author: {
            public_user_id: comment.author_public_user_id,
            display_name: comment.author_display_name,
            is_demo: true,
          },
          body: comment.body,
          created_at: comment.created_at,
          moderated_at: null,
          moderated_by: null,
          moderation_status: 'visible',
          moderation_reason: null,
          is_demo: true,
        });
      }
    }
    return rows;
  }

  // ==========================================================================
  // Write: discussion
  // ==========================================================================

  async createComment(
    passportId: string,
    viewer: ViewerContext,
    input: { body: string; parent_comment_id: string | null }
  ): Promise<CreateCommentResult> {
    const body = String(input.body ?? '').trim();
    if (!body) fail(400, 'COMMENT_EMPTY', 'Write something before posting a comment.');
    if (body.length > env.COMMENT_MAX_LENGTH) {
      fail(
        400,
        'COMMENT_TOO_LONG',
        `A comment is limited to ${env.COMMENT_MAX_LENGTH} characters.`
      );
    }

    if (!checkRateLimit(`comment:${viewer.userId}`, env.COMMENT_RATE_LIMIT_PER_MINUTE)) {
      fail(429, 'RATE_LIMITED', 'You are commenting very quickly. Wait a moment and try again.');
    }

    const demo = findDemoPost(passportId);
    let observationId: string | null = null;

    if (!demo) {
      const row = await communityPostRepository.findObservation(passportId);
      if (!row) fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
      const viewerIsOwner = await this.resolveOwnership(row, viewer);
      if (row.publication_status !== 'public' && !viewerIsOwner) {
        fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
      }
      observationId = row.id;
    }

    const parentId = input.parent_comment_id ?? null;
    if (parentId) {
      const parent = await communityPostRepository.findComment(passportId, parentId);
      if (!parent || parent.moderation_status !== 'visible') {
        fail(400, 'PARENT_NOT_FOUND', 'The comment you are replying to is no longer available.');
      }
    }

    const created = await communityPostRepository.insertComment({
      passport_id: passportId.trim(),
      observation_id: observationId,
      parent_comment_id: parentId,
      author_user_id: viewer.userId,
      body,
    });

    const author = (await identityFor(viewer.userId)) ?? {
      public_user_id: viewer.publicUserId,
      display_name: viewer.displayName ?? null,
      is_demo: false,
    };

    return {
      comment: {
        comment_id: created.id,
        parent_comment_id: created.parent_comment_id,
        author,
        body: created.body,
        created_at: created.created_at,
        edited_at: null,
        moderation_status: 'visible',
        reply_count: 0,
        replies: [],
        is_demo: false,
      },
      message: parentId ? 'Your reply was posted.' : 'Your comment was posted.',
    };
  }

  // ==========================================================================
  // Write: owner edits, privacy and answers
  // ==========================================================================

  /**
   * Updates the contributor's own text and the post's visibility.
   *
   * Every visibility change is written to the privacy audit trail with the
   * account that made it, so "who published this, and when" is answerable
   * later without trusting anybody's memory.
   */
  async updatePost(
    passportId: string,
    viewer: ViewerContext,
    input: {
      post_title?: string | null;
      user_report?: string | null;
      is_public?: boolean;
      location_precision?: string | null;
    }
  ): Promise<CommunityPostDetail> {
    const row = await communityPostRepository.findObservation(passportId);
    if (!row) {
      if (findDemoPost(passportId)) {
        fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be edited.');
      }
      fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
    }

    if (!(await this.resolveOwnership(row, viewer))) {
      fail(403, 'NOT_OWNER', 'Only the contributor who made this post can edit it.');
    }

    const patch: { post_title?: string | null; user_report?: string | null } = {};
    if (input.post_title !== undefined) {
      const title = input.post_title === null ? null : cleanText(input.post_title, MAX_TITLE_LENGTH);
      if (input.post_title !== null && !title) {
        fail(400, 'INVALID_TITLE', 'A title cannot be empty.');
      }
      patch.post_title = title;
    }
    if (input.user_report !== undefined) {
      patch.user_report =
        input.user_report === null ? null : cleanText(input.user_report, MAX_REPORT_LENGTH);
    }

    if (Object.keys(patch).length > 0) {
      await communityPostRepository.updatePostFields(row.passport_id, patch);
    }

    if (typeof input.is_public === 'boolean') {
      const next: PublicationStatus = input.is_public ? 'public' : 'private';
      if (next !== row.publication_status) {
        await communityPostRepository.setPublicationStatus(row.passport_id, next);
        await communityPostRepository.recordPrivacyAudit({
          observation_id: row.id,
          actor_user_id: viewer.userId,
          actor: 'owner',
          previous_privacy: row.publication_status,
          new_privacy: next,
          reason: input.is_public ? 'owner_published' : 'owner_made_private',
        });
        row.publication_status = next;
      }
    }

    if (input.location_precision !== undefined && input.location_precision !== null) {
      const precision = String(input.location_precision) as PublicLocationPrecision;
      if (!LOCATION_PRECISIONS.includes(precision)) {
        fail(400, 'INVALID_LOCATION_PRECISION', 'That location precision is not supported.');
      }
      const location = await communityPostRepository.findLocation(row.id);
      const previous = location?.public_location_precision ?? 'district';
      if (previous !== precision) {
        await communityPostRepository.setLocationPrecision(row.id, precision);
        await communityPostRepository.recordPrivacyAudit({
          observation_id: row.id,
          actor_user_id: viewer.userId,
          actor: 'owner',
          previous_privacy: previous,
          new_privacy: precision,
          reason: 'location_precision',
        });
      }
    }

    const detail = await this.getPost(row.passport_id, viewer);
    if (!detail) fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after the update.');
    return detail;
  }

  /**
   * Sets whether readers may download one attached document, or may only
   * preview it in the passport. The contributor who owns the post decides;
   * the change is persisted and reflected immediately in the public detail.
   */
  async updateAttachmentDownload(
    passportId: string,
    viewer: ViewerContext,
    attachmentId: string,
    allowDownload: boolean
  ): Promise<CommunityPostDetail> {
    const row = await communityPostRepository.findObservation(passportId);
    if (!row) {
      if (findDemoPost(passportId)) {
        fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be edited.');
      }
      fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
    }

    if (!(await this.resolveOwnership(row, viewer))) {
      fail(403, 'NOT_OWNER', 'Only the contributor who made this post can set download rights.');
    }

    const attachment = await communityPostRepository.updateAttachmentDownload(
      row.id,
      attachmentId,
      allowDownload
    );
    if (!attachment) {
      fail(404, 'ATTACHMENT_NOT_FOUND', 'That attached document does not exist.');
    }

    const detail = await this.getPost(row.passport_id, viewer);
    if (!detail) fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after the update.');
    return detail;
  }

  /**
   * Answers one AI question as the person who owns the post.
   *
   * The answer records who answered it, so a question the model asked is never
   * readable as though the model had also answered itself.
   */
  async answerQuestion(
    passportId: string,
    viewer: ViewerContext,
    questionId: string,
    answerInput: string
  ): Promise<CommunityPostDetail> {
    const answer = String(answerInput ?? '').trim();
    if (!answer) fail(400, 'ANSWER_EMPTY', 'Write your answer before submitting it.');
    if (answer.length > MAX_REPORT_LENGTH) {
      fail(400, 'ANSWER_TOO_LONG', 'That answer is too long.');
    }

    const row = await communityPostRepository.findObservation(passportId);
    if (!row) {
      if (findDemoPost(passportId)) {
        fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be answered.');
      }
      fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
    }

    if (!(await this.resolveOwnership(row, viewer))) {
      fail(403, 'NOT_OWNER', 'Only the contributor who made this post can answer its questions.');
    }

    const persisted = await communityPostRepository.listQuestions(row.id);
    let target = persisted.find((entry) => entry.question_id === questionId) ?? null;

    if (!target) {
      const index = Number(questionId.replace(/^q-/, ''));
      const text = Number.isFinite(index) ? (row.questions_for_user ?? [])[index - 1] : undefined;
      if (!text || !String(text).trim()) {
        fail(404, 'QUESTION_NOT_FOUND', 'That question is not on this post.');
      }
      target = await communityPostRepository.insertQuestion({
        observation_id: row.id,
        question_id: questionId,
        question: String(text),
      });
    }

    if (target.status === 'answered') {
      fail(409, 'ALREADY_ANSWERED', 'This question already has an answer.');
    }

    await communityPostRepository.answerQuestion({
      questionId: target.id,
      answer,
      answeredBy: 'owner',
      answeredByUserId: viewer.userId,
    });

    const detail = await this.getPost(row.passport_id, viewer);
    if (!detail) fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after answering.');
    return detail;
  }

  // ==========================================================================
  // Write: gallery
  // ==========================================================================

  /**
   * Stores one uploaded image or clip.
   *
   * Bytes arrive base64 encoded, are validated by signature rather than by the
   * declared type, and are refused above the configured size instead of being
   * silently truncated.
   */
  async addMedia(
    passportId: string,
    viewer: ViewerContext,
    input: { content_base64?: string; mime_type?: string; caption?: string; role?: string }
  ): Promise<PublicMediaItem> {
    const row = await communityPostRepository.findObservation(passportId);
    if (!row) {
      if (findDemoPost(passportId)) {
        fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot receive files.');
      }
      fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
    }

    if (!(await this.resolveOwnership(row, viewer))) {
      fail(403, 'NOT_OWNER', 'Only the contributor who made this post can add files to it.');
    }

    const encoded = String(input.content_base64 ?? '').trim();
    if (!encoded) fail(400, 'MEDIA_EMPTY', 'No file was received.');

    const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      fail(400, 'MEDIA_INVALID', 'The file could not be decoded.');
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) fail(400, 'MEDIA_EMPTY', 'The uploaded file was empty.');
    if (buffer.length > env.POST_MEDIA_MAX_STORED_BYTES) {
      fail(
        413,
        'MEDIA_TOO_LARGE',
        `Files up to ${Math.floor(env.POST_MEDIA_MAX_STORED_BYTES / 1_000_000)} MB can be stored on this deployment.`
      );
    }

    const validation = validateMedia(buffer, input.mime_type);
    if (!validation.isValid || !validation.mediaKind || !validation.detectedMimeType) {
      fail(415, 'MEDIA_UNSUPPORTED', 'Only JPEG, PNG, WebP images and MP4 video can be stored.');
    }

    const role = (input.role ?? 'field') as MediaRole;
    if (!MEDIA_ROLES.includes(role)) {
      fail(400, 'MEDIA_ROLE_INVALID', 'That gallery position is not supported.');
    }

    const caption = input.caption ? cleanText(input.caption, MAX_CAPTION_LENGTH) : null;
    const existing = await communityPostRepository.listMedia(row.id);
    const isVideo = validation.mediaKind === 'video';

    const stored = await communityPostRepository.insertMedia({
      observation_id: row.id,
      media_type: validation.mediaKind,
      mime_type: validation.detectedMimeType,
      file_size: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      source_media_id: `web:${crypto.randomUUID()}`,
      storage_status: 'stored',
      caption,
      media_role: isVideo ? 'video' : role,
      sort_order: existing.length,
      is_public: row.publication_status === 'public',
      content_base64: base64,
      stored_by_user_id: viewer.userId,
      visibility: row.publication_status === 'public' ? 'public' : 'private',
    });

    return mediaItemFromRow(stored);
  }

  // ==========================================================================
  // Read: the contributor's own posts
  // ==========================================================================

  async listMyPosts(viewer: ViewerContext): Promise<{ data: MyPostSummary[] }> {
    const rows = await communityPostRepository.listObservationsByOwner(viewer.userId);
    const data: MyPostSummary[] = [];

    for (const row of rows) {
      const [media, persistedQuestions, location, discussion] = await Promise.all([
        communityPostRepository.listMedia(row.id),
        communityPostRepository.listQuestions(row.id),
        communityPostRepository.findLocation(row.id),
        communityPostRepository.listComments(row.passport_id),
      ]);

      const questions = this.assembleQuestions(row, persistedQuestions);

      data.push({
        passport_id: row.passport_id,
        title: this.titleOf(row),
        is_public: row.publication_status === 'public',
        observation_category: row.observation_category ?? 'unknown',
        created_at: row.created_at,
        comment_count: discussion.filter((entry) => entry.moderation_status === 'visible').length,
        media_count: media.length,
        open_question_count: questions.filter((entry) => entry.status === 'open').length,
        location_precision: location?.public_location_precision ?? 'district',
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      });
    }

    return { data };
  }

  /**
   * "My questions": every discussion thread this account started, across every
   * post, newest first, each with the replies left on it.
   *
   * Reading the threads from the posts they belong to - rather than from the
   * author's rows alone - is what makes a reply from somebody else visible here
   * and lets the reader answer it back from the same list.
   */
  async listMyQuestions(viewer: ViewerContext): Promise<{ data: MyDiscussionThread[] }> {
    const mine = await communityPostRepository.listCommentsByAuthor(viewer.userId);
    const roots = mine.filter(
      (row) => row.parent_comment_id === null && row.moderation_status === 'visible'
    );

    const titleCache = new Map<string, string>();
    const data: MyDiscussionThread[] = [];

    for (const root of roots) {
      const demo = findDemoPost(root.passport_id);
      let title = titleCache.get(root.passport_id);
      if (title === undefined) {
        if (demo) title = demo.title;
        else {
          const row = await communityPostRepository.findObservation(root.passport_id);
          title = row ? this.titleOf(row) : `Observation ${root.passport_id}`;
        }
        titleCache.set(root.passport_id, title);
      }

      const { comments } = await this.assembleComments(root.passport_id, Boolean(demo));
      const thread = comments.find((comment) => comment.comment_id === root.id);

      data.push({
        comment_id: root.id,
        passport_id: root.passport_id,
        post_title: title,
        body: root.body,
        created_at: root.created_at,
        moderation_status: root.moderation_status,
        reply_count: thread?.reply_count ?? 0,
        replies: thread?.replies ?? [],
      });
    }

    data.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { data };
  }

  /**
   * Demonstration comments, published for readers who cannot write.
   *
   * Used by the public read path so a demonstration post shows its threaded
   * discussion even before anybody signs in.
   */
  demoDiscussion(passportId: string): PublicComment[] {
    return demoPublicComments(passportId);
  }

  /** Demonstration comment count for a post, for the list endpoints. */
  demoCommentCount(passportId: string): number {
    return demoComments(passportId).length;
  }
}

export const communityPostService = new CommunityPostService();

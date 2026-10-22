import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
import type {
  CommentRow,
  MediaRole,
  ModerationStatus,
  QuestionRow,
} from '../types/community-posts.types.js';
import type {
  AttachmentKind,
  ObservationAttachmentRow,
  ObservationLocationRow,
  ObservationMediaRow,
  ObservationRow,
  PublicationStatus,
  PublicLocationPrecision,
} from '../types/database.types.js';

/**
 * Community observation posts (Stage 12).
 *
 * REAL DATA POLICY: there is no synthetic observation here and no seeded
 * collection. `registerObservationRecord` is the only way a row enters the
 * development memory store, exactly as `registerPublicObservation` is for the
 * public read path; the application never calls it to invent content.
 *
 * When Supabase is configured it is authoritative. When it is not, a
 * per-process store keeps a development instance working, and production
 * refuses writes instead of silently keeping them in memory where a restart
 * would erase somebody's post.
 */

export interface PrivacyAuditEntry {
  observation_id: string;
  actor_user_id: string | null;
  actor: string;
  previous_privacy: string;
  new_privacy: string;
  reason: string | null;
}

export interface InsertCommentInput {
  passport_id: string;
  observation_id: string | null;
  parent_comment_id: string | null;
  author_user_id: string;
  body: string;
}

export interface InsertMediaInput {
  observation_id: string;
  media_type: 'image' | 'video';
  mime_type: string;
  file_size: number;
  sha256: string | null;
  source_media_id: string;
  storage_status: 'metadata_only' | 'stored';
  caption: string | null;
  media_role: MediaRole;
  sort_order: number;
  is_public: boolean;
  content_base64: string | null;
  stored_by_user_id: string | null;
  visibility: 'private' | 'pending' | 'public' | 'hidden';
}

interface MemoryStore {
  observations: Map<string, ObservationRow>;
  locations: Map<string, ObservationLocationRow>;
  media: Map<string, ObservationMediaRow[]>;
  questions: Map<string, QuestionRow[]>;
  comments: Map<string, CommentRow[]>;
  attachments: Map<string, ObservationAttachmentRow[]>;
  audit: PrivacyAuditEntry[];
}

const memory: MemoryStore = {
  observations: new Map(),
  locations: new Map(),
  media: new Map(),
  questions: new Map(),
  comments: new Map(),
  attachments: new Map(),
  audit: [],
};

export class CommunityPostRepository {
  private get ready(): boolean {
    return isDatabaseConfigured();
  }

  /**
   * Writes need a real database outside development. Silently buffering a
   * privacy change in memory would mean the contributor's choice to hide a
   * post evaporates on the next restart.
   */
  private requireDatabase(operation: string): void {
    if (!this.ready && env.IS_PRODUCTION) {
      throw new Error(
        `Post ${operation} requires a configured database. ` +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 016_community_posts.sql.'
      );
    }
  }

  private get database(): boolean {
    return this.ready;
  }

  /**
   * A configured database is authoritative: when a read against it fails we
   * surface a 503 rather than answering from the process-local store. Falling
   * back would make an outage look like "no posts", and would hide hidden or
   * private records behind an empty list.
   */
  private databaseFailure(operation: string, err: unknown): ServiceUnavailableError {
    logger.error('Database read failed; refusing to fall back to process memory', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    return new ServiceUnavailableError(operation, err);
  }

  // ==========================================================================
  // Observations
  // ==========================================================================

  /**
   * Registers a row in the development memory store.
   *
   * Called by tests, and available to the publish path. Never called by the
   * application on its own: an empty store is the honest default.
   */
  registerObservationRecord(row: ObservationRow): void {
    memory.observations.set(row.passport_id, row);
  }

  async findObservation(passportId: string): Promise<ObservationRow | null> {
    if (!passportId) return null;
    const wanted = passportId.trim().toUpperCase();

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observations') as any)
          .select('*')
          .ilike('passport_id', wanted)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return data as ObservationRow;
      } catch (err) {
        throw this.databaseFailure('observation read for post card', err);
      }
    }

    for (const row of memory.observations.values()) {
      if (row.passport_id.toUpperCase() === wanted) return row;
    }
    return null;
  }

  async listObservationsByOwner(userId: string): Promise<ObservationRow[]> {
    if (!userId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observations') as any)
          .select('*')
          .eq('owner_user_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as ObservationRow[];
      } catch (err) {
        throw this.databaseFailure('contributor post list', err);
      }
    }

    return Array.from(memory.observations.values())
      .filter((row) => row.owner_user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async updatePostFields(
    passportId: string,
    patch: { post_title?: string | null; user_report?: string | null }
  ): Promise<void> {
    this.requireDatabase('editing');
    const payload = { ...patch, community_updated_at: nowIso() };

    if (this.database) {
      try {
        const { error } = await (supabase.from('observations') as any)
          .update(payload)
          .ilike('passport_id', passportId.trim());
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        logger.warn('Could not save post edits in the database', { error: String(err) });
        throw err;
      }
    }

    const row = await this.findObservation(passportId);
    if (row) Object.assign(row, payload);
  }

  async setPublicationStatus(passportId: string, status: PublicationStatus): Promise<void> {
    this.requireDatabase('privacy changes');

    if (this.database) {
      try {
        const { error } = await (supabase.from('observations') as any)
          .update({
            publication_status: status,
            published_at: status === 'public' ? nowIso() : null,
            updated_at: nowIso(),
          })
          .ilike('passport_id', passportId.trim());
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        logger.warn('Could not save the privacy change in the database', { error: String(err) });
        throw err;
      }
    }

    const row = await this.findObservation(passportId);
    if (row) {
      row.publication_status = status;
      row.published_at = status === 'public' ? nowIso() : null;
      row.updated_at = nowIso();
    }
  }

  /** Attaches the signed-in account as owner, once, for a post that has none. */
  async linkOwner(passportId: string, userId: string): Promise<void> {
    if (!userId) return;
    this.requireDatabase('ownership');

    if (this.database) {
      try {
        const { error } = await (supabase.from('observations') as any)
          .update({ owner_user_id: userId })
          .ilike('passport_id', passportId.trim())
          .is('owner_user_id', null);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        logger.warn('Could not link the owner to the post', { error: String(err) });
        throw err;
      }
    }

    const row = await this.findObservation(passportId);
    if (row && !row.owner_user_id) row.owner_user_id = userId;
  }

  // ==========================================================================
  // Location
  // ==========================================================================

  async findLocation(observationId: string): Promise<ObservationLocationRow | null> {
    if (!observationId) return null;

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_locations') as any)
          .select('*')
          .eq('observation_id', observationId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return data as ObservationLocationRow;
      } catch (err) {
        throw this.databaseFailure('post location read', err);
      }
    }

    return memory.locations.get(observationId) ?? null;
  }

  async setLocationPrecision(
    observationId: string,
    precision: PublicLocationPrecision
  ): Promise<void> {
    this.requireDatabase('location privacy changes');

    if (this.database) {
      try {
        const { error } = await (supabase.from('observation_locations') as any)
          .update({ public_location_precision: precision })
          .eq('observation_id', observationId);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        logger.warn('Could not save the location precision change', { error: String(err) });
        throw err;
      }
    }

    const location = memory.locations.get(observationId);
    if (location) location.public_location_precision = precision;
  }

  registerLocationRecord(location: ObservationLocationRow): void {
    memory.locations.set(location.observation_id, location);
  }

  // ==========================================================================
  // Media
  // ==========================================================================

  async listMedia(observationId: string): Promise<ObservationMediaRow[]> {
    if (!observationId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_media') as any)
          .select('*')
          .eq('observation_id', observationId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as ObservationMediaRow[];
      } catch (err) {
        throw this.databaseFailure('post gallery read', err);
      }
    }

    return memory.media.get(observationId) ?? [];
  }

  async insertMedia(input: InsertMediaInput): Promise<ObservationMediaRow> {
    this.requireDatabase('media uploads');

    const row: ObservationMediaRow = {
      id: crypto.randomUUID(),
      observation_id: input.observation_id,
      media_type: input.media_type,
      mime_type: input.mime_type,
      file_size: input.file_size,
      sha256: input.sha256,
      source_media_id: input.source_media_id,
      storage_status: input.storage_status,
      site_id: null,
      file_path: null,
      capture_date: null,
      caption: input.caption,
      media_category: null,
      view_type: null,
      duration_seconds: null,
      width_px: null,
      height_px: null,
      visibility: input.visibility,
      moderation_status: 'visible',
      moderated_by: null,
      moderated_at: null,
      media_role: input.media_role,
      sort_order: input.sort_order,
      is_public: input.is_public,
      content_base64: input.content_base64,
      stored_by_user_id: input.stored_by_user_id,
      updated_at: nowIso(),
      created_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_media') as any)
        .insert(row)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ObservationMediaRow;
    }

    const list = memory.media.get(input.observation_id) ?? [];
    list.push(row);
    memory.media.set(input.observation_id, list);
    return row;
  }

  async findMedia(mediaId: string): Promise<ObservationMediaRow | null> {
    if (!mediaId) return null;

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_media') as any)
          .select('*')
          .eq('id', mediaId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return data as ObservationMediaRow;
      } catch (err) {
        throw this.databaseFailure('gallery item read', err);
      }
    }

    for (const list of memory.media.values()) {
      const match = list.find((entry) => entry.id === mediaId);
      if (match) return match;
    }
    return null;
  }

  // ==========================================================================
  // Attached documents, research and reports
  // ==========================================================================

  async listAttachments(observationId: string): Promise<ObservationAttachmentRow[]> {
    if (!observationId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_attachments') as any)
          .select('*')
          .eq('observation_id', observationId)
          .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as ObservationAttachmentRow[];
      } catch (err) {
        throw this.databaseFailure('attachment list', err);
      }
    }

    return memory.attachments.get(observationId) ?? [];
  }

  async insertAttachment(input: {
    observation_id: string;
    kind: AttachmentKind;
    title: string;
    description: string | null;
    filename: string;
    mime_type: string;
    size_bytes: number | null;
    url: string;
    is_public: boolean;
    allow_download?: boolean;
    uploader_user_id: string | null;
  }): Promise<ObservationAttachmentRow> {
    this.requireDatabase('attachment uploads');

    // Attachments are PDF documents only. Anything else is refused so a report,
    // research note or document stored next to a visit is always printable and
    // previewable in the passport.
    if ((input.mime_type ?? '').toLowerCase() !== 'application/pdf') {
      throw new Error('Attachments are supported as PDF only.');
    }

    const row: ObservationAttachmentRow = {
      id: crypto.randomUUID(),
      observation_id: input.observation_id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      filename: input.filename,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      url: input.url,
      is_public: input.is_public,
      allow_download: input.allow_download ?? true,
      uploader_user_id: input.uploader_user_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_attachments') as any)
        .insert(row)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as ObservationAttachmentRow;
    }

    const list = memory.attachments.get(input.observation_id) ?? [];
    list.push(row);
    memory.attachments.set(input.observation_id, list);
    return row;
  }

  /**
   * Flips whether a reader may download one attachment, or only preview it.
   * Ownership is checked by the caller; this only persists the toggle.
   */
  async updateAttachmentDownload(
    observationId: string,
    attachmentId: string,
    allowDownload: boolean
  ): Promise<ObservationAttachmentRow | null> {
    this.requireDatabase('attachment download permissions');

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_attachments') as any)
          .update({
            allow_download: allowDownload,
            updated_at: nowIso(),
          })
          .eq('id', attachmentId)
          .eq('observation_id', observationId)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        if (data) return data as ObservationAttachmentRow;
      } catch (err) {
        throw this.databaseFailure('attachment download permission update', err);
      }
    }

    const list = memory.attachments.get(observationId) ?? [];
    const row = list.find((entry) => entry.id === attachmentId) ?? null;
    if (row) {
      row.allow_download = allowDownload;
      row.updated_at = nowIso();
    }
    return row;
  }

  // ==========================================================================
  // AI questions
  // ==========================================================================

  async listQuestions(observationId: string): Promise<QuestionRow[]> {
    if (!observationId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_questions') as any)
          .select('*')
          .eq('observation_id', observationId)
          .order('asked_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as QuestionRow[];
      } catch (err) {
        throw this.databaseFailure('AI question list', err);
      }
    }

    return memory.questions.get(observationId) ?? [];
  }

  async insertQuestion(input: {
    observation_id: string;
    question_id: string;
    question: string;
    is_public?: boolean;
  }): Promise<QuestionRow> {
    this.requireDatabase('question storage');

    const row: QuestionRow = {
      id: crypto.randomUUID(),
      observation_id: input.observation_id,
      question_id: input.question_id,
      question: input.question,
      asked_by: 'ai',
      asked_at: nowIso(),
      status: 'open',
      answer: null,
      answered_at: null,
      answered_by: null,
      answered_by_user_id: null,
      is_public: input.is_public ?? true,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_questions') as any)
        .insert(row)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as QuestionRow;
    }

    const list = memory.questions.get(input.observation_id) ?? [];
    list.push(row);
    memory.questions.set(input.observation_id, list);
    return row;
  }

  /**
   * Records an answer and who gave it.
   *
   * `answered_by` is always written: a question answered by the contributor
   * must never be readable as if the model had answered it.
   */
  async answerQuestion(input: {
    questionId: string;
    answer: string;
    answeredBy: 'owner' | 'whatsapp_sender' | 'system';
    answeredByUserId: string | null;
  }): Promise<QuestionRow | null> {
    this.requireDatabase('question answers');

    const patch = {
      answer: input.answer,
      answered_at: nowIso(),
      answered_by: input.answeredBy,
      answered_by_user_id: input.answeredByUserId,
      status: 'answered' as const,
      updated_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_questions') as any)
        .update(patch)
        .eq('id', input.questionId)
        .eq('status', 'open')
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as QuestionRow) ?? null;
    }

    for (const list of memory.questions.values()) {
      const match = list.find((entry) => entry.id === input.questionId && entry.status === 'open');
      if (match) {
        Object.assign(match, patch);
        return match;
      }
    }
    return null;
  }

  registerQuestions(observationId: string, rows: QuestionRow[]): void {
    memory.questions.set(observationId, rows);
  }

  // ==========================================================================
  // Comments
  // ==========================================================================

  async listComments(passportId: string): Promise<CommentRow[]> {
    if (!passportId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_comments') as any)
          .select('*')
          .eq('passport_id', passportId.trim())
          .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as CommentRow[];
      } catch (err) {
        throw this.databaseFailure('discussion read', err);
      }
    }

    return memory.comments.get(passportId.trim()) ?? [];
  }

  /**
   * Every comment this account has written, across all posts, oldest first.
   * The caller groups them into threads; nothing author-specific is exposed.
   */
  async listCommentsByAuthor(userId: string): Promise<CommentRow[]> {
    if (!userId) return [];

    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_comments') as any)
          .select('*')
          .eq('author_user_id', userId)
          .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as CommentRow[];
      } catch (err) {
        throw this.databaseFailure('contributor comment list', err);
      }
    }

    const all: CommentRow[] = [];
    for (const list of memory.comments.values()) all.push(...list);
    return all
      .filter((row) => row.author_user_id === userId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async insertComment(input: InsertCommentInput): Promise<CommentRow> {
    this.requireDatabase('discussion');

    const row: CommentRow = {
      id: crypto.randomUUID(),
      passport_id: input.passport_id,
      observation_id: input.observation_id,
      parent_comment_id: input.parent_comment_id,
      author_user_id: input.author_user_id,
      body: input.body,
      moderation_status: 'visible',
      moderation_reason: null,
      moderated_by: null,
      moderated_at: null,
      edited_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_comments') as any)
        .insert({
          passport_id: row.passport_id,
          observation_id: input.observation_id || null,
          parent_comment_id: input.parent_comment_id,
          author_user_id: input.author_user_id,
          body: input.body,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CommentRow;
    }

    const list = memory.comments.get(input.passport_id) ?? [];
    list.push(row);
    memory.comments.set(input.passport_id, list);
    return row;
  }

  /** True when a reply target exists on the same post. */
  async findComment(passportId: string, commentId: string): Promise<CommentRow | null> {
    const rows = await this.listComments(passportId);
    return rows.find((row) => row.id === commentId) ?? null;
  }

  /**
   * Moderation list, newest first.
   *
   * `moderation_status` filters only what is asked for; the default is every
   * comment, because a queue that hides already-hidden entries would make
   * "what did we hide and why" unanswerable.
   */
  async listCommentsForModeration(params: {
    limit: number;
    offset: number;
    passportId?: string;
    status?: ModerationStatus;
  }): Promise<{ rows: CommentRow[]; total: number }> {
    if (this.database) {
      try {
        let query: any = (supabase.from('observation_comments') as any).select('*', {
          count: 'exact',
        });
        if (params.passportId) query = query.ilike('passport_id', params.passportId.trim());
        if (params.status) query = query.eq('moderation_status', params.status);
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(params.offset, params.offset + params.limit - 1);
        if (error) throw new Error(error.message);
        const rows = (data as CommentRow[]) ?? [];
        return { rows, total: count ?? rows.length };
      } catch (err) {
        throw this.databaseFailure('moderation queue read', err);
      }
    }

    const all: CommentRow[] = [];
    for (const list of memory.comments.values()) all.push(...list);
    const filtered = all.filter((row) => {
      if (params.passportId && row.passport_id.toUpperCase() !== params.passportId.trim().toUpperCase()) {
        return false;
      }
      if (params.status && row.moderation_status !== params.status) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      rows: sorted.slice(params.offset, params.offset + params.limit),
      total: sorted.length,
    };
  }

  /** One comment by its own id, for the moderation queue. */
  async findCommentById(commentId: string): Promise<CommentRow | null> {
    if (!commentId) return null;
    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_comments') as any)
          .select('*')
          .eq('id', commentId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as CommentRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('comment read', err);
      }
    }
    for (const list of memory.comments.values()) {
      const match = list.find((entry) => entry.id === commentId);
      if (match) return match;
    }
    return null;
  }

  /**
   * Sets a comment's moderation status with the actor and reason that made the
   * decision, so the queue records who did what and why. Returns the updated
   * row, or null when the comment does not exist.
   */
  async setCommentModeration(
    commentId: string,
    status: ModerationStatus,
    reason: string,
    moderatedBy: string
  ): Promise<CommentRow | null> {
    this.requireDatabase('comment moderation');
    const patch = {
      moderation_status: status,
      moderation_reason: reason,
      moderated_by: moderatedBy,
      moderated_at: nowIso(),
      updated_at: nowIso(),
    };

    if (this.database) {
      const { data, error } = await (supabase.from('observation_comments') as any)
        .update(patch)
        .eq('id', commentId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CommentRow) ?? null;
    }

    for (const list of memory.comments.values()) {
      const match = list.find((entry) => entry.id === commentId);
      if (match) {
        Object.assign(match, patch);
        return match;
      }
    }
    return null;
  }

  // ==========================================================================
  // Privacy audit
  // ==========================================================================

  async recordPrivacyAudit(entry: PrivacyAuditEntry): Promise<void> {
    this.requireDatabase('privacy auditing');

    if (this.database) {
      try {
        const { error } = await (supabase.from('observation_privacy_audit') as any).insert(entry);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        logger.error('Could not record the privacy audit entry', { error: String(err) });
        throw err;
      }
    }

    memory.audit.push(entry);
  }

  /** Audit entries recorded for one post. Used by the owner and by tests. */
  async listPrivacyAudit(observationId: string): Promise<PrivacyAuditEntry[]> {
    if (this.database) {
      try {
        const { data, error } = await (supabase.from('observation_privacy_audit') as any)
          .select('*')
          .eq('observation_id', observationId)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        if (Array.isArray(data)) return data as PrivacyAuditEntry[];
      } catch (err) {
        throw this.databaseFailure('privacy audit read', err);
      }
    }
    return memory.audit.filter((entry) => entry.observation_id === observationId);
  }
}

export const communityPostRepository = new CommunityPostRepository();

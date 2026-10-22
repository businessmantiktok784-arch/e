import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import type { CommunityMediaKind, ModerationStatus } from '../types/community.types.js';

/**
 * Moderation ledger for community attachments (Issue D).
 *
 * Before this repository existed, `community-media.service.ts` wrote bytes to
 * the `community-media` bucket and answered with a URL without ever recording a
 * moderatable row, so nothing distinguished a moderated attachment from a fresh
 * anonymous upload. The storage bucket is the only place the record lived, and
 * a bucket listing cannot express "pending review".
 *
 * Every public read now goes through a row in `public.community_media`. A row is
 * created `pending_review`/`is_public = false`, and only a Super Admin can move
 * it to `visible`. When Supabase is configured it is authoritative: a failed
 * lookup throws `ServiceUnavailableError` rather than being read as "not found",
 * because a database outage must not be mistaken for "this attachment is safe".
 */

export interface CommunityMediaRecord {
  id: string;
  media_type: CommunityMediaKind;
  mime_type: string | null;
  storage_path: string | null;
  caption: string | null;
  moderation_status: ModerationStatus;
  is_public: boolean;
  contributor_hash: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_reason: string | null;
  created_at: string;
}

export interface InsertCommunityMediaInput {
  id: string;
  kind: CommunityMediaKind;
  mimeType: string;
  storagePath: string;
  caption: string | null;
  contributorHash: string | null;
}

class CommunityMediaRepository {
  get ready(): boolean {
    return isDatabaseConfigured();
  }

  private unavailable(operation: string, err: unknown): never {
    logger.error('Community media database operation failed', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new ServiceUnavailableError(operation, err);
  }

  /**
   * Records a freshly uploaded attachment as hidden pending review.
   *
   * Callers must delete the stored object if this throws, so an attachment that
   * has no moderation row never exists in the bucket.
   */
  async insertPending(input: InsertCommunityMediaInput): Promise<CommunityMediaRecord> {
    try {
      const { data, error } = await (supabase.from('community_media') as any)
        .insert({
          id: input.id,
          media_type: input.kind,
          mime_type: input.mimeType,
          storage_path: input.storagePath,
          caption: input.caption,
          contributor_hash: input.contributorHash,
          moderation_status: 'pending_review',
          is_public: false,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CommunityMediaRecord;
    } catch (err) {
      this.unavailable('community media record creation', err);
    }
  }

  /** Reads the moderation row. A database error is thrown, never read as "absent". */
  async findById(id: string): Promise<CommunityMediaRecord | null> {
    try {
      const { data, error } = await (supabase.from('community_media') as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CommunityMediaRecord) ?? null;
    } catch (err) {
      this.unavailable('community media lookup', err);
    }
  }

  /**
   * Applies a moderation decision. `visible` is the only status that publishes
   * bytes; every other status clears `is_public`.
   */
  async setModerationStatus(
    id: string,
    status: ModerationStatus,
    reason: string | null,
    actor: string
  ): Promise<CommunityMediaRecord | null> {
    try {
      const { data, error } = await (supabase.from('community_media') as any)
        .update({
          moderation_status: status,
          is_public: status === 'visible',
          moderated_by: actor,
          moderated_at: new Date().toISOString(),
          moderation_reason: reason,
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CommunityMediaRecord) ?? null;
    } catch (err) {
      this.unavailable('community media moderation', err);
    }
  }
}

export const communityMediaRepository = new CommunityMediaRepository();

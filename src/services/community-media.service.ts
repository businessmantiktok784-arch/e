import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { validateMedia } from '../utils/image-validator.js';
import { communityMediaRepository } from '../repositories/community-media.repository.js';
import type {
  AddCommunityMediaInput,
  CommunityMediaKind,
  ModerationStatus,
  PublicCommunityMedia,
} from '../types/community.types.js';

/**
 * Community Discovery attachments.
 *
 * An investigation, a piece of evidence, a question or an answer may carry
 * images. Bytes are validated by signature rather than the declared type, and
 * are refused above the configured size instead of being silently truncated.
 *
 * Storage has two honest modes:
 *
 *   - Demo mode (no database configured): bytes are held in process memory and
 *     served straight back. They are labelled `is_demo` and vanish on restart.
 *   - Database mode: bytes go to the private `community-media` object-storage
 *     bucket and a `community_media` moderation row is written first. A fresh
 *     upload is `pending_review` and `is_public = false`, so it is never served
 *     to anyone until a Super Admin marks it `visible`. Public reads issue a
 *     short-lived signed URL only for a row that is both visible and public.
 *
 * The bucket must be private. Migration `026_community_media_moderation.sql`
 * flips `storage.buckets.public` to false and records the moderation columns.
 */

const BUCKET = 'community-media';

/** Signed download URLs are short-lived; a leaked link stops working quickly. */
const SIGNED_URL_TTL_SECONDS = 300;

interface StoredMedia {
  id: string;
  kind: CommunityMediaKind;
  mime_type: string;
  base64: string;
  caption: string | null;
  moderation_status: ModerationStatus;
  contributor_hash: string | null;
  is_demo: boolean;
  created_at: string;
}

function publicUrl(id: string): string {
  return `/api/community/media/${encodeURIComponent(id)}`;
}

class CommunityMediaService {
  private demoStore = new Map<string, StoredMedia>();

  /** True when labelled demonstration media is served from memory. */
  get demoActive(): boolean {
    return env.DEMO_POSTS_ENABLED && !isDatabaseConfigured();
  }

  /**
   * Stores one uploaded image or clip and returns its public descriptor.
   *
   * The returned `id` is what a caller attaches as a `media_id`.
   */
  async add(
    input: AddCommunityMediaInput,
    contributorHash: string | null
  ): Promise<PublicCommunityMedia> {
    const encoded = String(input.contentBase64 ?? '').trim();
    if (!encoded) throw new Error('No file was received.');

    const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error('The file could not be decoded.');
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw new Error('The uploaded file was empty.');
    if (buffer.length > env.POST_MEDIA_MAX_STORED_BYTES) {
      throw new Error(
        `Files up to ${Math.floor(env.POST_MEDIA_MAX_STORED_BYTES / 1_000_000)} MB can be attached.`
      );
    }

    const validation = validateMedia(buffer, input.mimeType);
    if (!validation.isValid || !validation.mediaKind || !validation.detectedMimeType) {
      throw new Error('Only JPEG, PNG, WebP images and MP4 video can be attached.');
    }

    const id = crypto.randomUUID();
    const kind: CommunityMediaKind = validation.mediaKind === 'video' ? 'video' : 'image';
    const caption = input.caption ? String(input.caption).slice(0, 300) : null;
    const createdAt = new Date().toISOString();

    if (this.demoActive) {
      this.demoStore.set(id, {
        id,
        kind,
        mime_type: validation.detectedMimeType,
        base64,
        caption,
        moderation_status: 'visible',
        contributor_hash: contributorHash,
        is_demo: true,
        created_at: createdAt,
      });
      return {
        id,
        kind,
        mime_type: validation.detectedMimeType,
        url: publicUrl(id),
        moderation_status: 'visible',
        is_demo: true,
        created_at: createdAt,
      };
    }

    const extension = this.extensionFor(validation.detectedMimeType);
    const path = `${id}.${extension}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: validation.detectedMimeType, upsert: false });
    if (error) {
      logger.warn('Community media upload failed', { error: error.message });
      throw new Error('The file could not be stored. Nothing was attached.');
    }

    // Record the moderation row before answering. If the ledger write fails the
    // stored object is removed, so bytes in the bucket always have a matching
    // moderation row and can never be served un-moderated.
    try {
      await communityMediaRepository.insertPending({
        id,
        kind,
        mimeType: validation.detectedMimeType,
        storagePath: path,
        caption,
        contributorHash,
      });
    } catch (err) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
      if (removeError) {
        logger.error('Failed to remove orphaned community media after ledger failure', {
          error: removeError.message,
        });
      }
      throw err;
    }

    // A fresh upload is hidden until a platform owner confirms it. This mirrors
    // the observation-media flow: anonymous uploads are never shown on trust.
    return {
      id,
      kind,
      mime_type: validation.detectedMimeType,
      url: publicUrl(id),
      moderation_status: 'pending_review',
      is_demo: false,
      created_at: createdAt,
    };
  }

  /** Returns stored bytes for a demonstration attachment. */
  getDemoBytes(id: string): { buffer: Buffer; mimeType: string } | null {
    const record = this.demoStore.get(id);
    if (!record || record.moderation_status !== 'visible') return null;
    return { buffer: Buffer.from(record.base64, 'base64'), mimeType: record.mime_type };
  }

  /**
   * Returns a short-lived signed URL for a moderated attachment, or null when it
   * is not available for public display.
   *
   * Availability is decided solely by the `community_media` moderation row: a
   * row must be `visible` and `is_public`. A missing row and a `pending_review`,
   * `hidden` or `removed` row all answer null, so a fresh anonymous upload is
   * never readable. A database failure throws rather than being read as absent.
   */
  async resolvePublicUrl(id: string): Promise<string | null> {
    if (this.demoActive) {
      const record = this.demoStore.get(id);
      return record && record.moderation_status === 'visible' ? publicUrl(id) : null;
    }

    const record = await communityMediaRepository.findById(id);
    if (!record || !record.storage_path) return null;
    if (record.moderation_status !== 'visible' || !record.is_public) return null;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(record.storage_path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      logger.warn('Community media signed URL creation failed', { error: error.message });
      return null;
    }
    return data?.signedUrl ?? null;
  }

  /**
   * Applies a moderation decision. Demo media is changed in memory; a real
   * deployment writes the ledger row. Returns false when the attachment does not
   * exist, true when the decision was applied.
   */
  async setModeration(
    id: string,
    status: ModerationStatus,
    reason: string | null,
    actor: string
  ): Promise<boolean> {
    if (this.demoActive) {
      return this.setDemoModeration(id, status);
    }
    const record = await communityMediaRepository.setModerationStatus(id, status, reason, actor);
    return record !== null;
  }

  setDemoModeration(id: string, status: ModerationStatus): boolean {
    const record = this.demoStore.get(id);
    if (!record) return false;
    record.moderation_status = status;
    return true;
  }

  private extensionFor(mimeType: string): string {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'video/mp4') return 'mp4';
    return 'jpg';
  }
}

export const communityMediaService = new CommunityMediaService();

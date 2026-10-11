import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { validateMedia } from '../utils/image-validator.js';
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
 *   - Database mode: bytes go to the `community-media` object-storage bucket and
 *     the record starts as `pending_review`, so nothing an anonymous contributor
 *     uploads is shown publicly until a platform owner moderates it.
 */

const BUCKET = 'community-media';

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
   * Returns a public URL for a stored attachment, or null when it is not
   * available for public display (demo: unknown; database: not yet moderated).
   */
  async resolvePublicUrl(id: string): Promise<string | null> {
    if (this.demoActive) {
      const record = this.demoStore.get(id);
      return record && record.moderation_status === 'visible' ? publicUrl(id) : null;
    }

    const { data, error } = await supabase.storage.from(BUCKET).list('', { search: id });
    if (error) {
      logger.warn('Community media lookup failed', { error: error.message });
      return null;
    }
    const match = (data ?? []).find((entry) => entry.name.startsWith(`${id}.`));
    if (!match) return null;
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(match.name);
    return urlData?.publicUrl ?? null;
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

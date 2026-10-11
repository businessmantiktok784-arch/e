import { env } from '../config/env.js';

/**
 * Media validation for WhatsApp submissions.
 *
 * Images and video both reach this layer. A rock cut, a slope and a landslide
 * are often only understandable in motion, so rejecting video would exclude
 * exactly the observations the platform is meant to hold.
 *
 * The declared MIME type from Meta is never trusted on its own. Every buffer is
 * identified from its magic bytes, because a caller controls that header and a
 * mislabelled file must not reach the model as whatever it claimed to be.
 */

export type MediaKind = 'image' | 'video';

export interface MediaValidationResult {
  isValid: boolean;
  mediaKind: MediaKind | null;
  detectedMimeType: string | null;
  errorReason?: 'UNSUPPORTED_FORMAT' | 'OVERSIZED' | 'EMPTY_BODY' | 'CORRUPTED';
  userMessage?: string;
}

export const USER_MESSAGES = {
  UNSUPPORTED_FORMAT: `I received your file, but I can't read this format yet.

Please send a JPEG or PNG photo. Short videos (MP4) work too.`,
  CORRUPTED: `I received your file, but I couldn't read it.

Please send it again, or send a clear photo in good daylight.`,
  OVERSIZED: `That file is too large for analysis (maximum 10 MB).

Please send a smaller photo, or a short video clip.`,
  EMPTY: `I received an empty file.

Please take the photo or video again and resend it.`,
};

/** Image formats the pipeline can read. */
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Video containers the pipeline can read.
 *
 * WhatsApp delivers MP4 and 3GP. Both are ISO-BMFF based and share the `ftyp`
 * box, so they are detected by brand rather than by extension.
 */
const SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/3gpp']);

/**
 * Minimum plausible size for real media.
 *
 * A buffer far below this is a truncated transfer or a placeholder rather than a
 * photograph, and treating it as valid would produce a confident interpretation
 * of nothing.
 */
const MIN_PLAUSIBLE_BYTES = 100;

/**
 * Legacy export so existing Stage 2 callers and tests keep working.
 */
export interface ImageValidationResult {
  isValid: boolean;
  detectedMimeType: string | null;
  errorReason?: 'UNSUPPORTED_FORMAT' | 'OVERSIZED' | 'EMPTY_BODY' | 'CORRUPTED';
  userMessage?: string;
}

/**
 * Inspects buffer magic bytes to identify genuine media.
 *
 * Returns the MIME type and the kind, or null when the bytes are not media this
 * pipeline supports.
 */
export function detectMediaFromBuffer(buffer: Buffer): { mimeType: string; kind: MediaKind } | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', kind: 'image' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', kind: 'image' };
  }

  // WebP: RIFF .... WEBP
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { mimeType: 'image/webp', kind: 'image' };
  }

  // ISO-BMFF container: ....ftyp<brand>. Serves both HEIC stills and MP4/3GP
  // video, so the brand decides which pipeline accepts the buffer.
  const ftyp = buffer.toString('ascii', 4, 8);
  if (ftyp === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) {
      return { mimeType: 'image/heic', kind: 'image' };
    }
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'mmp4', 'mp4v'].includes(brand)) {
      return { mimeType: 'video/mp4', kind: 'video' };
    }
    // WhatsApp delivers 3GP for short clips. Brands are `3gp4`, `3gp5`, `3gp6`
    // and `3gs7`, so the family is matched by prefix rather than by an exact list.
    if (/^3gp/.test(brand) || brand === '3gpp' || brand === '3g2') {
      return { mimeType: 'video/3gpp', kind: 'video' };
    }
  }

  return null;
}

/** Wraps `detectMediaFromBuffer` for callers that only care about the type. */
function detectMimeTypeFromBuffer(buffer: Buffer): string | null {
  return detectMediaFromBuffer(buffer)?.mimeType ?? null;
}

/**
 * Validates a media buffer before it reaches the model.
 *
 * The magic bytes are authoritative and required. A declared type is never enough
 * on its own: the sender controls that header, so accepting an unrecognised buffer
 * because it claims to be a JPEG would let any arbitrary payload reach the model
 * and, from there, reach an observer as a description of their submission.
 */
export function validateMedia(buffer: Buffer, declaredMimeType?: string): MediaValidationResult {
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      mediaKind: null,
      detectedMimeType: null,
      errorReason: 'EMPTY_BODY',
      userMessage: USER_MESSAGES.EMPTY,
    };
  }

  if (buffer.length > env.MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      mediaKind: null,
      detectedMimeType: null,
      errorReason: 'OVERSIZED',
      userMessage: USER_MESSAGES.OVERSIZED,
    };
  }

  const detected = detectMediaFromBuffer(buffer);

  // The container is not media this pipeline can read, whatever it claimed to
  // be. Reported as unsupported rather than corrupted: the sender sent a real
  // file, just not one that can be interpreted.
  if (!detected) {
    return {
      isValid: false,
      mediaKind: classifyDeclaredMime(declaredMimeType),
      detectedMimeType: null,
      errorReason: 'UNSUPPORTED_FORMAT',
      userMessage: USER_MESSAGES.UNSUPPORTED_FORMAT,
    };
  }

  const { mimeType: mime, kind } = detected;

  const supported =
    kind === 'video' ? SUPPORTED_VIDEO_MIME_TYPES.has(mime) : SUPPORTED_IMAGE_MIME_TYPES.has(mime);

  if (!supported) {
    return {
      isValid: false,
      mediaKind: kind,
      detectedMimeType: mime,
      errorReason: 'UNSUPPORTED_FORMAT',
      userMessage: USER_MESSAGES.UNSUPPORTED_FORMAT,
    };
  }

  // A plausible photograph or clip is never this small. Below the floor the
  // transfer was truncated, and a confident interpretation of a truncated
  // buffer would be an interpretation of nothing.
  if (buffer.length < MIN_PLAUSIBLE_BYTES) {
    return {
      isValid: false,
      mediaKind: kind,
      detectedMimeType: mime,
      errorReason: 'CORRUPTED',
      userMessage: USER_MESSAGES.CORRUPTED,
    };
  }

  return {
    isValid: true,
    mediaKind: kind,
    detectedMimeType: mime,
  };
}

/** Maps a declared MIME type onto the pipeline that should handle it. */
function classifyDeclaredMime(declaredMimeType?: string): MediaKind | null {
  if (!declaredMimeType) return null;
  const lower = declaredMimeType.toLowerCase().trim();
  if (SUPPORTED_VIDEO_MIME_TYPES.has(lower)) return 'video';
  if (SUPPORTED_IMAGE_MIME_TYPES.has(lower)) return 'image';
  return null;
}

/**
 * Validates an image buffer and MIME type before sending to Gemini.
 *
 * Retained from Stage 2 for the existing callers and tests. An image-only
 * rejection here is intentional: `validateMedia` is the entry point for the full
 * pipeline, and this narrower wrapper guarantees a caller that asked for an image
 * cannot silently receive a video.
 */
export function validateImage(buffer: Buffer, declaredMimeType?: string): ImageValidationResult {
  const result = validateMedia(buffer, declaredMimeType);

  if (!result.isValid && result.mediaKind === 'video') {
    return {
      isValid: false,
      detectedMimeType: result.detectedMimeType,
      errorReason: 'UNSUPPORTED_FORMAT',
      userMessage: USER_MESSAGES.UNSUPPORTED_FORMAT,
    };
  }

  return {
    isValid: result.isValid,
    detectedMimeType: result.detectedMimeType,
    ...(result.errorReason ? { errorReason: result.errorReason } : {}),
    ...(result.userMessage ? { userMessage: result.userMessage } : {}),
  };
}

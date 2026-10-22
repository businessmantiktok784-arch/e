import { validateImage } from '../utils/image-validator.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  userAvatarRepository,
  type StoredAvatar,
} from '../repositories/user-avatar.repository.js';
import type { Viewer } from '../utils/user-auth.js';

/**
 * A contributor's own profile photo.
 *
 * Only a signed-in (WhatsApp-verified) account has a photo. The bytes are
 * validated by signature, capped in size, and never trusted from the declared
 * type. There is no default or seed image: an account without a photo has none,
 * and the interface draws its own mark.
 */

/** A profile photo is small on purpose: it is a mark, not a photo library. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export class UserAvatarError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'UserAvatarError';
  }
}

export interface SetAvatarInput {
  contentBase64?: string | null;
  mimeType?: string | null;
}

export async function setAvatar(
  viewer: Viewer,
  input: SetAvatarInput
): Promise<{ updatedAt: string }> {
  const encoded = String(input.contentBase64 ?? '').trim();
  if (!encoded) {
    throw new UserAvatarError(400, 'INVALID_AVATAR', 'Choose an image to upload.');
  }

  const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new UserAvatarError(400, 'INVALID_AVATAR', 'The image could not be read.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new UserAvatarError(400, 'INVALID_AVATAR', 'The image was empty.');
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new UserAvatarError(
      413,
      'AVATAR_TOO_LARGE',
      `A profile photo up to ${Math.floor(AVATAR_MAX_BYTES / 1024)} KB is allowed.`
    );
  }

  const validation = validateImage(buffer, input.mimeType ?? undefined);
  if (!validation.isValid || !validation.detectedMimeType) {
    throw new UserAvatarError(400, 'INVALID_AVATAR', 'Only JPEG, PNG or WebP images are allowed.');
  }

  const stored = await userAvatarRepository.setAvatar(viewer.userId, {
    mimeType: validation.detectedMimeType,
    base64,
    byteSize: buffer.length,
  });
  return { updatedAt: stored.updatedAt };
}

export async function removeAvatar(viewer: Viewer): Promise<void> {
  await userAvatarRepository.clearAvatar(viewer.userId);
}

/** Resolves the stored photo for a public identity, or null when there is none. */
export async function getAvatarByPublicUserId(
  publicUserId: string
): Promise<StoredAvatar | null> {
  const user = await userRepository.findUserByPublicUserId(publicUserId);
  if (!user) return null;
  return userAvatarRepository.findAvatarByUserId(user.id);
}

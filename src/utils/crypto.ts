import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Creates an irreversible, salted HMAC-SHA256 hash of a WhatsApp user identifier.
 * Ensures raw phone numbers are never stored in geological observation records.
 */
export function hashUserPhoneNumber(phoneNumber: string): string {
  const secret = env.USER_HASH_SECRET || env.SUPABASE_SECRET_KEY;
  return crypto.createHmac('sha256', secret).update(phoneNumber.trim()).digest('hex');
}

/**
 * Computes SHA-256 checksum of raw image data for integrity & research deduplication.
 */
export function computeMediaSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

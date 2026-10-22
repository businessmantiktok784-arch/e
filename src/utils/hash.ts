import crypto from 'node:crypto';

/**
 * A short, one-way digest used only to correlate a value without storing it.
 *
 * The truncation makes the hash an opaque correlation handle, never an identity
 * or a secret: two equal inputs match, but the digest cannot be reversed.
 */
export function shortHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
}

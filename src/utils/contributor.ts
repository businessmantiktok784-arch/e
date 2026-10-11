import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { hashUserPhoneNumber } from './crypto.js';

/**
 * Anonymous contributor identity.
 *
 * Earth Talk has no user accounts. A participant is identified only by a stable
 * one-way hash, which lets the platform prevent duplicate votes and count
 * contributions without ever storing or exposing:
 *   - a phone number
 *   - a WhatsApp ID / MSISDN
 *   - a name, email, or any contact detail
 *
 * Two entry paths, both producing the same kind of opaque hash:
 *   1. WhatsApp  -> HMAC over the sender's phone number (see `hashUserPhoneNumber`).
 *   2. Web / GIS -> HMAC over a long random token the browser keeps in
 *                   localStorage and sends as `X-Contributor-Token`.
 *
 * The web token is pseudonymous, not anonymous: it is a bearer secret held by
 * the browser. It carries no personal data, and losing it simply means losing
 * recognition of past contributions rather than exposing anything.
 */

/** Header carrying the browser-held contributor token. */
export const CONTRIBUTOR_HEADER = 'x-contributor-token';

/** Minimum length for a browser-supplied contributor token. Short values are
 *  rejected so contributors cannot trivially collide or be enumerated. */
const MIN_CONTRIBUTOR_TOKEN_LENGTH = 16;
const MAX_CONTRIBUTOR_TOKEN_LENGTH = 256;

/**
 * Produces the stable opaque contributor key.
 *
 * Keyed with ANONYMOUS_CONTRIBUTOR_SECRET so the digest cannot be reversed by
 * building a lookup table of candidate phone numbers.
 */
export function hashContributor(rawIdentifier: string): string {
  return crypto
    .createHmac('sha256', env.ANONYMOUS_CONTRIBUTOR_SECRET)
    .update(rawIdentifier.trim())
    .digest('hex');
}

/**
 * Resolves the contributor key for a WhatsApp participant.
 *
 * This deliberately returns exactly the same value as `hashUserPhoneNumber`,
 * which is the identity already stored against every observation created
 * through Stages 1-2. A person who photographed a rock and later votes on a
 * community investigation must be recognised as the same contributor,
 * otherwise their reputation would restart from zero and duplicate-vote
 * protection would not span both entry paths.
 *
 * Both values are one-way HMACs, so no phone number is ever stored or exposed
 * by either function.
 */
export function whatsappContributorHash(phoneNumber: string): string {
  return hashUserPhoneNumber(phoneNumber);
}

/**
 * Validates a browser-supplied contributor token.
 * Returns null when absent or malformed so callers can decide the policy.
 */
export function normalizeContributorToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (token.length < MIN_CONTRIBUTOR_TOKEN_LENGTH) return null;
  if (token.length > MAX_CONTRIBUTOR_TOKEN_LENGTH) return null;
  // Constrain to URL-safe characters so the value is stable across transports.
  if (!/^[A-Za-z0-9._~-]+$/.test(token)) return null;
  return token;
}

/**
 * Resolves the contributor key for an incoming public request.
 *
 * Order of preference:
 *   1. `X-Contributor-Token` header (browser session)
 *   2. `contributor_token` body field (form posts without custom headers)
 *
 * Returns null when no usable token was supplied. Endpoints that accept
 * anonymous contributions may still proceed by issuing an ephemeral key, which
 * means the contribution is recorded but not recognised as coming from a
 * previously-seen contributor.
 */
export function resolveContributorHashFromRequest(req: Request): string | null {
  const fromHeader = normalizeContributorToken(req.headers[CONTRIBUTOR_HEADER]);
  if (fromHeader) return hashContributor(`web:${fromHeader}`);

  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = normalizeContributorToken(body?.contributor_token);
  if (fromBody) return hashContributor(`web:${fromBody}`);

  return null;
}

/**
 * Creates a fresh contributor token for a browser with no existing one.
 * Returned to the client once and then stored locally by the client.
 */
export function createContributorToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * The public display handle, e.g. "Field Explorer #A82F".
 *
 * Derived from the contributor hash so it is stable and collision-resistant
 * across the platform, while revealing nothing about the underlying identity.
 */
export function publicContributorHandle(contributorHash: string): string {
  if (!contributorHash) return 'Anonymous Contributor';
  const suffix = crypto.createHash('sha256').update(contributorHash).digest('hex').substring(0, 4).toUpperCase();
  return `Field Explorer #${suffix}`;
}

/**
 * Partially redacted contributor key for audit records.
 * Enough to correlate an action, not enough to reconstruct the input.
 */
export function redactContributorHash(contributorHash: string): string {
  if (!contributorHash) return 'none';
  return `${contributorHash.substring(0, 8)}…`;
}

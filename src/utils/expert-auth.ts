import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import {
  verifyAdminToken,
  requireSuperAdmin,
  type AdminSessionPayload,
  type AuthenticatedAdminRequest,
} from './admin-auth.js';

/**
 * Review-surface authentication.
 *
 * This module used to hold a hard-coded list of "authorised experts" and issue
 * them signed sessions. Every entry in that list named a real person at a real
 * institution (the Rwanda Mines, Petroleum and Gas Board, the University of
 * Rwanda) together with a photo scraped from an unrelated stock site. Nothing
 * verified that those people had agreed to be listed, to have their judgement
 * published, or to hold the credentials implied. That list has been removed and
 * cannot be reintroduced: Earth Talk has exactly one kind of account.
 *
 * The current model:
 *   - The only account on this platform belongs to the Super Admin.
 *   - Experts do not log in. A named reviewer is recorded on a review by the
 *     Super Admin, together with an explicit decision about whether that name
 *     may be published.
 *
 * Authentication therefore delegates entirely to `admin-auth.ts`. The aliases
 * below exist only so existing call sites keep compiling while they are migrated
 * to `requireSuperAdmin`; they grant exactly the authority of the Super Admin
 * session and nothing more.
 */

/** Deprecated alias for {@link AdminSessionPayload}. */
export type ExpertSessionPayload = AdminSessionPayload;

/** Deprecated alias for {@link AuthenticatedAdminRequest}. */
export type AuthenticatedExpertRequest = AuthenticatedAdminRequest;

/**
 * There are no expert accounts. This export is intentionally empty and exists
 * only so that code importing it compiles to an empty list rather than silently
 * authenticating a fabricated identity.
 *
 * @deprecated Import nothing. Reviewers are attributes of a review, not users.
 */
export const AUTHORIZED_EXPERTS: never[] = [];

/** @deprecated Use `verifyAdminToken` from `admin-auth.ts`. */
export { verifyAdminToken as verifyExpertToken };

/** @deprecated Use `revokeAdminSession` from `admin-auth.ts`. */
export { revokeAdminSession as revokeExpertSession } from './admin-auth.js';

/**
 * Issues a session token for the Super Admin.
 *
 * Retained under its historical name so call sites migrate incrementally. It
 * performs no expert lookup: there is no expert to look up.
 *
 * @deprecated Use `generateAdminToken` from `admin-auth.ts`.
 */
export async function generateExpertToken(context?: {
  ip?: string;
  userAgent?: string;
}): Promise<string> {
  const { generateAdminToken } = await import('./admin-auth.js');
  return generateAdminToken({
    ip: context?.ip,
    userAgent: context?.userAgent,
  });
}

/**
 * Ephemeral signed token for review media access.
 *
 * Scoped to the Super Admin session secret and a short TTL so a captured URL
 * cannot be reused as a permanent asset link.
 */
export function generateSignedMediaToken(mediaId: string, ttlSeconds = 300): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${mediaId}:${expiresAt}`)
    .digest('hex')
    .substring(0, 32);
  return `${expiresAt}.${sig}`;
}

/**
 * Validates an ephemeral signed media token using a timing-safe comparison.
 */
export function verifySignedMediaToken(mediaId: string, token: string): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  const expiresAt = parseInt(expStr, 10);
  if (Number.isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${mediaId}:${expiresAt}`)
    .digest('hex')
    .substring(0, 32);
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

/**
 * @deprecated Contributor redaction now lives in `contributor.ts`, which is
 * shared by the WhatsApp and web paths so both produce identical output.
 */
export { redactContributorHash as anonymizeContributor } from './contributor.js';

/**
 * Express middleware enforcing Super Admin authentication.
 *
 * @deprecated Use `requireSuperAdmin` from `admin-auth.ts`.
 */
export async function requireExpertAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireSuperAdmin(req, res, next);
}

/**
 * @deprecated Identical to {@link requireExpertAuth}. There is no separate
 * administrator tier: the Super Admin is the only authenticated role.
 */
export async function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireSuperAdmin(req, res, next);
}

/** @deprecated Use `checkRateLimit` from `rate-limiter.ts`. */
export { checkRateLimit } from './rate-limiter.js';
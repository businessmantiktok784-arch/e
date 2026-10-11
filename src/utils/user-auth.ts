import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { hashUserPhoneNumber } from './crypto.js';
import { hashToken } from './admin-auth.js';
import { userRepository } from '../repositories/user.repository.js';
import type { UserRow } from '../types/community-posts.types.js';

/**
 * Earth Talk account sessions.
 *
 * Stage 12 adds exactly one authenticated role besides the Super Admin: the
 * contributor who verified a WhatsApp number through a short-lived code and
 * received an opaque session token. The token is stored only as a SHA-256
 * hash, the code only as a scrypt hash of the code plus a per-record salt, and
 * a phone number only as the same one-way HMAC that identifies a WhatsApp
 * sender. Consequently no store, log or response in this file can reveal a
 * phone number or a usable secret.
 *
 * Design constraints taken from the existing codebase:
 *   * opaque bearer tokens, `hashToken()` from `admin-auth.ts`, revocable
 *     server-side (never a self-contained JWT, so logout is immediate);
 *   * an in-memory fallback only when Supabase is not configured, and never in
 *     production (see `UserRepository.requireDatabase`);
 *   * a request carries at most one resolved viewer, always loaded from the
 *     session, never accepted from a request body.
 */

export interface Viewer {
  userId: string;
  publicUserId: string;
  displayName: string | null;
  isDemo: boolean;
}

export interface AuthenticatedUserRequest extends Request {
  viewer?: Viewer;
  rawUserToken?: string;
}

/** Prefix makes a leaked token recognisable and prevents cross-service use. */
const SESSION_TOKEN_PREFIX = 'rt_session_';

function shortHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
}

/**
 * Normalises a phone number to the digits form used by WhatsApp senders
 * (`message.from`), so a website login and a WhatsApp message resolve to the
 * same account.
 *
 * Returns null when the input is not a plausible international number. A
 * national format starting with 0 is rejected on purpose: guessing a country
 * code would silently bind an account to a different person.
 */
export function normalizePhoneNumber(input: string): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0')) return null;
  if (/^0{4,}/.test(digits)) return null;
  return digits;
}

/** One-way phone hash shared with the WhatsApp `source_user_hash` convention. */
export function phoneHashFromInput(input: string): string | null {
  const digits = normalizePhoneNumber(input);
  if (!digits) return null;
  return hashUserPhoneNumber(digits);
}

/** Constant-time comparison for two equally long ASCII strings. */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Verification codes
// ---------------------------------------------------------------------------

export function generateVerificationCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

/**
 * Hashes a verification code with scrypt, salted by the session secret and the
 * phone hash, so a stolen code row cannot be brute-forced offline against a
 * different number and cannot be replayed against another account.
 */
export function hashCodeForPhone(code: string, phoneHash: string): string {
  const salt = `${env.AUTH_SESSION_SECRET}:${phoneHash}`;
  return crypto.scryptSync(String(code), salt, 64).toString('hex');
}

export function verifyCodeForPhone(code: string, phoneHash: string, codeHash: string): boolean {
  if (!code || !codeHash) return false;
  const candidate = hashCodeForPhone(code, phoneHash);
  return timingSafeEqualString(candidate, codeHash);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface IssueSessionResult {
  token: string;
  expiresAt: string;
}

/**
 * Issues an opaque bearer token. Only its hash is persisted, so a database
 * dump cannot be replayed as a live session.
 */
export async function issueUserSession(
  user: UserRow,
  context?: { ip?: string; userAgent?: string }
): Promise<IssueSessionResult> {
  const token = `${SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_SECONDS * 1000).toISOString();

  await userRepository.createSession({
    id: crypto.randomUUID(),
    user_id: user.id,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    ip_hash: context?.ip ? shortHash(context.ip) : null,
    user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return { token, expiresAt };
}

/**
 * Resolves a bearer token to its account, or null when the token is unknown,
 * revoked or expired. Expiry is checked against the stored row rather than
 * trusting any client-held claim.
 */
export async function resolveUserFromToken(
  token: string | undefined | null
): Promise<{ user: UserRow; tokenHash: string } | null> {
  if (!token || typeof token !== 'string' || !token.startsWith(SESSION_TOKEN_PREFIX)) {
    return null;
  }

  const tokenHash = hashToken(token);
  const session = await userRepository.findSessionByTokenHash(tokenHash);
  if (!session) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  if (!session.user_id) return null;

  const user = await userRepository.findUserById(session.user_id);
  if (!user) return null;

  void userRepository.touchSession(tokenHash);
  return { user, tokenHash };
}

export async function revokeUserSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  return userRepository.revokeSession(hashToken(token));
}

export function viewerFromUser(user: UserRow): Viewer {
  return {
    userId: user.id,
    publicUserId: user.public_user_id,
    displayName: user.display_name,
    isDemo: user.is_demo,
  };
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.substring(7).trim();
  return undefined;
}

/** Attaches the viewer when a valid session is present; never rejects. */
export async function attachViewer(
  req: AuthenticatedUserRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearer(req);
    if (token) {
      const resolved = await resolveUserFromToken(token);
      if (resolved) {
        req.viewer = viewerFromUser(resolved.user);
        req.rawUserToken = token;
      }
    }
  } catch (err) {
    // An unreadable session must not break a public request; the caller is
    // simply treated as anonymous.
    void err;
  }
  next();
}

/** Express middleware: requires a valid contributor session. */
export async function requireUser(
  req: AuthenticatedUserRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({
      error: 'Sign in with your WhatsApp number to continue.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const resolved = await resolveUserFromToken(token);
  if (!resolved) {
    res.status(401).json({
      error: 'Your session has expired. Request a new code to sign in again.',
      code: 'AUTH_SESSION_INVALID',
    });
    return;
  }

  req.viewer = viewerFromUser(resolved.user);
  req.rawUserToken = token;
  next();
}

/** Hash of the caller's address, used only as a rate-limit key. */
export function hashRequestIp(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return shortHash(String(ip));
}

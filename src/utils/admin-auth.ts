import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env, verifyPassword } from '../config/env.js';
import { describeDatabaseConfig } from '../config/database-config.js';
import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';
import { shortHash } from './hash.js';
import { ServiceUnavailableError } from './service-error.js';

/**
 * Super Admin authentication.
 *
 * This is the ONLY authenticated role in Earth Talk.
 *
 * Ordinary participants need no account: they contribute through WhatsApp or the
 * public website and are identified solely by a one-way contributor hash.
 * Geological reviewers do not need accounts either: a review is a record entered
 * by the Super Admin on a reviewer's behalf (see `expert_verifications`).
 *
 * There is therefore no user directory, no registration, and no expert roster.
 */

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  sessionId: string;
  exp: number; // Unix seconds
}

export interface AuthenticatedAdminRequest extends Request {
  admin?: AdminSessionPayload;
  rawToken?: string;
  requestId?: string;
}

interface AdminSessionRecord {
  id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
}

/**
 * In-memory fallback registry.
 *
 * Used only when Supabase is not reachable. This is a real store, not fixture
 * data, but it is per-process: sessions do not survive a restart and are not
 * shared between replicas. When Supabase is available the durable table
 * `admin_sessions` is authoritative and this map is not consulted.
 */
const memorySessions = new Map<string, AdminSessionRecord>();

/** True when Supabase is configured with real, privileged server credentials. */
export function isDatabaseConfigured(): boolean {
  return describeDatabaseConfig().configured;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Credentials check for the single Super Admin identity.
 *
 * Production requires a scrypt `SUPER_ADMIN_PASSWORD_HASH`. Development may use
 * a plaintext `SUPER_ADMIN_PASSWORD` for convenience; it is stripped from the
 * config entirely when NODE_ENV=production.
 *
 * `passcode` is deliberately not accepted: the previous expert login treated an
 * omitted passcode as valid, which meant knowing an email address was enough.
 */
export function authenticateSuperAdmin(email: string, password: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail !== env.SUPER_ADMIN_EMAIL) return false;
  if (!password || password.length === 0) return false;

  if (env.SUPER_ADMIN_PASSWORD_HASH) {
    return verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
  }

  if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
    const a = Buffer.from(password);
    const b = Buffer.from(env.SUPER_ADMIN_PASSWORD);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  return false;
}

/** True when the deployment has any usable Super Admin credential configured. */
export function isSuperAdminConfigured(): boolean {
  if (!env.SUPER_ADMIN_EMAIL) return false;
  return Boolean(env.SUPER_ADMIN_PASSWORD_HASH || (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD));
}

function sign(headerB64: string, payloadB64: string): string {
  return crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
}

/**
 * Issues a signed session token and registers it for revocation.
 */
export async function generateAdminToken(
  context?: { ip?: string; userAgent?: string },
  ttlSeconds: number = env.SUPER_ADMIN_SESSION_TTL_SECONDS
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

  const payload: AdminSessionPayload = {
    adminId: 'super_admin',
    email: env.SUPER_ADMIN_EMAIL,
    sessionId,
    exp,
  };

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${headerB64}.${payloadB64}.${sign(headerB64, payloadB64)}`;

  const record: AdminSessionRecord = {
    id: sessionId,
    token_hash: hashToken(token),
    created_at: new Date().toISOString(),
    expires_at: new Date(exp * 1000).toISOString(),
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    ip_hash: context?.ip ? shortHash(context.ip) : null,
    user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
  };

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('admin_sessions') as any).insert({
        id: sessionId,
        token_hash: record.token_hash,
        expires_at: record.expires_at,
        ip_hash: record.ip_hash,
        user_agent_hash: record.user_agent_hash,
      });
      if (error) throw new Error(error.message);
      return token;
    } catch (err) {
      // A configured database is authoritative. Issuing a token that only this
      // process knows about would let an unrelated instance, or this instance
      // after a restart, reject a session the user believes is live.
      logger.error('Could not persist admin session; refusing to issue an unbacked session', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session creation', err);
    }
  }

  memorySessions.set(record.token_hash, record);
  return token;
}

async function loadSession(tokenHash: string): Promise<AdminSessionRecord | null> {
  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('admin_sessions') as any)
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data as AdminSessionRecord;
      return null;
    } catch (err) {
      logger.error('Could not read admin session; refusing to fall back to process memory', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session lookup', err);
    }
  }
  return memorySessions.get(tokenHash) ?? null;
}

/**
 * Revokes a session immediately.
 *
 * An unknown token is still recorded as revoked so a replayed token can never be
 * re-accepted on a later request.
 */
export async function revokeAdminSession(token: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const revokedAt = new Date().toISOString();

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('admin_sessions') as any)
        .update({ revoked_at: revokedAt })
        .eq('token_hash', tokenHash);
      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      // Reporting success here would tell the operator the session is dead when
      // the database never recorded the revocation.
      logger.error('Could not revoke admin session; refusing to report success', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session revocation', err);
    }
  }

  const existing = memorySessions.get(tokenHash);
  if (existing) {
    existing.revoked_at = revokedAt;
  } else {
    memorySessions.set(tokenHash, {
      id: crypto.randomUUID(),
      token_hash: tokenHash,
      created_at: revokedAt,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: revokedAt,
      last_used_at: revokedAt,
      ip_hash: null,
      user_agent_hash: null,
    });
  }
  return true;
}

export async function isSessionRevoked(token: string): Promise<boolean> {
  if (!token) return true;
  const session = await loadSession(hashToken(token));
  return Boolean(session && session.revoked_at !== null);
}

/**
 * Verifies signature, expiry and revocation status.
 *
 * Revocation is checked before the signature so a revoked token fails fast and
 * identically regardless of how it was tampered with.
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const session = await loadSession(hashToken(token));
  if (session && session.revoked_at) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const expected = sign(headerB64, payloadB64);

  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (session) session.last_used_at = new Date().toISOString();
    return payload;
  } catch {
    return null;
  }
}

/**
 * Express middleware: requires a valid Super Admin session.
 */
export async function requireSuperAdmin(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required.', code: 'ADMIN_AUTH_REQUIRED' });
    return;
  }

  let payload: AdminSessionPayload | null;
  try {
    payload = await verifyAdminToken(token);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).json({
        error: 'Authentication is temporarily unavailable. Please try again shortly.',
        code: 'DATABASE_UNAVAILABLE',
      });
      return;
    }
    throw err;
  }

  if (!payload) {
    res.status(401).json({
      error: 'Invalid, expired, or revoked session. Please sign in again.',
      code: 'ADMIN_SESSION_INVALID',
    });
    return;
  }

  req.admin = payload;
  req.rawToken = token;
  next();
}

/**
 * Revokes every active session. Used by the emergency secret-rotation runbook.
 */
export async function revokeAllAdminSessions(): Promise<number> {
  const revokedAt = new Date().toISOString();
  let count = 0;

  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('admin_sessions') as any)
        .update({ revoked_at: revokedAt })
        .is('revoked_at', null);
      if (error) throw new Error(error.message);
      count = Array.isArray(data) ? data.length : 0;
      return count;
    } catch (err) {
      logger.error('Failed to revoke admin sessions in database; refusing to report success', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session bulk revocation', err);
    }
  }

  for (const session of memorySessions.values()) {
    if (!session.revoked_at) {
      session.revoked_at = revokedAt;
      count += 1;
    }
  }
  return count;
}

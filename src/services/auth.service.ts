import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
import { whatsappService } from './whatsapp.service.js';
import { userRepository, type CreateVia } from '../repositories/user.repository.js';
import type { UserRow, VerificationCodeRecord } from '../types/community-posts.types.js';
import type { PublicUserIdentity } from '../types/community-posts.types.js';
import {
  generateVerificationCode,
  hashCodeForPhone,
  hashRequestIp,
  issueUserSession,
  normalizePhoneNumber,
  phoneHashFromInput,
  revokeUserSession,
  verifyCodeForPhone,
  type Viewer,
} from '../utils/user-auth.js';
import type { Request } from 'express';

/**
 * WhatsApp verification login.
 *
 * The flow is deliberately boring:
 *   1. `requestCode` hashes the number, invalidates any live code, stores a
 *      scrypt hash of a six digit code with an expiry and an attempt limit, and
 *      asks WhatsApp to deliver it.
 *   2. `verifyCode` loads the most recent record, checks expiry, consumption
 *      and attempts before comparing hashes, then consumes the record and
 *      finds-or-creates the account.
 *
 * What never happens: the code is never returned in an HTTP response, never
 * logged outside development, and a second request never leaves an older code
 * usable. A phone number is never written anywhere except as the one-way hash
 * already used to identify a WhatsApp sender.
 */

export type AuthErrorCode =
  | 'INVALID_PHONE'
  | 'RATE_LIMITED'
  | 'DELIVERY_FAILED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'CODE_ALREADY_USED'
  | 'TOO_MANY_ATTEMPTS'
  | 'PROFILE_UPDATE_FAILED'
  | 'DISPLAY_NAME_LOCKED';

/**
 * How long a verified account must wait between public-name changes. The
 * browser store applies the same window to local accounts; this is the server
 * half, so a scripted caller cannot sidestep it.
 */
export const DISPLAY_NAME_EDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The signed-in identity as the auth endpoints publish it: the public face plus
 * the one field the client needs to grey out the rename control, which is not
 * part of the identity other readers see.
 */
export interface SessionUserIdentity extends PublicUserIdentity {
  display_name_updated_at: string | null;
}

export interface AuthFailure {
  ok: false;
  status: number;
  code: AuthErrorCode;
  error: string;
}

export interface RequestCodeSuccess {
  ok: true;
  /**
   * `whatsapp` when Meta accepted the message, `development_console` when the
   * code was written to the server console because no WhatsApp credentials are
   * configured. The client is told which happened so it never invents a step.
   */
  delivery: 'whatsapp' | 'development_console';
  message: string;
  /** How long the delivered code stays valid, in seconds. */
  expiresInSeconds: number;
}

export interface VerifyCodeSuccess {
  ok: true;
  token: string;
  expiresAt: string;
  user: SessionUserIdentity;
}

export type RequestCodeResult = RequestCodeSuccess | AuthFailure;
export type VerifyCodeResult = VerifyCodeSuccess | AuthFailure;

function failure(
  status: number,
  code: AuthErrorCode,
  error: string
): AuthFailure {
  return { ok: false, status, code, error };
}

function identityOf(user: UserRow): PublicUserIdentity {
  return {
    public_user_id: user.public_user_id,
    display_name: user.display_name,
    is_demo: user.is_demo,
  };
}

function sessionUserOf(user: UserRow): SessionUserIdentity {
  return {
    ...identityOf(user),
    display_name_updated_at: user.display_name_updated_at ?? null,
  };
}

function codeMessage(delivery: 'whatsapp' | 'development_console', ttlSeconds: number): string {
  if (delivery === 'development_console') {
    return 'Earth Talk is running without WhatsApp credentials. The code was written to the server console.';
  }
  return `A six digit code was sent to your WhatsApp number. It expires in ${ttlSeconds} seconds.`;
}

/**
 * Creates and delivers a verification code.
 *
 * Rate limits are enforced twice: once per phone hash so one number cannot be
 * spammed, and once per address so one address cannot spray many numbers.
 */
export async function requestCode(
  phoneInput: string,
  req: Request
): Promise<RequestCodeResult> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) {
    return failure(
      400,
      'INVALID_PHONE',
      'Enter your full WhatsApp number with country code, for example +250 78 123 45 67.'
    );
  }

  const ipHash = hashRequestIp(req);
  if (
    !checkRateLimit(`auth_request:${phoneHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE) ||
    !checkRateLimit(`auth_ip:${ipHash}`, env.AUTH_IP_RATE_LIMIT_PER_MINUTE)
  ) {
    return failure(
      429,
      'RATE_LIMITED',
      'Too many sign-in attempts. Wait a minute before requesting another code.'
    );
  }

  const digits = normalizePhoneNumber(phoneInput) ?? '';
  const code = generateVerificationCode();
  const now = Date.now();

  // A new request invalidates every earlier code, so an intercepted older
  // message can never be replayed after the user asks for a fresh one.
  await userRepository.consumeOutstandingCodes(phoneHash);

  const record: VerificationCodeRecord = {
    id: crypto.randomUUID(),
    phone_hash: phoneHash,
    code_hash: hashCodeForPhone(code, phoneHash),
    purpose: 'whatsapp_login',
    expires_at: new Date(now + env.AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
    max_attempts: env.AUTH_CODE_MAX_ATTEMPTS,
    consumed_at: null,
    requested_ip_hash: ipHash,
    delivery: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

  const message =
    `Your Earth Talk sign-in code is ${code}. ` +
    `It expires in ${env.AUTH_CODE_TTL_SECONDS} seconds. ` +
    'Never share this code. Earth Talk staff will never ask for it.';

  const response = await whatsappService.sendTextMessage(digits, message);

  if (response) {
    record.delivery = 'whatsapp';
    await userRepository.saveVerificationCode(record);
    logger.info('Verification code delivered over WhatsApp', { phone_hash: phoneHash });
    return { ok: true, delivery: 'whatsapp', message: codeMessage('whatsapp', env.AUTH_CODE_TTL_SECONDS), expiresInSeconds: env.AUTH_CODE_TTL_SECONDS };
  }

  if (!env.IS_PRODUCTION) {
    // Development only. The code is echoed to the server console so the login
    // flow can be exercised without WhatsApp credentials; it is never placed
    // in an HTTP response, and production takes the branch below instead.
    record.delivery = 'development_console';
    await userRepository.saveVerificationCode(record);
    logger.info(
      `[development] WhatsApp sign-in code for this process: ${code} (phone hash ${phoneHash})`,
      { phone_hash: phoneHash }
    );
    return {
      ok: true,
      delivery: 'development_console',
      message: codeMessage('development_console', env.AUTH_CODE_TTL_SECONDS),
      expiresInSeconds: env.AUTH_CODE_TTL_SECONDS,
    };
  }

  // Production with unreachable WhatsApp: record the failure, invalidate the
  // code so nothing can be verified that was never delivered, and tell the
  // user the truth instead of pretending a message was sent.
  record.delivery = 'failed';
  record.consumed_at = new Date().toISOString();
  await userRepository.saveVerificationCode(record);
  logger.error('Verification code could not be delivered over WhatsApp', { phone_hash: phoneHash });
  return failure(
    503,
    'DELIVERY_FAILED',
    'The sign-in code could not be sent right now. Please try again in a few minutes.'
  );
}

/** Checks a submitted code and, when it matches, opens a session. */
export async function verifyCode(
  phoneInput: string,
  submittedCode: string,
  req: Request
): Promise<VerifyCodeResult> {
  const phoneHash = phoneHashFromInput(phoneInput ?? '');
  if (!phoneHash) {
    return failure(400, 'INVALID_PHONE', 'That phone number is not valid.');
  }

  const code = String(submittedCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return failure(400, 'INVALID_CODE', 'Enter the six digit code from your WhatsApp message.');
  }

  const ipHash = hashRequestIp(req);
  if (!checkRateLimit(`auth_verify:${phoneHash}`, env.AUTH_REQUEST_RATE_LIMIT_PER_MINUTE)) {
    return failure(
      429,
      'RATE_LIMITED',
      'Too many attempts. Wait a minute before trying the code again.'
    );
  }

  const record = await userRepository.findLatestVerificationCode(phoneHash);
  if (!record) {
    return failure(400, 'INVALID_CODE', 'No active code for this number. Request a new one.');
  }

  if (record.consumed_at) {
    return failure(400, 'CODE_ALREADY_USED', 'This code has already been used. Request a new one.');
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(400, 'CODE_EXPIRED', 'This code has expired. Request a new one.');
  }

  if (record.attempts >= record.max_attempts) {
    await userRepository.updateVerificationCode(phoneHash, record.id, {
      consumed_at: new Date().toISOString(),
    });
    return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }

  if (!verifyCodeForPhone(code, phoneHash, record.code_hash)) {
    const attempts = record.attempts + 1;
    await userRepository.updateVerificationCode(phoneHash, record.id, { attempts });
    if (attempts >= record.max_attempts) {
      await userRepository.updateVerificationCode(phoneHash, record.id, {
        consumed_at: new Date().toISOString(),
      });
      return failure(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    }
    const remaining = record.max_attempts - attempts;
    return failure(
      400,
      'INVALID_CODE',
      `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  // Consume before issuing the session so the code is single use even if the
  // session write below fails.
  await userRepository.updateVerificationCode(phoneHash, record.id, {
    consumed_at: new Date().toISOString(),
  });

  let user: UserRow;
  try {
    user = await userRepository.findOrCreateByPhoneHash(phoneHash, 'web');
    await userRepository.linkWhatsAppIdentity(user.id, phoneHash);
  } catch (err) {
    logger.error('Could not open an account after a valid code', { error: String(err) });
    return failure(
      503,
      'DELIVERY_FAILED',
      'Your code was correct, but the account could not be opened right now. Please try again.'
    );
  }

  const session = await issueUserSession(user, {
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] ?? ''),
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: sessionUserOf(user),
  };
}

/** Signs the caller out by revoking the presented token. */
export async function signOut(token: string | undefined): Promise<{ ok: true }> {
  await revokeUserSession(token);
  return { ok: true };
}

/**
 * Updates the caller's public name. The account id never changes.
 *
 * A name may be changed once every seven days. The window is enforced here, on
 * the server, because a client-side clock is a suggestion, not a rule. Saving
 * the same name (including clearing an already-clear name) is a no-op and does
 * not consume the window.
 */
export async function updateProfile(
  viewer: Viewer,
  displayName: string | null
): Promise<{ ok: true; user: SessionUserIdentity } | AuthFailure> {
  const current = await userRepository.findUserById(viewer.userId);
  if (!current) {
    return failure(
      503,
      'PROFILE_UPDATE_FAILED',
      'Your profile could not be updated right now. Please try again.'
    );
  }

  const clean = displayName === null ? null : displayName.trim().slice(0, 60) || null;

  if (clean === (current.display_name ?? null)) {
    return { ok: true, user: sessionUserOf(current) };
  }

  const changedAt = current.display_name_updated_at ? Date.parse(current.display_name_updated_at) : 0;
  const availableAt = changedAt > 0 ? changedAt + DISPLAY_NAME_EDIT_INTERVAL_MS : 0;
  if (availableAt > Date.now()) {
    const daysRemaining = Math.max(1, Math.ceil((availableAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return failure(
      429,
      'DISPLAY_NAME_LOCKED',
      `A display name can be changed once every 7 days. Your name can change again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
    );
  }

  const updated = await userRepository.updateDisplayName(viewer.userId, clean);
  if (!updated) {
    return failure(
      503,
      'PROFILE_UPDATE_FAILED',
      'Your profile could not be updated right now. Please try again.'
    );
  }
  return { ok: true, user: sessionUserOf(updated) };
}

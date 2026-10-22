import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { requestCode, signOut, updateProfile, verifyCode } from '../services/auth.service.js';
import {
  UserAvatarError,
  removeAvatar as removeAvatarService,
  setAvatar as setAvatarService,
} from '../services/user-avatar.service.js';
import { resolveUserFromToken } from '../utils/user-auth.js';
import type { AuthenticatedUserRequest } from '../utils/user-auth.js';
import { bodyOf, fail } from '../utils/http.js';
import { isServiceUnavailableError } from '../utils/service-error.js';

/**
 * WhatsApp verification login (Stage 12).
 *
 * Handlers translate service failures into HTTP responses and never echo a
 * submitted code, a phone number or a session token back to the client.
 */

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.substring(7).trim();
  return undefined;
}

/**
 * Answers a database-outage failure as a 503 rather than a generic 500, so a
 * caller can tell "the store is down, try again" from "the request was bad".
 */
function answerUnavailable(res: Response, err: unknown): boolean {
  if (isServiceUnavailableError(err)) {
    fail(
      res,
      503,
      'DATABASE_UNAVAILABLE',
      'The service is temporarily unavailable because the database could not be reached. Please try again shortly.'
    );
    return true;
  }
  return false;
}

/**
 * POST /api/auth/request-code
 * Body: { phone: string }
 */
export async function requestCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const phone = typeof bodyOf(req).phone === 'string' ? (bodyOf(req).phone as string) : '';
    const result = await requestCode(phone, req);

    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json({
      delivery: result.delivery,
      message: result.message,
      expires_in_seconds: result.expiresInSeconds,
    });
  } catch (err) {
    logger.error('Verification code request failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The sign-in request could not be processed.' },
    });
  }
}

/**
 * POST /api/auth/verify-code
 * Body: { phone: string, code: string }
 */
export async function verifyCodeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = bodyOf(req);
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const result = await verifyCode(phone, code, req);

    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json({
      token: result.token,
      expires_at: result.expiresAt,
      user: result.user,
    });
  } catch (err) {
    logger.error('Verification failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The code could not be verified.' },
    });
  }
}

/**
 * GET /api/auth/session
 *
 * Always answers 200 so the client can decide whether to show a sign-in form,
 * but only reports an identity it resolved from a stored session.
 */
export async function sessionHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = bearerToken(req);
    const resolved = token ? await resolveUserFromToken(token) : null;
    res.status(200).json({
      authenticated: Boolean(resolved),
      user: resolved
        ? {
            public_user_id: resolved.user.public_user_id,
            display_name: resolved.user.display_name,
            is_demo: resolved.user.is_demo,
            display_name_updated_at: resolved.user.display_name_updated_at ?? null,
          }
        : null,
    });
  } catch (err) {
    logger.error('Session lookup failed', { error: String(err) });
    res.status(200).json({ authenticated: false, user: null });
  }
}

/**
 * POST /api/auth/sign-out
 */
export async function signOutHandler(req: Request, res: Response): Promise<void> {
  try {
    await signOut(bearerToken(req));
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Sign-out failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Sign-out failed.' },
    });
  }
}

/**
 * PATCH /api/auth/profile
 * Body: { display_name: string | null }
 */
export async function updateProfileHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your profile.' },
      });
      return;
    }

    const raw = bodyOf(req).display_name;
    const displayName = raw === null ? null : typeof raw === 'string' ? raw : undefined;

    if (displayName === undefined) {
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'A display name or null is required.' },
      });
      return;
    }

    const result = await updateProfile(req.viewer, displayName);
    if (!result.ok) {
      res.status(result.status).json({
        error: { code: result.code, message: result.error },
      });
      return;
    }

    res.status(200).json({ user: result.user });
  } catch (err) {
    logger.error('Profile update failed', { error: String(err) });
    if (answerUnavailable(res, err)) return;
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile could not be updated.' },
    });
  }
}

/**
 * POST /api/auth/avatar
 * Body: { content_base64: string, mime_type?: string }
 */
export async function setAvatarHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your photo.' },
      });
      return;
    }

    const body = bodyOf(req);
    const result = await setAvatarService(req.viewer, {
      contentBase64: typeof body.content_base64 === 'string' ? body.content_base64 : '',
      mimeType: typeof body.mime_type === 'string' ? body.mime_type : null,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof UserAvatarError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    logger.error('Profile photo upload failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be saved.' },
    });
  }
}

/**
 * DELETE /api/auth/avatar
 */
export async function removeAvatarHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.viewer) {
      res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Sign in to change your photo.' },
      });
      return;
    }
    await removeAvatarService(req.viewer);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Profile photo removal failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be removed.' },
    });
  }
}

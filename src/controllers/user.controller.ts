import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { getAvatarByPublicUserId } from '../services/user-avatar.service.js';

/**
 * GET /api/users/:publicUserId/avatar
 *
 * Serves a contributor's profile photo by their public identifier. The route
 * takes a public id, never an internal one, and answers 404 — not a generated
 * placeholder — when an account has no photo, so the interface can fall back to
 * its own default mark.
 */
export async function getAvatarHandler(req: Request, res: Response): Promise<void> {
  try {
    const publicUserId = String(req.params.publicUserId ?? '').trim();
    const avatar = await getAvatarByPublicUserId(publicUserId);
    if (!avatar) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No profile photo.' } });
      return;
    }

    const buffer = Buffer.from(avatar.base64, 'base64');
    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (err) {
    logger.error('Profile photo lookup failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'The profile photo could not be loaded.' },
    });
  }
}

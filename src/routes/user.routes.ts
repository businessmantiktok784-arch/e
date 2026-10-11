import { Router } from 'express';
import { getAvatarHandler } from '../controllers/user.controller.js';

export const userRouter = Router();

/**
 * Public contributor profiles (avatars).
 *
 * Keyed by the public user id only. There is no route here that accepts an
 * internal id or exposes any account detail beyond the image itself.
 */
userRouter.get('/api/users/:publicUserId/avatar', getAvatarHandler);

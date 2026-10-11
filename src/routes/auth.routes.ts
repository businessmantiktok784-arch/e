import { Router } from 'express';
import {
  removeAvatarHandler,
  requestCodeHandler,
  sessionHandler,
  setAvatarHandler,
  signOutHandler,
  updateProfileHandler,
  verifyCodeHandler,
} from '../controllers/auth.controller.js';
import { requireUser } from '../utils/user-auth.js';

export const authRouter = Router();

/**
 * WhatsApp verification login (Stage 12).
 *
 * Every response is content-free with respect to secrets: a code is delivered
 * only over WhatsApp (or the development console) and a session token is
 * returned exactly once, when the matching code is verified.
 */

authRouter.post('/api/auth/request-code', requestCodeHandler);
authRouter.post('/api/auth/verify-code', verifyCodeHandler);
authRouter.get('/api/auth/session', sessionHandler);
authRouter.post('/api/auth/sign-out', signOutHandler);
authRouter.patch('/api/auth/profile', requireUser, updateProfileHandler);
authRouter.post('/api/auth/avatar', requireUser, setAvatarHandler);
authRouter.delete('/api/auth/avatar', requireUser, removeAvatarHandler);

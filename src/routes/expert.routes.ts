import { Router } from 'express';
import { expertController } from '../controllers/expert.controller.js';
import { requireSuperAdmin } from '../utils/admin-auth.js';

export const expertRouter = Router();

// Every review route requires a Super Admin session.
// Earth Talk has no expert login: /api/expert/auth/login and
// /api/expert/media/:passportId were removed with the fake-account system and
// the synthetic specimen image respectively.
// Sign-in is public; it is the only unauthenticated route in this router.
expertRouter.post('/api/expert/auth/login', expertController.login);

expertRouter.get('/api/expert/auth/me', requireSuperAdmin, expertController.getMe);
expertRouter.get('/api/expert/session', requireSuperAdmin, expertController.getMe);
expertRouter.post('/api/expert/auth/logout', requireSuperAdmin, expertController.logout);
expertRouter.post('/api/expert/logout', requireSuperAdmin, expertController.logout);
expertRouter.get('/api/expert/stats', requireSuperAdmin, expertController.getStats);
expertRouter.get('/api/expert/observations', requireSuperAdmin, expertController.getObservations);
expertRouter.get(
  '/api/expert/observations/:passportId',
  requireSuperAdmin,
  expertController.getObservationDetail
);
expertRouter.post(
  '/api/expert/observations/:passportId/review',
  requireSuperAdmin,
  expertController.submitReview
);
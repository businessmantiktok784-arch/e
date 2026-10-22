import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireSuperAdmin } from '../utils/admin-auth.js';

export const adminRouter = Router();

// Super Admin only.
adminRouter.get('/api/admin/compliance-logs', requireSuperAdmin, adminController.getComplianceLogs);
adminRouter.get('/api/admin/reviewers', requireSuperAdmin, adminController.getReviewers);

/**
 * Evidence, moderation and audit endpoints.
 *
 * Every route here is behind `requireSuperAdmin` and every one of them writes to
 * the durable audit log from inside the repository method, so an administrative
 * change to a published record cannot happen without leaving a reason and an
 * actor. There is no bulk or silent path.
 */
adminRouter.get('/api/admin/audit-log', requireSuperAdmin, adminController.getAuditLog);
adminRouter.get(
  '/api/admin/observations/:observationId/media',
  requireSuperAdmin,
  adminController.listObservationMedia
);
adminRouter.patch(
  '/api/admin/observations/:observationId/evidence-state',
  requireSuperAdmin,
  adminController.updateEvidenceState
);
adminRouter.patch(
  '/api/admin/observations/:observationId/publication-status',
  requireSuperAdmin,
  adminController.updatePublicationStatus
);
adminRouter.patch('/api/admin/media/:mediaId/visibility', requireSuperAdmin, adminController.updateMediaVisibility);
adminRouter.patch('/api/admin/media/:mediaId/moderation', requireSuperAdmin, adminController.updateMediaModeration);

/**
 * Community discussion moderation (Stage 12).
 *
 * Two routes, same discipline as the rest of this file: behind
 * `requireSuperAdmin`, and the mutating one records the actor and reason on
 * the comment row itself rather than writing one giant anonymous edit.
 */
adminRouter.get('/api/admin/community/comments', requireSuperAdmin, adminController.getCommunityComments);
adminRouter.patch(
  '/api/admin/community/comments/:commentId/moderation',
  requireSuperAdmin,
  adminController.moderateCommunityComment
);

/**
 * Community attachment moderation. Uploaded images and clips are hidden until a
 * Super Admin makes them visible; this is the only path that can do so.
 */
adminRouter.patch(
  '/api/admin/community/media/:mediaId/moderation',
  requireSuperAdmin,
  adminController.updateCommunityMediaModeration
);

/**
 * Community abuse reports. These are the reports filed with the report button
 * on questions, investigations and observations, which until now were accepted
 * and never read back. Reading the queue and resolving an item are both
 * Super-Admin only, and the resolution records the actor.
 */
adminRouter.get('/api/admin/community/reports', requireSuperAdmin, adminController.getAbuseReports);
adminRouter.patch(
  '/api/admin/community/reports/:publicId',
  requireSuperAdmin,
  adminController.resolveAbuseReport
);
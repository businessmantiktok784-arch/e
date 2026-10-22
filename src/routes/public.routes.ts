import { Router } from 'express';
import {
  getPublicObservations,
  getPublicObservationsGeoJson,
  getUnlocatedObservations,
  getPublicObservationByPassportId,
  getPublicStats,
  getPublicDistricts,
  getPublicCategories,
  getObservationIntelligence,
  getObservationContext,
  getNearbyObservations,
  getSimilarObservations,
  compareObservations,
  listResearchOpportunities,
} from '../controllers/public.controller.js';

export const publicRouter = Router();

// Section 14: Public API endpoints
publicRouter.get('/api/public/observations', getPublicObservations);
publicRouter.get('/api/public/observations.geojson', getPublicObservationsGeoJson);
// Must precede the `:passportId` route, or "unlocated" is read as a passport.
publicRouter.get('/api/public/observations/unlocated', getUnlocatedObservations);
publicRouter.get('/api/public/observations/compare', compareObservations);
publicRouter.get('/api/public/observations/:passportId/intelligence', getObservationIntelligence);
publicRouter.get('/api/public/observations/:passportId/context', getObservationContext);
publicRouter.get('/api/public/observations/:passportId/nearby', getNearbyObservations);
publicRouter.get('/api/public/observations/:passportId/similar', getSimilarObservations);
publicRouter.get('/api/public/observations/:passportId', getPublicObservationByPassportId);
publicRouter.get('/api/public/research-opportunities', listResearchOpportunities);
publicRouter.get('/api/public/stats', getPublicStats);
publicRouter.get('/api/public/districts', getPublicDistricts);
publicRouter.get('/api/public/categories', getPublicCategories);

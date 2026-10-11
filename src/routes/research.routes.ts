import { Router } from 'express';
import { researchController } from '../controllers/research.controller.js';
import { requireExpertAuth } from '../utils/expert-auth.js';

export const researchRouter = Router();

// Research dataset & analytics endpoints
// Authenticated expert or researcher access
researchRouter.get('/api/research/summary', requireExpertAuth, researchController.getSummary);
researchRouter.get('/api/research/dataset-version', requireExpertAuth, researchController.getDatasetVersion);
researchRouter.get('/api/research/observations.csv', requireExpertAuth, researchController.exportCsv);
researchRouter.get('/api/research/observations.geojson', requireExpertAuth, researchController.exportGeoJson);
researchRouter.get('/api/research/quality/:passportId', requireExpertAuth, researchController.getQuality);

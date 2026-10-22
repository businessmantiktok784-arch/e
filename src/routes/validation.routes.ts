import { Router } from 'express';
import { validationController } from '../controllers/validation.controller.js';
import { requireExpertAuth, requireAdminAuth } from '../utils/expert-auth.js';

export const validationRouter = Router();

// Validation dataset endpoints
validationRouter.get('/api/research/validation/datasets', requireExpertAuth, validationController.listDatasets);
validationRouter.post('/api/research/validation/datasets', requireAdminAuth, validationController.createDataset);
validationRouter.get('/api/research/validation/datasets/:id', requireExpertAuth, validationController.getDataset);
validationRouter.post('/api/research/validation/datasets/:id/lock', requireAdminAuth, validationController.lockDataset);

// Validation specimen samples
validationRouter.post('/api/research/validation/samples', requireAdminAuth, validationController.createSample);
validationRouter.get('/api/research/validation/samples/:id', requireExpertAuth, validationController.getSample);
validationRouter.post('/api/research/validation/samples/:id/images', requireAdminAuth, validationController.addImage);

// Reference labeling (experts and admins)
validationRouter.post('/api/research/validation/reference-labels', requireExpertAuth, validationController.submitReferenceLabel);

// AI Evaluation runs
validationRouter.post('/api/research/validation/runs', requireAdminAuth, validationController.triggerRun);
validationRouter.get('/api/research/validation/evaluations/:runId', requireExpertAuth, validationController.getEvaluation);
validationRouter.get('/api/research/validation/errors/:runId', requireExpertAuth, validationController.getErrors);
validationRouter.get('/api/research/validation/export/:runId', requireExpertAuth, validationController.exportResults);

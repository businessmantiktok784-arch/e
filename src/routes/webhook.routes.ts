import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/webhook.controller.js';

export const webhookRouter = Router();

// Meta webhook verification challenge
webhookRouter.get('/webhook', verifyWebhook);

// Meta webhook event notifications
webhookRouter.post('/webhook', handleWebhook);

import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/webhook.controller.js';
import { requireWhatsAppSignature } from '../utils/whatsapp-signature.js';

export const webhookRouter = Router();

// Meta webhook verification challenge (GET). Authenticated by the verification
// token compared inside the handler, which is a different secret from the app
// secret used to sign event deliveries.
webhookRouter.get('/webhook', verifyWebhook);

// Meta webhook event notifications (POST). The signature is verified over the
// raw body before the handler is allowed to run, so an unsigned request cannot
// reach message processing, AI inference or the database.
webhookRouter.post('/webhook', requireWhatsAppSignature, handleWebhook);

import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { geoscienceAnalysisService, USER_FACING_MESSAGES } from '../services/geoscience-analysis.service.js';
import { communityCommandService } from '../services/community-commands.service.js';
import type { WhatsAppMessage, WhatsAppWebhookPayload } from '../types/whatsapp.types.js';

export const RESPONSES = {
  START: `🪨 Welcome to Earth Talk!

Send me a photo or a short video of a rock, mineral, fossil, rock layer, landform, spring, slope or any other geological feature you find interesting.

I will help you learn about it.

Type HELP to see what you can do.`,

  HELP: `🪨 EARTH TALK HELP

You can:

📸 Send a photo of a rock, mineral, fossil, layer, landform, spring, slope or geological structure
🎥 Send a short video (a moving view often shows more than a still photo)
📍 Share a location pin first, then send the photo or video, to record where you were
💬 Ask questions
ℹ️ Learn how Earth Talk works

Type START to begin.`,

  PHOTO: `📸 Photo received!

Your submission has been received by Earth Talk.

The AI geoscience analysis is being connected. You will get an interpretation and an observation ID shortly.`,

  UNKNOWN: `🪨 I'm Earth Talk.

Send me a photo or short video of something geological, or type HELP to see what I can do.`,
};

/**
 * Determines the appropriate text response based on message type and content.
 */
function determineTextResponse(message: WhatsAppMessage): string {
  const rawText = message.text?.body || '';
  const normalized = rawText.trim().toLowerCase();

  if (normalized === 'start' || normalized === 'hello' || normalized === 'hi') {
    return RESPONSES.START;
  }

  if (normalized === 'help') {
    return RESPONSES.HELP;
  }

  return RESPONSES.UNKNOWN;
}

/**
 * GET /webhook
 * Meta Webhook verification endpoint.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verification successful');
    res.status(200).send(challenge);
  } else {
    logger.warn('Webhook verification failed: Invalid verify token or mode');
    res.sendStatus(403);
  }
}

/**
 * POST /webhook
 * Meta WhatsApp Cloud API event endpoint.
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  // Validate request structure
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Invalid JSON request' });
    return;
  }

  const payload = req.body as WhatsAppWebhookPayload;

  // Verify that the event is from a WhatsApp Business Account
  if (payload.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  logger.info('Webhook event received');

  // Immediately acknowledge Meta with HTTP 200 to prevent webhook timeouts
  res.status(200).send('EVENT_RECEIVED');

  // Process entries and messages
  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      const messages = value.messages || [];
      for (const message of messages) {
        logger.info(`Message type: ${message.type}`, {
          messageId: message.id,
        });

        // Stage 2: Multimodal media handling (image and video)
        if (message.type === 'image' || message.type === 'video') {
          const media = message.type === 'image' ? message.image : message.video;
          const mediaId = media?.id;
          const declaredMimeType = media?.mime_type;
          const caption = media?.caption;

          if (mediaId) {
            // Asynchronously process the media without blocking the webhook.
            // Meta retries on a slow response, and a duplicate retry would burn a
            // second AI call for the same message, so the handler acknowledges
            // first and works in the background.
            geoscienceAnalysisService
              .processRockImage({
                senderPhoneNumber: message.from,
                messageId: message.id,
                mediaId,
                declaredMimeType,
                caption,
              })
              .catch((err: unknown) => {
                const errMsg = err instanceof Error ? err.message : 'Unknown error';
                logger.error('Unhandled error in async media processing', {
                  messageId: message.id,
                  error: errMsg,
                });
              });
          } else {
            logger.warn('Media message received without media ID', {
              messageId: message.id,
              mediaType: message.type,
            });
            whatsappService
              .sendTextMessage(message.from, USER_FACING_MESSAGES.INSUFFICIENT_IMAGE)
              .catch(() => {});
          }
          continue;
        }

        // Location pin handling
        //
        // A pin is recorded privately and held for the next photo or video from
        // the same sender. It is never published as an exact point, and it is
        // never interpreted as a verified place name.
        if (message.type === 'location' && message.location) {
          const { latitude, longitude, name, address } = message.location;

          if (typeof latitude === 'number' && typeof longitude === 'number') {
            await geoscienceAnalysisService
              .recordSharedLocation({
                senderPhoneNumber: message.from,
                latitude,
                longitude,
                name,
                address,
              })
              .catch((err: unknown) => {
                logger.error('Failed to record shared location', {
                  messageId: message.id,
                  error: err instanceof Error ? err.message : 'Unknown error',
                });
              });
          } else {
            logger.warn('Location message without usable coordinates', { messageId: message.id });
          }
          continue;
        }

        // Text Message Handling (Stage 1 text + Stage 8 community commands)
        if (message.type === 'text') {
          // Community Discovery commands take precedence over the plain-text
          // fallback. If the message is not a community command the handler
          // returns false and the original Stage 1 behaviour applies.
          const handled = await communityCommandService
            .handleTextMessage(message.from, message.text?.body ?? '')
            .catch((err: unknown) => {
              logger.error('Community command dispatch failed', {
                messageId: message.id,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
              return false;
            });

          if (handled) continue;

          const responseText = determineTextResponse(message);
          try {
            await whatsappService.sendTextMessage(message.from, responseText);
            logger.info('Message processing result: text reply dispatched', {
              recipient: message.from,
              messageId: message.id,
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            logger.error('Message processing result: failed to send text reply', { error: errMsg });
          }
          continue;
        }

        // Other unsupported message types (audio, document, contacts, etc.)
        //
        // Replaced rather than ignored, because silence reads as a failure to the
        // sender and leaves them with no idea whether their submission arrived.
        try {
          await whatsappService.sendTextMessage(message.from, RESPONSES.UNKNOWN);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          logger.error('Failed to send fallback reply', { error: errMsg });
        }
      }

      // Handle delivery status events if present
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          logger.debug(`Message status update: ${status.status} for ${status.id}`);
        }
      }
    }
  }
}

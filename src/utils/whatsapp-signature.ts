import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Meta WhatsApp Cloud API webhook authentication.
 *
 * Every event delivery Meta makes is signed with the application secret and
 * carries the signature in `X-Hub-Signature-256` as `sha256=<hex>`. We recompute
 * the HMAC-SHA256 over the *exact raw request body* and compare the digests in
 * constant time. The body must be hashed before JSON parsing, so the raw bytes
 * are captured by the `express.json({ verify })` hook in `server.ts`.
 *
 * The webhook *verification token* (the GET handshake) is a different secret and
 * is never used here.
 */

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

const SIGNATURE_PATTERN = /^sha256=([0-9a-fA-F]{64})$/;

/**
 * Verifies a `X-Hub-Signature-256` header against the raw body and secret.
 *
 * Returns false for a missing, malformed or mismatched signature. The result is
 * never treated as "skip verification": a malformed header is a rejection, not
 * a reason to process the request unsigned.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) return false;

  const match = SIGNATURE_PATTERN.exec(signatureHeader.trim());
  if (!match) return false;

  const provided = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();

  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

/**
 * Express middleware: rejects any unsigned or incorrectly signed webhook event
 * before the handler runs, so no AI inference, database write or media download
 * can be triggered by an unauthenticated request.
 */
export function requireWhatsAppSignature(
  req: RequestWithRawBody,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers['x-hub-signature-256'];
  const header = Array.isArray(signature) ? signature[0] : signature;

  if (verifyWebhookSignature(req.rawBody, header, env.WHATSAPP_APP_SECRET)) {
    next();
    return;
  }

  // The request id, not the signature or the body, is what a support engineer
  // needs to find this rejection again. The signature itself is never logged.
  logger.warn('Rejected webhook event with a missing or invalid signature', {
    requestId: (req as Request & { requestId?: string }).requestId,
    hasSignatureHeader: Boolean(header),
    hasRawBody: Boolean(req.rawBody),
  });
  res.status(401).json({ error: 'Invalid signature' });
}

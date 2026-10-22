import type { Response } from 'express';
import { logger } from './logger.js';

/**
 * Shared HTTP response helpers for controllers.
 *
 * Every controller reports a failure with the same `{ error: { code, message } }`
 * shape, reads a JSON body the same way and sends the same security headers.
 * Keeping that in one place is what makes the shape a contract rather than a
 * convention each controller re-types.
 */

/** A service error that already carries the status and code to answer with. */
export interface HttpCodedError extends Error {
  status: number;
  code: string;
}

function isHttpCodedError(err: unknown): err is HttpCodedError {
  return (
    err instanceof Error &&
    typeof (err as { status?: unknown }).status === 'number' &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}

/** Reads a request body as a plain object, tolerating a missing or non-object body. */
export function bodyOf(req: { body: unknown }): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

/** Answers with the standard error envelope. */
export function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/**
 * Translates a thrown error into a response: a service error keeps its own
 * status and code, anything else becomes an opaque 500 so no internal detail
 * reaches the client.
 */
export function sendError(res: Response, err: unknown): void {
  if (isHttpCodedError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  logger.error('Request failed', { error: String(err) });
  fail(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.');
}

/** Standard security and cache headers for a public, read-only endpoint. */
export function setPublicHeaders(res: Response, maxAgeSeconds = 30): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

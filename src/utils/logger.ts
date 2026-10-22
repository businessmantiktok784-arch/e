/**
 * Structured logger for Earth Talk.
 *
 * Every log line is passed through `redactForLog`, which removes access tokens,
 * secrets, OTPs and raw phone numbers (replacing a phone number with a stable,
 * non-reversible pseudonym so events about the same contributor stay
 * correlatable without exposing who they are).
 *
 * The redaction is central here rather than left to each call site, because a
 * single forgotten `logger.info(number)` is all it takes to leak a personal
 * identifier into an operations log.
 */

import { redactForLog, redactString } from './pii.js';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function safeMessage(message: string): string {
  return typeof message === 'string' ? redactString(message) : String(message);
}

function safeMeta(meta: unknown): string | undefined {
  if (meta === undefined) return undefined;
  return JSON.stringify(redactForLog(meta));
}

export const logger = {
  info(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    const extra = safeMeta(meta);
    if (extra !== undefined) {
      console.log(`[${timestamp}] [INFO] ${safeMessage(message)}`, extra);
    } else {
      console.log(`[${timestamp}] [INFO] ${safeMessage(message)}`);
    }
  },

  warn(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    const extra = safeMeta(meta);
    if (extra !== undefined) {
      console.warn(`[${timestamp}] [WARN] ${safeMessage(message)}`, extra);
    } else {
      console.warn(`[${timestamp}] [WARN] ${safeMessage(message)}`);
    }
  },

  error(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    const extra = safeMeta(meta);
    if (extra !== undefined) {
      console.error(`[${timestamp}] [ERROR] ${safeMessage(message)}`, extra);
    } else {
      console.error(`[${timestamp}] [ERROR] ${safeMessage(message)}`);
    }
  },

  debug(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    const extra = safeMeta(meta);
    if (extra !== undefined) {
      console.debug(`[${timestamp}] [DEBUG] ${safeMessage(message)}`, extra);
    } else {
      console.debug(`[${timestamp}] [DEBUG] ${safeMessage(message)}`);
    }
  },
};

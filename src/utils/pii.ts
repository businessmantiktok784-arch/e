import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Personal-data handling for logs.
 *
 * Earth Talk must never write a raw WhatsApp phone number (or other direct
 * personal identifier) to an application log. Instead, a sender is represented
 * by a stable pseudonym derived with a keyed HMAC, so the same person can be
 * correlated across events without the log revealing who they are.
 *
 * The key lives only in server-side secret configuration (`USER_HASH_SECRET`)
 * and is never returned to a client.
 */

const PHONE_LIKE = /^\+?[\d][\d\s().-]{6,18}\d$/;

/** True when a value looks like a phone number rather than an opaque id. */
export function looksLikePhoneNumber(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!PHONE_LIKE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function key(): string {
  return env.USER_HASH_SECRET || env.SUPABASE_SECRET_KEY || 'earth-talk-pii-key-not-configured';
}

/**
 * A non-reversible, stable pseudonym for a phone number. The `pid_` prefix
 * makes it obvious in a log that this is not the number itself.
 */
export function pseudonymizePhone(phone: unknown): string {
  if (typeof phone !== 'string' || phone.trim() === '') return 'pid_unknown';
  const digest = crypto.createHmac('sha256', key()).update(phone.trim()).digest('hex');
  return `pid_${digest.slice(0, 16)}`;
}

/**
 * A human-readable but non-identifying mask. Kept for cases where an operator
 * needs to see a hint without the full number (for example support triage).
 * The last two digits are retained because they are not enough to identify a
 * subscriber on their own.
 */
export function maskPhone(phone: unknown): string {
  if (typeof phone !== 'string') return '[redacted]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[redacted]';
  return `${'*'.repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`;
}

/** Keys whose values must never reach a log, matched case-insensitively. */
const SENSITIVE_KEY =
  /(\bpass(?!port)(word|code|phrase)?|secret|token|authorization|bearer|api[_-]?key|apikey|access[_-]?key|otp|one[_-]?time|verification[_-]?code|code[_-]?hash|session|credential|private[_-]?key)/i;

/** Keys that hold a phone number under a name that does not say "phone". */
const PHONE_KEY = /(phone|msisdn|sender|recipient|from|to|wa_id|contact)/i;

/**
 * Recursively redacts sensitive values in an arbitrary log payload:
 *   * values under a sensitive key name are replaced with `[REDACTED]`
 *   * phone-like values anywhere (including nested objects and provider error
 *     messages) are replaced with a stable pseudonym
 *   * Meta access tokens embedded in strings are stripped
 *
 * The result is always a fresh structure so a caller's object is never mutated.
 */
export function redactForLog(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    if (looksLikePhoneNumber(input)) return pseudonymizePhone(input);
    return redactString(input);
  }

  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => redactForLog(item, depth + 1));
  }

  if (input instanceof Error) {
    return redactForLog(
      { name: input.name, message: input.message, category: (input as { category?: unknown }).category },
      depth + 1
    );
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = '[REDACTED]';
      } else if (PHONE_KEY.test(k) && looksLikePhoneNumber(v)) {
        out[k] = pseudonymizePhone(v);
      } else {
        out[k] = redactForLog(v, depth + 1);
      }
    }
    return out;
  }

  return '[unserializable]';
}

/** Strips long secrets from a free-text string (e.g. a provider error message). */
export function redactString(value: string): string {
  return value
    .replace(/(EA[A-Za-z0-9_-]{20,})/g, '[REDACTED_ACCESS_TOKEN]')
    .replace(/(Bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(rt_session_)[A-Za-z0-9_-]+/g, '$1[REDACTED]')
    .replace(/(\b\d{8,15}\b)/g, (match) => pseudonymizePhone(match));
}

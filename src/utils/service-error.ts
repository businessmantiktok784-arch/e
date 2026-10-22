import type { HttpCodedError } from './http.js';

/**
 * Raised when a required persistent operation cannot be completed because the
 * authoritative database is unreachable, timed out or refused the request.
 *
 * This exists so a database outage is never silently reinterpreted as "the
 * record does not exist" or "the write succeeded". A caller that receives this
 * error must answer 503 (service unavailable), and must NOT fall back to a
 * process-local store or treat an empty result as authoritative.
 */
export class ServiceUnavailableError extends Error implements HttpCodedError {
  readonly status = 503;
  readonly code: string;
  readonly operation: string;

  constructor(operation: string, cause?: unknown, message?: string) {
    super(
      message ??
        `The ${operation} is temporarily unavailable because the database could not be reached. No data was changed.`
    );
    this.name = 'ServiceUnavailableError';
    this.code = 'DATABASE_UNAVAILABLE';
    this.operation = operation;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export function isServiceUnavailableError(err: unknown): err is ServiceUnavailableError {
  return err instanceof ServiceUnavailableError;
}

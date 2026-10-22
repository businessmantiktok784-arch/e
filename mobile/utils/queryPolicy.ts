import { ApiError } from '../services/api.ts';

/** Retry a single transient read failure. Never retry config, validation, auth or rate-limit errors. */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && error instanceof ApiError && ['network', 'timeout', 'server'].includes(error.kind);
}

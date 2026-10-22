import { ApiError } from '../services/api.ts';

/** Maps backend/client errors to short messages without exposing raw server internals. */
export function userFacingError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.kind) {
    case 'configuration': return 'The Earth Talk API is not configured correctly. Check the mobile setup.';
    case 'network': return 'Could not reach Earth Talk. Check your connection and try again.';
    case 'timeout': return 'The request took too long. Try again.';
    case 'unauthorized': return 'This action needs a valid sign-in or contributor session.';
    case 'forbidden': return 'You do not have permission to do that.';
    case 'not-found': return 'This public record is unavailable.';
    case 'rate-limit': return 'Too many requests. Wait a moment and try again.';
    case 'server': return 'Earth Talk is temporarily unavailable. Try again later.';
    case 'malformed': return 'Earth Talk returned an unexpected response. Please retry.';
    default: return 'The request could not be completed. Please try again.';
  }
}

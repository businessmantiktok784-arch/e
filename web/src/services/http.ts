/**
 * Shared fetch helpers for the web API clients.
 *
 * Each service used to declare its own base URL, JSON headers, `res.ok` check
 * and error-message extraction. They live here now so the backend error
 * envelope (`{ error: { code, message } }`, or a bare `{ error }` string) is
 * interpreted in exactly one place.
 */

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** JSON content type plus a bearer token when one is present. */
export function bearerHeaders(
  token: string | null | undefined,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export interface JsonRequestInit extends Omit<RequestInit, 'body'> {
  /** JSON body; serialised and paired with a JSON content type. */
  json?: unknown;
  /** Resolve `null` on HTTP 404 instead of throwing. */
  nullOn404?: boolean;
  /** Message used when the response carries no readable error. */
  errorMessage?: string | ((res: Response) => string);
}

/**
 * Extracts a readable message from an error response, whatever its shape.
 *
 * The community routes nest the message (`{ error: { code, message } }`) while
 * older routes send a bare string (`{ error: '...' }`); both are handled, and a
 * 503 is named plainly because the caller acted on a feature that is simply off.
 */
export async function readErrorMessage(res: Response, fallback?: string): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  }
  if (res.status === 503) {
    return 'This feature is unavailable right now. Nothing was recorded.';
  }
  return fallback && fallback.length > 0 ? fallback : `Request failed (${res.status})`;
}

function buildInit(init: Omit<JsonRequestInit, 'nullOn404' | 'errorMessage'>): RequestInit {
  const { json, headers, ...rest } = init;
  return {
    ...rest,
    headers:
      json === undefined
        ? headers
        : { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  };
}

function resolveFallback(
  errorMessage: JsonRequestInit['errorMessage'],
  res: Response
): string | undefined {
  return typeof errorMessage === 'function' ? errorMessage(res) : errorMessage;
}

/** Fetches JSON, throwing a readable `Error` for any non-2xx response. */
export async function requestJson<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
  const { nullOn404, errorMessage, ...rest } = init;
  const res = await fetch(apiUrl(path), buildInit(rest));
  if (nullOn404 && res.status === 404) return null as unknown as T;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  return (await res.json()) as T;
}

/** Fetches a binary body (CSV/GeoJSON download), throwing for non-2xx. */
export async function requestBlob(path: string, init: JsonRequestInit = {}): Promise<Blob> {
  const { nullOn404, errorMessage, ...rest } = init;
  const res = await fetch(apiUrl(path), buildInit(rest));
  if (nullOn404 && res.status === 404) return null as unknown as Blob;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  return res.blob();
}

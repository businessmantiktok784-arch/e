/**
 * `fetch` with a hard timeout.
 *
 * A socket that opens and then stops responding would otherwise hang a webhook
 * worker indefinitely. Node's global `fetch` accepts an `AbortSignal`, so a
 * timer aborts the request and the caller sees a normal network error it can
 * handle.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

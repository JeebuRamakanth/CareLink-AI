/**
 * HTTP fetch helper with timeout + abort support (Step 9).
 *
 * Wraps the platform `fetch` with:
 * - a configurable timeout (AbortController) so providers never hang forever;
 * - safe, normalized error conversion (no secret leakage);
 * - a tiny JSON parser that tolerates malformed/empty bodies.
 *
 * This is the ONLY network primitive the real-provider boundary adapters use.
 */

import { toIntegrationError, IntegrationError } from './errors';

export interface HttpOptions {
  /** Timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** External abort signal to also honor. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options: HttpOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller passed their own signal, forward its abort to our controller.
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, {
      method: 'GET',
      headers: options.headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, options);
  } catch (err) {
    throw toIntegrationError(err, 'http');
  }

  if (response.status === 401) {
    throw toIntegrationError(new Error('unauthorized'), 'http');
  }
  if (response.status === 403) {
    throw toIntegrationError(new Error('forbidden'), 'http');
  }
  if (response.status === 404) {
    throw toIntegrationError(new Error('not-found'), 'http');
  }
  if (response.status === 429) {
    throw toIntegrationError(new Error('rate-limit'), 'http');
  }
  if (!response.ok) {
    throw toIntegrationError(new Error(`status ${response.status}`), 'http');
  }

  const text = await response.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IntegrationError({ code: 'malformed-response', provider: 'http' });
  }
}

export { toIntegrationError };
export type { IntegrationError, IntegrationErrorCode } from './errors';

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
  method?: 'GET' | 'POST';
  /** Serialized request body (POST only). */
  body?: string;
  /** Max accepted request-body size in bytes (POST only). Default 64 KB. */
  maxBodyBytes?: number;
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
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
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

export async function getJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, options);
  } catch (err) {
    throw toIntegrationError(err, 'http');
  }
  return parseJsonResponse<T>(response);
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * POST a JSON body and parse a JSON response. Enforces a request-size cap so
 * abusive/oversized payloads never leave the browser. The body must already be
 * serialized; headers are merged with a JSON content type.
 */
export async function postJson<T>(url: string, payload: unknown, options: HttpOptions = {}): Promise<T> {
  const body = JSON.stringify(payload);
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (body.length > maxBodyBytes) {
    throw new IntegrationError({ code: 'payload-too-large', provider: 'http', message: 'request body too large' });
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...options,
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...options.headers },
    });
  } catch (err) {
    throw toIntegrationError(err, 'http');
  }
  return parseJsonResponse<T>(response);
}

export { toIntegrationError };
export type { IntegrationError, IntegrationErrorCode } from './errors';

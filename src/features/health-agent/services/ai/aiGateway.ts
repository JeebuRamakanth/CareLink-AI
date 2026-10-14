/**
 * AI gateway client (Step 13 §1, §20, §21).
 *
 * The ONLY network path from the browser to the AI provider. The browser calls
 * the secure gateway (Supabase Edge Function / API gateway) which holds the
 * provider key server-side — no AI secret ever appears in VITE_ variables.
 *
 * Abuse/cost controls enforced client-side (the gateway enforces them again
 * server-side):
 * - token-bucket rate limit (per browser session)
 * - request-size cap and per-field truncation
 * - timeout + caller cancellation
 * - no automatic retry, to avoid duplicate billable provider requests
 * - schema validation of every response before use
 */

import { env } from '../../../../config';
import { getSupabaseClient } from '../../../../services/supabase/client';
import type { AIChatRequest, AIChatResponse, AIEngineOutcome } from './aiTypes';
import { validateAIChatResponse } from './aiSchemas';

const GATEWAY_TIMEOUT_MS = 25000;
const MAX_REQUEST_BYTES = 48 * 1024;

/* ----------------------------------------------------------------------------
 * Token-bucket rate limiter (per browser session)
 * ------------------------------------------------------------------------- */

const RATE_CAPACITY = 8;
const RATE_REFILL_PER_MIN = 8;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const bucket: Bucket = { tokens: RATE_CAPACITY, lastRefill: Date.now() };

const refill = () => {
  const now = Date.now();
  const elapsedMin = (now - bucket.lastRefill) / 60000;
  if (elapsedMin > 0) {
    bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + elapsedMin * RATE_REFILL_PER_MIN);
    bucket.lastRefill = now;
  }
};

/** Consume one token; false when the session is over the limit. */
export function tryConsumeRateToken(): boolean {
  refill();
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/** Test hook: reset the bucket (used by the smoketest). */
export function resetRateLimiter(): void {
  bucket.tokens = RATE_CAPACITY;
  bucket.lastRefill = Date.now();
}

/* ----------------------------------------------------------------------------
 * Gateway resolution
 * ------------------------------------------------------------------------- */

export type AIGatewayMode = 'real' | 'unavailable';

export function aiGatewayMode(): AIGatewayMode {
  return env.supabase.configured ? 'real' : 'unavailable';
}

async function safeGatewayError(error: unknown): Promise<string> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return 'gateway-error';
  const context = error.context;
  if (!(context instanceof Response)) return 'gateway-error';

  let body: unknown;
  try {
    body = await context.clone().json();
  } catch {
    return 'gateway-error';
  }
  if (typeof body !== 'object' || body === null || !('error' in body) || typeof body.error !== 'string') {
    return 'gateway-error';
  }

  const safeReasons = new Set([
    'ai-not-configured',
    'authorization-unavailable',
    'malformed-request',
    'provider-rate-limit',
    'provider-unavailable',
    'rate-limit',
    'unauthorized',
  ]);
  return safeReasons.has(body.error) ? body.error : 'gateway-error';
}

/* ----------------------------------------------------------------------------
 * Gateway call
 * ------------------------------------------------------------------------- */

/**
 * Send a turn to the secure AI gateway and validate the structured response.
 * Returns a discriminated outcome — never throws for provider/malformed
 * failures; callers fall back to the safe heuristic path on 'unavailable'.
 */
export async function sendToAIGateway(
  request: AIChatRequest,
  signal?: AbortSignal
): Promise<AIEngineOutcome> {
  if (!env.supabase.configured) return { kind: 'unavailable', reason: 'no-gateway-configured' };
  if (!tryConsumeRateToken()) return { kind: 'unavailable', reason: 'rate-limited' };

  const client = await getSupabaseClient();
  if (!client) return { kind: 'unavailable', reason: 'backend-unavailable' };
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_REQUEST_BYTES) {
    return { kind: 'unavailable', reason: 'payload-too-large' };
  }

  let raw: unknown;
  try {
    const { data, error } = await client.functions.invoke<unknown>('ai-gateway', {
      body: request,
      signal,
      timeout: GATEWAY_TIMEOUT_MS,
    });
    if (error) return { kind: 'unavailable', reason: await safeGatewayError(error) };
    raw = data;
  } catch {
    return { kind: 'unavailable', reason: 'gateway-unreachable' };
  }

  const validated: AIChatResponse | null = validateAIChatResponse(raw);
  if (!validated) return { kind: 'unavailable', reason: 'malformed-response' };
  return { kind: 'validated', response: validated };
}

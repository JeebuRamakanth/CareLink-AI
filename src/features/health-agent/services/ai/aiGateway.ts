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
 * - request-size cap (postJson) and per-field truncation
 * - timeout + caller cancellation
 * - at most ONE bounded retry on retryable errors — never an infinite loop
 * - schema validation of every response before use
 */

import { postJson, IntegrationError } from '../../../../lib';
import { env } from '../../../../config';
import { getSupabaseClient, isSupabaseConfigured } from '../../../../services/supabase/client';
import type { AIChatRequest, AIChatResponse, AIEngineOutcome } from './aiTypes';
import { validateAIChatResponse } from './aiSchemas';

const GATEWAY_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 600;

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

/** The gateway URL, or null when no secure AI endpoint is configured. */
export function aiGatewayUrl(): string | null {
  if (env.ai.configured) return `${env.ai.providerBaseUrl}/v1/agent/chat`;
  return null;
}

export function aiGatewayMode(): AIGatewayMode {
  return aiGatewayUrl() ? 'real' : 'unavailable';
}

/* ----------------------------------------------------------------------------
 * Gateway call
 * ------------------------------------------------------------------------- */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the caller's Supabase access token for the gateway's JWT check.
 * The edge function requires a verified user JWT — anonymous gateway calls
 * are rejected server-side. Returns null when signed out / not configured.
 */
async function resolveGatewayAuthToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const client = await getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function callGateway(url: string, request: AIChatRequest, signal?: AbortSignal): Promise<unknown> {
  const token = await resolveGatewayAuthToken();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  let attempt = 0;
  // Bounded retry: at most MAX_RETRIES additional attempts, only for
  // retryable errors (timeout/network/rate-limit/unavailable).
  for (;;) {
    try {
      return await postJson<unknown>(url, request, {
        timeoutMs: GATEWAY_TIMEOUT_MS,
        signal,
        maxBodyBytes: 48 * 1024,
        headers,
      });
    } catch (err) {
      const retryable = err instanceof IntegrationError && err.retryable;
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      attempt += 1;
      await wait(RETRY_DELAY_MS);
    }
  }
}

/**
 * Send a turn to the secure AI gateway and validate the structured response.
 * Returns a discriminated outcome — never throws for provider/malformed
 * failures; callers fall back to the safe heuristic path on 'unavailable'.
 */
export async function sendToAIGateway(
  request: AIChatRequest,
  signal?: AbortSignal
): Promise<AIEngineOutcome> {
  const url = aiGatewayUrl();
  if (!url) return { kind: 'unavailable', reason: 'no-gateway-configured' };
  if (!tryConsumeRateToken()) return { kind: 'unavailable', reason: 'rate-limited' };

  let raw: unknown;
  try {
    raw = await callGateway(url, request, signal);
  } catch (err) {
    const reason = err instanceof IntegrationError ? err.code : 'unknown';
    return { kind: 'unavailable', reason };
  }

  const validated: AIChatResponse | null = validateAIChatResponse(raw);
  if (!validated) return { kind: 'unavailable', reason: 'malformed-response' };
  return { kind: 'validated', response: validated };
}

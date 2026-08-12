/**
 * API mode + fallback resolution (Step 9).
 *
 * Strategy:
 *   REAL     → provider configured AND available
 *   MOCK     → credentials missing (never crash)
 *   FALLBACK → real provider configured but failed/timeout → fall back to mock
 *
 * `runWithFallback` wraps a real-provider call; on failure it returns the mock
 * result tagged `fallback` so the UI can show a "demo data" badge truthfully.
 */

import type { DataSource } from './errors';
import { toIntegrationError, type IntegrationError } from './errors';

export interface FallbackResult<T> {
  data: T;
  source: DataSource;
  error?: IntegrationError;
}

/**
 * Resolve the active data source for a provider given whether it is configured
 * and whether the last call failed. Pure helper, no side effects.
 */
export function resolveMode(configured: boolean, lastError?: IntegrationError | null): DataSource {
  if (!configured) return 'mock';
  if (lastError) return 'fallback';
  return 'real';
}

/**
 * Try a real provider; on failure, fall back to the mock provider. Never throws
 * to the caller — returns a FallbackResult so the UI can show the source.
 */
export async function runWithFallback<T>(params: {
  provider: string;
  configured: boolean;
  real: () => Promise<T>;
  mock: () => Promise<T>;
  signal?: AbortSignal;
}): Promise<FallbackResult<T>> {
  const { provider, configured, real, mock } = params;

  if (!configured) {
    return { data: await mock(), source: 'mock' };
  }

  try {
    const data = await real();
    return { data, source: 'real' };
  } catch (err) {
    const error = toIntegrationError(err, provider);
    const data = await mock();
    return { data, source: 'fallback', error };
  }
}

export type { DataSource };

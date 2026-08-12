/**
 * CareLink-AI — health-data repository helpers (Step 10).
 *
 * Shared, typed repository primitives so individual repositories stay tiny and
 * consistent. Every operation:
 *   - returns a normalized result or a safe AuthError/RepoError,
 *   - never lets a raw provider error reach the UI,
 *   - degrades to null/mock when Supabase is unavailable (no crash, no
 *     unhandled rejection, no infinite loading).
 */

import { getSupabaseClient } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '../../lib/security';

export interface RepoError {
  message: string;
  code: 'unavailable' | 'unauthorized' | 'not-found' | 'network' | 'unknown';
}

export type RepoResult<T> = { data: T | null; error: RepoError | null };

export const safeRepoError = (message: string, code: RepoError['code'] = 'unknown'): RepoError => ({
  message,
  code,
});

/**
 * Run a repository operation against Supabase. Returns a RepoResult and never
 * throws. If Supabase is unavailable, returns an `unavailable` error so the
 * caller can fall back to local/mock mode.
 */
export async function withClient<T>(
  run: (client: SupabaseClient) => Promise<T>
): Promise<{ data: T | null; error: RepoError | null }> {
  try {
    const client = await getSupabaseClient();
    if (!client) {
      return { data: null, error: safeRepoError('Backend not configured.', 'unavailable') };
    }
    const data = await run(client);
    return { data, error: null };
  } catch (err) {
    log.warn( 'health-data', 'repository error', err);
    const message = err instanceof Error ? err.message : 'Unexpected error.';
    return {
      data: null,
      error: safeRepoError(safeMessage(message), classifyError(message)),
    };
  }
}

function safeMessage(message: string): string {
  // Never expose raw DB details; surface a generic safe message.
  if (/network|fetch/i.test(message)) return 'Network error. Please try again.';
  if (/jwt|token|unauthor/i.test(message)) return 'You are not authorized to do this.';
  return 'We could not complete this action. Please try again.';
}

function classifyError(message: string): RepoError['code'] {
  if (/network|fetch/i.test(message)) return 'network';
  if (/jwt|token|unauthor|401|403/i.test(message)) return 'unauthorized';
  if (/not found|404/i.test(message)) return 'not-found';
  return 'unknown';
}

/** Generate a UUID (browser-native when available). */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

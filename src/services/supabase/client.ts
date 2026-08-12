/**
 * Supabase client (Step 9 §11 / Step 10).
 *
 * Single source of truth for the typed browser client. Created only when
 * credentials are configured AND something requests it — missing keys never
 * crash the app or add bundle weight until needed.
 *
 * SECURITY:
 * - Only the browser-safe anon key is used client-side. The service_role key
 *   must NEVER appear here (it bypasses RLS).
 * - The client respects auth state via `persistSession` so a signed-in user is
 *   restored across reloads without re-entering credentials.
 * - `autoRefreshToken` keeps sessions alive safely client-side.
 */

import { env } from '../../config';
import { log } from '../../lib/security';

import type { SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

export type Database = Record<string, never>;

let cachedClient: SupabaseClient<Database> | null = null;
let creationFailed = false;

/**
 * Lazily create and cache the typed Supabase client. Returns null when
 * credentials are missing or creation failed — callers MUST handle the null
 * case (graceful fallback to mock/local mode).
 */
export async function getSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  if (!env.supabase.configured) return null;
  if (cachedClient) return cachedClient;
  if (creationFailed) return null;

  try {
    // Dynamic import keeps @supabase/supabase-js out of the main bundle when
    // Supabase is not configured.
    const mod = await import('@supabase/supabase-js');
    const createClient = mod.createClient;
    cachedClient = createClient<Database>(env.supabase.url, env.supabase.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    log.info( 'supabase', 'client created');
    return cachedClient;
  } catch (err) {
    creationFailed = true;
    log.error( 'supabase', 'failed to create client', err);
    return null;
  }
}

/** Synchronously return the cached client if it has been created, else null. */
export function getCachedSupabaseClient(): SupabaseClient<Database> | null {
  if (!env.supabase.configured) return null;
  return cachedClient;
}

/** Whether Supabase is available right now (configured + client creatable). */
export function isSupabaseConfigured(): boolean {
  return env.supabase.configured;
}

export { env as supabaseEnv };

/**
 * CareLink-AI — profiles repository (Step 10).
 *
 * Typed repository for the authenticated user's own (non-sensitive) profile.
 *
 * Persistence model:
 * - REAL Supabase mode: reads/writes `public.profiles` scoped to
 *   `auth.uid()` (RLS enforces ownership). `updateProfile` is an upsert —
 *   when a row is missing (e.g. an auth user created before the
 *   `handle_new_user` trigger existed), it creates one safely with
 *   `id = userId` so the RLS insert policy (`with check id = auth.uid()`)
 *   is satisfied. It never bypasses RLS.

 * - DEMO/mock mode (Supabase not configured): the authenticated mock user's
 *   profile persists to localStorage under a per-user key so demo data really
 *   survives reloads. This mirrors the mock-auth persistence pattern and keeps
 *   the UI honest ("demo mode" + genuine local persistence, never fake success).
 */

import { withClient } from './repository';
import type { ProfileRow } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { restoreSession } from '../auth';

const PROFILE_STORAGE_PREFIX = 'carelink_ai_profile_';

function profileStorageKey(userId: string): string {
  return `${PROFILE_STORAGE_PREFIX}${userId}`;
}

function readLocalProfile(userId: string): ProfileRow | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(profileStorageKey(userId));
    return raw ? (JSON.parse(raw) as ProfileRow) : null;
  } catch {
    return null;
  }
}

function writeLocalProfile(userId: string, row: ProfileRow): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(profileStorageKey(userId), JSON.stringify(row));
  } catch {
    // localStorage full/unavailable — save simply won't persist; never crash
  }
}

function localProfileRow(userId: string, input: ProfileUpdateInput): ProfileRow {
  const existing = readLocalProfile(userId);
  const now = new Date().toISOString();
  return {
    id: userId,
    display_name: input.display_name ?? existing?.display_name ?? null,
    date_of_birth: input.date_of_birth ?? existing?.date_of_birth ?? null,
    gender: input.gender ?? existing?.gender ?? null,
    location_preference: input.location_preference ?? existing?.location_preference ?? null,
    language_preference: input.language_preference ?? existing?.language_preference ?? 'en',
    emergency_contact_name: input.emergency_contact_name ?? existing?.emergency_contact_name ?? null,
    emergency_contact_phone: input.emergency_contact_phone ?? existing?.emergency_contact_phone ?? null,
    communication_preferences: input.communication_preferences ?? existing?.communication_preferences ?? null,
    avatar_url: input.avatar_url ?? existing?.avatar_url ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

export async function getProfile(): Promise<ProfileRow | null> {
  const client = await getSupabaseClient();
  if (client) {
    const { data } = await withClient(async () => {
      const res = await client.from('profiles').select('*').maybeSingle();
      if (res.error) throw res.error;
      return (res.data as ProfileRow | null) ?? null;
    });
    return data;
  }
  // Supabase unavailable — fall back to the demo/local profile for the mock user.id

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return null;
  return readLocalProfile(userId);
}

export interface ProfileUpdateInput {
  display_name?: string | null;
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  location_preference?: string | null;
  language_preference?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  communication_preferences?: Record<string, unknown> | null;
  avatar_url?: string | null;
}

/**
 * Create the authenticated user's profile row when it does not exist yet.
 * RLS-compliant: inserts with `id = auth.uid()` (profiles_self_insert).
 */
export async function createProfile(input: ProfileUpdateInput): Promise<ProfileRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('profiles')
      .insert({
        id: userId,
        display_name: input.display_name ?? null,
        date_of_birth: input.date_of_birth ?? null,
        gender: input.gender ?? null,
        location_preference: input.location_preference ?? null,
        language_preference: input.language_preference ?? 'en',
        emergency_contact_name: input.emergency_contact_name ?? null,
        emergency_contact_phone: input.emergency_contact_phone ?? null,
        communication_preferences: input.communication_preferences ?? null,
        avatar_url: input.avatar_url ?? null,
      })
      .select('*')
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data as ProfileRow | null) ?? null;
  });
  return data;
}

export async function updateProfile(input: ProfileUpdateInput): Promise<ProfileRow | null> {
  const client = await getSupabaseClient();
  if (client) {
    const { data } = await withClient(async (client: SupabaseClient) => {
      const { data: authData } = await client.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('unauthorized');
      // Upsert: update the owner's row; create it when missing so pre-existing
      // auth users (no trigger-created row) can still save their profile. RLS-compliant

      const res = await client
        .from('profiles')
        .update(input)
        .eq('id', userId)
        .select('*')
        .maybeSingle();
      if (res.error) throw res.error;
      if (res.data) return res.data as ProfileRow;

      // Row missing → insert with id = userId (allowed by profiles_self_insert,
      // which uses `with check (id = auth.uid())`).
      const created = await client
        .from('profiles')
        .insert({
          id: userId,
          display_name: input.display_name ?? null,
          date_of_birth: input.date_of_birth ?? null,
          gender: input.gender ?? null,
          location_preference: input.location_preference ?? null,
          language_preference: input.language_preference ?? 'en',
          emergency_contact_name: input.emergency_contact_name ?? null,
          emergency_contact_phone: input.emergency_contact_phone ?? null,
          communication_preferences: input.communication_preferences ?? null,
          avatar_url: input.avatar_url ?? null,
        })
        .select('*')
        .maybeSingle();
      if (created.error) throw created.error;
      return (created.data as ProfileRow | null) ?? null;
    });
    return data;
  }
  // Supabase unavailable — persist the profile locally under the mock user id so
  // demo mode genuinely persists across reloads (mirrors mock-auth storage)

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return null;
  const row = localProfileRow(userId, input);
  writeLocalProfile(userId, row);
  return row;
}
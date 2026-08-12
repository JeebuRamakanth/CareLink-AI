/**
 * CareLink-AI — profiles repository (Step 10).
 *
 * Typed repository for the authenticated user's own (non-sensitive) profile.
 * Returns null/empty when Supabase is unavailable — callers fall back to
 * session-derived display info.
 */

import { withClient } from './repository';
import type { ProfileRow } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getProfile(): Promise<ProfileRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('profiles').select('*').maybeSingle();
    if (res.error) throw res.error;
    return (res.data as ProfileRow | null) ?? null;
  });
  return data;
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

export async function updateProfile(input: ProfileUpdateInput): Promise<ProfileRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('profiles')
      .update(input)
      .eq('id', userId)
      .select('*')
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data as ProfileRow | null;
  });
  return data;
}

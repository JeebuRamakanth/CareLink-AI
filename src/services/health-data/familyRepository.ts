/**
 * CareLink-AI — family profiles repository (Step 10).
 *
 * Self / child / elder / family-member patient contexts. RLS scopes rows to
 * owner_id = auth.uid() automatically, so a user can never read another user's
 * family members.
 */

import { withClient, generateId } from './repository';
import type { FamilyProfileRow, FamilyRelation } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listFamilyProfiles(): Promise<FamilyProfileRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('family_profiles').select('*').order('created_at', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as FamilyProfileRow[]) ?? [];
  });
  return data ?? [];
}

export interface FamilyProfileInput {
  relation: FamilyRelation;
  label: string;
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  context_summary?: string | null;
  context_tags?: string[];
}

export async function createFamilyProfile(input: FamilyProfileInput): Promise<FamilyProfileRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('family_profiles')
      .insert({
        id: generateId(),
        owner_id: userId,
        relation: input.relation,
        label: input.label,
        date_of_birth: input.date_of_birth ?? null,
        gender: input.gender ?? null,
        context_summary: input.context_summary ?? null,
        context_tags: input.context_tags ?? [],
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as FamilyProfileRow;
  });
  return data;
}

export async function updateFamilyProfile(
  id: string,
  patch: Partial<FamilyProfileInput>
): Promise<FamilyProfileRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('family_profiles').update(patch).eq('id', id).select('*').single();
    if (res.error) throw res.error;
    return res.data as FamilyProfileRow;
  });
  return data;
}

export async function deleteFamilyProfile(id: string): Promise<boolean> {
  const { error } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('family_profiles').delete().eq('id', id);
    if (res.error) throw res.error;
    return true;
  });
  return !error;
}

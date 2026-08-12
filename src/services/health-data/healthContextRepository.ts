/**
 * CareLink-AI — health context repository (Step 10).
 *
 * The agent reads ONLY the minimum authorized health context required for a
 * request — never every stored medical record. This repository exposes scoped
 * reads (by family profile) so the agent stays within patient context.
 */

import { withClient, generateId } from './repository';
import type { HealthContextRow } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getHealthContext(familyProfileId?: string | null): Promise<HealthContextRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    let query = client.from('health_context').select('*');
    if (familyProfileId) {
      query = query.eq('family_profile_id', familyProfileId);
    }
    const res = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (res.error) throw res.error;
    return (res.data as HealthContextRow | null) ?? null;
  });
  return data;
}

export interface HealthContextInput {
  family_profile_id?: string | null;
  active_symptoms?: string[];
  chronic_conditions?: string[];
  allergies?: string[];
  current_medications?: string[];
  notes?: string | null;
}

export async function upsertHealthContext(input: HealthContextInput): Promise<HealthContextRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');

    // Find existing context for this family profile.
    let existingId: string | null = null;
    if (input.family_profile_id) {
      const found = await client
        .from('health_context')
        .select('id')
        .eq('family_profile_id', input.family_profile_id)
        .maybeSingle();
      existingId = (found.data as { id: string } | null)?.id ?? null;
    }

    if (existingId) {
      const res = await client
        .from('health_context')
        .update({
          active_symptoms: input.active_symptoms ?? [],
          chronic_conditions: input.chronic_conditions ?? [],
          allergies: input.allergies ?? [],
          current_medications: input.current_medications ?? [],
          notes: input.notes ?? null,
        })
        .eq('id', existingId)
        .select('*')
        .single();
      if (res.error) throw res.error;
      return res.data as HealthContextRow;
    }

    const res = await client
      .from('health_context')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        active_symptoms: input.active_symptoms ?? [],
        chronic_conditions: input.chronic_conditions ?? [],
        allergies: input.allergies ?? [],
        current_medications: input.current_medications ?? [],
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as HealthContextRow;
  });
  return data;
}

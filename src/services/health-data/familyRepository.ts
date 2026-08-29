/**
 * CareLink-AI - family profiles repository (Step 10).
 *
 * Self / child / elder / family-member patient contexts. RLS scopes rows to
 * owner_id = auth.uid() automatically, so a user can never read another user's
 * family members. In DEMO/mock mode (Supabase not configured), family rows
 * persist to localStorage under a per-user key (mirrors mock-auth + profile
 * fallback) so the family-member UX remains fully exercisable without a backend.
 * REAL mode is untouched - all RLS operations stay RLS-compliant.
 */

import { withClient, generateId } from './repository';
import type { FamilyProfileRow, FamilyRelation } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { restoreSession } from '../auth';

const FAMILY_STORAGE_PREFIX = 'carelink_ai_family_';

function familyStorageKey(userId: string): string {
  return `${FAMILY_STORAGE_PREFIX}${userId}`;
}

function readLocalFamily(userId: string): FamilyProfileRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(familyStorageKey(userId));
    return raw ? (JSON.parse(raw) as FamilyProfileRow[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFamily(userId: string, rows: FamilyProfileRow[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(familyStorageKey(userId), JSON.stringify(rows));
  } catch {
    // localStorage full/unavailable - save simply won't persist; never crash.
  }
}

export async function listFamilyProfiles(): Promise<FamilyProfileRow[]> {
  const client = await getSupabaseClient();
  if (client) {
    const { data } = await withClient(async (client: SupabaseClient) => {
      const res = await client.from('family_profiles').select('*').order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return (res.data as FamilyProfileRow[]) ?? [];
    });
    return data ?? [];
  }
  // Supabase unavailable - fall back to the demo/local family rows for the mock user.id

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return [];
  return readLocalFamily(userId);
}

export interface FamilyProfileInput {
  relation: FamilyRelation;
  label: string;
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  context_summary?: string | null;
  context_tags?: string[];
}

function toFamilyRow(input: FamilyProfileInput, userId: string, id: string): FamilyProfileRow {
  const now = new Date().toISOString();
  return {
    id,
    owner_id: userId,
    relation: input.relation,
    label: input.label,
    date_of_birth: input.date_of_birth ?? null,
    gender: input.gender ?? null,
    context_summary: input.context_summary ?? null,
    context_tags: input.context_tags ?? [],
    created_at: now,
    updated_at: now,
  };
}

export async function createFamilyProfile(input: FamilyProfileInput): Promise<FamilyProfileRow | null> {
  const client = await getSupabaseClient();
  if (client) {
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
  // Supabase unavailable - persist the family member locally for the mock user.id

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return null;
  const id = generateId();
  const row = toFamilyRow(input, userId, id);
  const rows = readLocalFamily(userId);
  writeLocalFamily(userId, [row, ...rows]);
  return row;
}

export async function updateFamilyProfile(
  id: string,
  patch: Partial<FamilyProfileInput>
): Promise<FamilyProfileRow | null> {
  const client = await getSupabaseClient();
  if (client) {
    const { data } = await withClient(async (client: SupabaseClient) => {
      const res = await client.from('family_profiles').update(patch).eq('id', id).select('*').single();
      if (res.error) throw res.error;
      return res.data as FamilyProfileRow;
    });
    return data;
  }
  // Supabase unavailable - update the local row for the mock user.id

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return null;
  const rows = readLocalFamily(userId);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next: FamilyProfileRow = {
    ...rows[idx],
    relation: patch.relation ?? rows[idx].relation,
    label: patch.label ?? rows[idx].label,
    date_of_birth: patch.date_of_birth !== undefined ? patch.date_of_birth : rows[idx].date_of_birth,
    gender: patch.gender !== undefined ? patch.gender : rows[idx].gender,
    context_summary: patch.context_summary !== undefined ? patch.context_summary : rows[idx].context_summary,
    context_tags: patch.context_tags ?? rows[idx].context_tags,
    updated_at: new Date().toISOString(),
  };
  rows[idx] = next;
  writeLocalFamily(userId, rows);
  return next;
}

export async function deleteFamilyProfile(id: string): Promise<boolean> {
  const client = await getSupabaseClient();
  if (client) {
    const { error } = await withClient(async (client: SupabaseClient) => {
      const res = await client.from('family_profiles').delete().eq('id', id);
      if (res.error) throw res.error;
      return true;
    });
    return !error;
  }
  // Supabase unavailable - deleteethe local row for the mock user.id

  const session = await restoreSession();
  const userId = session.user?.id;
  if (!userId) return false;
  const rows = readLocalFamily(userId);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeLocalFamily(userId, rows);
  return true;
}

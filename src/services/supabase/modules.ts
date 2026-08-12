/**
 * Supabase future-ready modules (Step 9 §11).
 *
 * Skeletons for the tables the app will eventually use. They are NOT wired into
 * the running app yet — the existing mock/localStorage flows remain the source
 * of truth until a migration is explicitly requested. Each module returns null
 * when Supabase is unavailable so callers fall back gracefully.
 *
 * No mock data is migrated here.
 */

import { getSupabaseClient } from './client';

type SupabaseRecord = Record<string, unknown>;

/** auth: future sign-in / sign-out / session retrieval. */
export async function supabaseAuth() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return (client as { auth: unknown }).auth;
}

/** profiles: future user profile CRUD. */
export async function supabaseProfiles() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('profiles') };
}

/** family_members: future family profile CRUD. */
export async function supabaseFamilyMembers() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('family_members') };
}

/** appointments: future appointment persistence. */
export async function supabaseAppointments() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('appointments') };
}

/** conversations: future agent conversation history. */
export async function supabaseConversations() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('conversations') };
}

/** health_documents: future uploaded document metadata. */
export async function supabaseHealthDocuments() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('health_documents') };
}

/** agent_history: future agent result history. */
export async function supabaseAgentHistory() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('agent_history') };
}

/** recovery_tracking: future recovery check-ins. */
export async function supabaseRecoveryTracking() {
  const client = await getSupabaseClient();
  if (!client) return null;
  return { from: () => (client as { from: (t: string) => unknown }).from('recovery_tracking') };
}

export type { SupabaseRecord };

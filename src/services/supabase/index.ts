/**
 * Supabase foundation barrel (Step 9 §11).
 *
 * Import Supabase utilities from here. Nothing is auto-initialized; consumers
 * call getSupabaseClient()/isSupabaseConfigured() and handle the null case.
 */

export { getSupabaseClient, isSupabaseConfigured } from './client';
export {
  supabaseAuth,
  supabaseProfiles,
  supabaseFamilyMembers,
  supabaseAppointments,
  supabaseConversations,
  supabaseHealthDocuments,
  supabaseAgentHistory,
  supabaseRecoveryTracking,
} from './modules';

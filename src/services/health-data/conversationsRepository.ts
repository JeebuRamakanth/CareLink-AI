/**
 * CareLink-AI — conversations repository (Step 10).
 *
 * Persists agent conversation memory to Supabase with RLS-scoped ownership.
 * Returns null/empty when Supabase is unavailable, so the existing
 * localStorage-backed AgentContext continues to work as fallback.
 *
 * Only the minimum required context is persisted: messages, intent, actions,
 * attachments metadata, result metadata. Free-text PHI is stored only where
 * the user explicitly provided it in conversation — never auto-scraped from
 * documents.
 */

import { withClient, generateId } from './repository';
import type { ConversationMessageRow, ConversationRow } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listConversations(): Promise<ConversationRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('conversations').select('*').order('updated_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as ConversationRow[]) ?? [];
  });
  return data ?? [];
}

export interface ConversationInput {
  title: string;
  language?: string;
  family_profile_id?: string | null;
  intent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createConversation(input: ConversationInput): Promise<ConversationRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('conversations')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        title: input.title,
        language: input.language ?? 'en',
        intent: input.intent ?? null,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as ConversationRow;
  });
  return data;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await withClient(async (client: SupabaseClient) => {
    const res = await client.from('conversations').update({ title }).eq('id', id);
    if (res.error) throw res.error;
    return true;
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await withClient(async (client: SupabaseClient) => {
    const res = await client.from('conversations').delete().eq('id', id);
    if (res.error) throw res.error;
    return true;
  });
}

export interface ConversationMessageInput {
  conversation_id: string;
  role: 'user' | 'assistant';
  content?: string | null;
  response?: unknown;
  attachments?: unknown[];
  context_tags?: string[];
  patient_profile_id?: string | null;
  intent?: string | null;
  actions?: unknown[];
}

export async function addMessage(input: ConversationMessageInput): Promise<ConversationMessageRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('conversation_messages')
      .insert({
        id: generateId(),
        conversation_id: input.conversation_id,
        owner_id: userId,
        role: input.role,
        content: input.content ?? null,
        response: input.response ?? null,
        attachments: input.attachments ?? [],
        context_tags: input.context_tags ?? [],
        patient_profile_id: input.patient_profile_id ?? null,
        intent: input.intent ?? null,
        actions: input.actions ?? [],
      })
      .select('*')
      .single();
    if (res.error) throw res.error;

    // Bump conversation updated_at.
    await client.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', input.conversation_id);

    return res.data as ConversationMessageRow;
  });
  return data;
}

export async function listMessages(conversationId: string): Promise<ConversationMessageRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as ConversationMessageRow[]) ?? [];
  });
  return data ?? [];
}

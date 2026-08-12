/**
 * CareLink-AI — medical documents metadata repository (Step 10).
 *
 * Stores file metadata in the `medical_documents` table. The binary object is
 * uploaded separately via the storage boundary (supabaseStorage.ts). The public
 * URL is NEVER stored here — access is via signed URLs only.
 *
 * Returns null/empty when Supabase is unavailable; callers keep using the
 * existing local-preview attachment flow.
 */

import { withClient, generateId } from './repository';
import type { MedicalDocumentRow, DocumentKind, DocumentUploadStatus, DocumentProcessingStatus } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listDocuments(): Promise<MedicalDocumentRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('medical_documents').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as MedicalDocumentRow[]) ?? [];
  });
  return data ?? [];
}

export interface DocumentMetadataInput {
  family_profile_id?: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_bucket?: string;
  storage_path: string;
  document_kind?: DocumentKind | null;
  upload_status?: DocumentUploadStatus;
  processing_status?: DocumentProcessingStatus;
  extracted_text_placeholder?: string | null;
  provider_metadata?: Record<string, unknown> | null;
}

export async function createDocument(
  input: DocumentMetadataInput
): Promise<MedicalDocumentRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('medical_documents')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        file_name: input.file_name,
        mime_type: input.mime_type,
        file_size: input.file_size,
        storage_bucket: input.storage_bucket ?? 'medical_documents',
        storage_path: input.storage_path,
        document_kind: input.document_kind ?? null,
        upload_status: input.upload_status ?? 'pending',
        processing_status: input.processing_status ?? 'queued',
        extracted_text_placeholder: input.extracted_text_placeholder ?? null,
        provider_metadata: input.provider_metadata ?? {},
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as MedicalDocumentRow;
  });
  return data;
}

export async function updateDocumentStatus(
  id: string,
  patch: { upload_status?: DocumentUploadStatus; processing_status?: DocumentProcessingStatus; extracted_text_placeholder?: string | null }
): Promise<MedicalDocumentRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('medical_documents').update(patch).eq('id', id).select('*').maybeSingle();
    if (res.error) throw res.error;
    return res.data as MedicalDocumentRow | null;
  });
  return data;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const { error } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('medical_documents').delete().eq('id', id);
    if (res.error) throw res.error;
    return true;
  });
  return !error;
}

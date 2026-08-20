/**
 * CareLink-AI — Supabase storage boundary (Step 10).
 *
 * Private medical file storage. Files live in the private `medical_documents`
 * bucket under `<owner_id>/<document_id>/<filename>` so RLS (see migration
 * 0002) scopes object access to the owning user.
 *
 * SECURITY:
 * - Public URLs are NEVER created for medical files.
 * - Access is via short-lived signed URLs only.
 * - File metadata lives in the `medical_documents` table, separate from the
 *   binary object.
 *
 * Returns null/empty when Supabase is unavailable — callers keep using the
 * existing local-preview (object URL) flow.
 */

import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';
import { log } from '../../lib/security';
import type { SupabaseClient } from '@supabase/supabase-js';

const MEDICAL_BUCKET = 'medical_documents';

export interface UploadResult {
  path: string;
  bucket: string;
}

export interface StoredFile {
  path: string;
  bucket: string;
  /** A short-lived signed URL, or null in local-dev/mock mode. */
  signedUrl: string | null;
}

/**
 * Reduce a user filename's extension to a short alphanumeric token so a
 * crafted filename can never inject path separators or extra segments into
 * the storage path (defense in depth under the owner-scoped RLS prefix).
 */
const STORAGE_EXT_ALLOWLIST = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx']);

export function safeStorageExtension(fileName: string | undefined): string {
  if (!fileName || !fileName.includes('.')) return 'bin';
  const rawExt = (fileName.split('.').pop() ?? '').toLowerCase();
  // Allowlist-only: a crafted filename can never inject separators or smuggle
  // an executable extension into the storage path.
  return STORAGE_EXT_ALLOWLIST.has(rawExt) ? rawExt : 'bin';
}

/**
 * Upload a medical file privately. The path is namespaced by the owner id so
 * RLS can authorize it. Never returns a public URL.
 */
export async function uploadMedicalFile(
  file: File | Blob,
  ownerId: string,
  documentId: string
): Promise<UploadResult | null> {
  if (!isSupabaseConfigured()) return null;
  const client = await getSupabaseClient();
  if (!client) return null;

  const ext = safeStorageExtension(file instanceof File ? file.name : undefined);
  const path = `${ownerId}/${documentId}/${documentId}.${ext}`;
  try {
    const { error } = await client.storage.from(MEDICAL_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (error) throw error;
    return { path, bucket: MEDICAL_BUCKET };
  } catch (err) {
    log.warn( 'storage', 'upload failed', err);
    return null;
  }
}

/**
 * Create a short-lived signed URL for a stored medical file. Returns null in
 * local-dev/mock mode (the caller keeps using the local object URL preview).
 */
export async function createSignedUrl(
  path: string,
  expiresInSec = 60
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const client = await getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.storage.from(MEDICAL_BUCKET).createSignedUrl(path, expiresInSec);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (err) {
    log.warn( 'storage', 'signed url failed', err);
    return null;
  }
}

/** Remove a stored medical file. */
export async function removeMedicalFile(path: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const client = await getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.storage.from(MEDICAL_BUCKET).remove([path]);
    if (error) throw error;
    return true;
  } catch (err) {
    log.warn( 'storage', 'remove failed', err);
    return false;
  }
}

/** Convenience: upload + return a StoredFile (with signed url if available). */
export async function storeMedicalFile(
  file: File,
  ownerId: string,
  documentId: string
): Promise<StoredFile | null> {
  const uploaded = await uploadMedicalFile(file, ownerId, documentId);
  if (!uploaded) return null;
  const signedUrl = await createSignedUrl(uploaded.path);
  return { path: uploaded.path, bucket: uploaded.bucket, signedUrl };
}

export type { SupabaseClient };

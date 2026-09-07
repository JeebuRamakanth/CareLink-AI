/**
 * CareLink-AI  Step 11 secure storage boundary.
 *
 * Single surface for medical-file binary storage. Wraps the existing Step 9
 * Cloudinary unsigned-upload boundary AND the Step 10 private Supabase storage
 * boundary, choosing REAL vs MOCK transparently. UI components never call
 * storage APIs directly  they go through this service.
 *
 * SECURITY (Step 11):
 * - Cloudinary: unsigned upload preset ONLY. The API secret / admin API never
 *   reach the browser. Unsigned upload is a transport boundary, NOT complete
 *   medical-data security  that's why we ALSO persist private metadata in
 *   Supabase (RLS-scoped) and keep binaries owner-scoped.
 * - Supabase: private bucket, signed URLs only, never public URLs.
 * - Mock/local: returns a blob URL so the pipeline is exercisable without any
 *   credentials. Mock output is always tagged so it can never be mistaken for a
 *   real stored asset.
 * - Filenames are sanitized before upload (see fileValidation); the user
 *   filename is never used as a public id.
 * - The returned `url` from Cloudinary is a delivery URL treated as a storage
 *   reference (stored in metadata), but the agent NEVER embeds medical content
 *   in URL params and never logs the URL.
 */

import { env } from '../../../config';
import { log } from '../../../lib/security';
import { mockStorageProvider } from '../../health-agent/services/adapters/mockAdapters';
import {
  uploadMedicalFile,
  createSignedUrl,
  removeMedicalFile,
} from '../../../services/storage/supabaseStorage';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import { isSafeMagicKind, sniffFileMagic } from '../../../services/media/magicBytes';
import { optimizeImageForUpload } from '../../../services/media/imageOptimizer';

export interface DocumentStorageUploadInput {
  file: File;
  ownerId: string;
  documentId: string;
  publicIdSlug: string;
  folder: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface DocumentStorageResult {
  /** Storage bucket name. */
  bucket: string;
  /** Owner-scoped storage path / reference (never a public medical URL). */
  reference: string;
  /** Short-lived preview URL (local object URL in mock, signed URL if Supabase). */
  previewUrl: string | null;
  /** Where the binary lives. */
  source: 'cloudinary' | 'supabase' | 'local';
  /** Provider metadata (public id, version, format). No secrets. */
  providerMetadata: Record<string, string>;
}

export type StorageAvailability = 'real' | 'mock' | 'unavailable';

/** Whether a real Cloudinary backend is configured. */
export function isCloudinaryConfigured(): boolean {
  return env.cloudinary.configured;
}

/** Whether private Supabase storage is configured. */
export function isPrivateStorageConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * The active storage mode for MEDICAL DOCUMENTS. Private Supabase storage is
 * the ONLY real path (Step 17 §18 — PHI never goes to public Cloudinary).
 * Cloudinary is reserved for non-sensitive media and does NOT count as a real
 * medical-document backend. When only Cloudinary is configured, medical
 * uploads fail honestly (unavailable).
 */
export function getStorageMode(): StorageAvailability {
  if (isSupabaseConfigured()) return 'real';
  if (env.cloudinary.configured) return 'unavailable';
  return 'mock';
}

/** A human label for the demo/real badge. */
export function storageModeLabel(): string {
  const mode = getStorageMode();
  if (mode === 'real') return 'Supabase Storage';
  if (mode === 'unavailable') return 'Private storage unavailable';
  return 'Local (demo)';
}

	/**
	 * Upload a medical/health document binary. Private Supabase storage (signed
	 * URLs, owner-scoped paths) is the ONLY real path — public Cloudinary is
	 * never used for PHI. Without private storage the upload fails honestly.
	 * In demo mode (nothing configured) a clearly-tagged local blob URL is used.
	 * Never throws; returns a safe error result so the pipeline can mark `failed`.
	 */
export async function uploadDocumentToStorage(
  input: DocumentStorageUploadInput
): Promise<{ ok: true; result: DocumentStorageResult } | { ok: false; error: string }> {
  const { file: rawFile, ownerId, documentId, publicIdSlug, signal, onProgress } = input;
  void publicIdSlug; // kept for interface symmetry; uploads reference owner/path only.
  // Single storage-boundary function. Every return is explicit; never throws.
  // 1) Validate the file  magic bytes first (never trust client MIME io).
  onProgress?.(5);
  const magic = await sniffFileMagic(rawFile);
  if (!isSafeMagicKind(magic)) {
    return { ok: false, error: "We could not accept this file. The content type could not be verified safely. Please upload a JPG, PNG, WEBP, or PDF file." };
  }

  // 2) Optimize raster images (decode → resize → re-encode → measured byte
  // size; only keep the result when it is genuinely smaller). A gentler
  // document pass preserves medical legibility. The optimized bytes are what
  // get stored in PRIVATE storage.
  let file = rawFile;
  const docLike = /\.(pdf|docx?)$/i.test(file.name) || file.type === 'application/pdf';
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    const optimizedResult = await optimizeImageForUpload(file, {
      targetKind: docLike ? 'document' : rawFile.size > 1_500_000 ? 'document' : 'avatar',
    });
    file = optimizedResult.file;
  }

  // 3) SECURITY (Step 17 §18): MEDICAL DOCUMENT binary storage MUST use the
  //    PRIVATE Supabase bucket (owner-scoped paths + signed URLs only). Public
  //    Cloudinary storage is reserved for non-sensitive media (e.g. provider
  //    avatars) and is NEVER used for PHI/medical documents. When private
  //    storage is unavailable, the upload fails honestly rather than placing
  //    PHI into a public bucket.
  if (isSupabaseConfigured()) {
    try {
      onProgress?.(10);
      const uploaded = await uploadMedicalFile(file, ownerId, documentId);
      if (!uploaded) {
        return { ok: false, error: 'We could not store this file. Please try again.' };
      }
      onProgress?.(80);
      const signedUrl = await createSignedUrl(uploaded.path);
      onProgress?.(100);
      return {
        ok: true,
        result: {
          bucket: uploaded.bucket,
          reference: uploaded.path,
          previewUrl: signedUrl,
          source: 'supabase',
          providerMetadata: { source: 'supabase', bucket: uploaded.bucket },
        },
      };
    } catch (err) {
      log.warn('documents-storage', 'private supabase upload failed', err);
      return { ok: false, error: safeUploadError(err) };
    }
  }

  // 4) Cloudinary is intentionally NOT a path for medical/health documents
  //    (Step 17 §18: "Do NOT place PHI/medical documents into public Cloudinary
  //    storage"). This pipeline handles ONLY medical documents, so when private
  //    Supabase storage is unavailable we FAIL HONESTLY instead of placing PHI
  //    into a public bucket. Non-sensitive media (provider avatars etc.) flows
  //    through the separate non-PHI provider-media path.
  if (env.cloudinary.configured) {
    log.warn(
      'documents-storage',
      'medical document rejected from public Cloudinary — private Supabase storage is required for PHI'
    );
    return {
      ok: false,
      error:
        'Secure file storage is not configured. Medical documents require private encrypted storage and cannot be stored on public media services.',
    };
  }

  // 5) Local mock — blob URL preview only. Clearly tagged as mock.
  try {
    onProgress?.(20);
    const res = await mockStorageProvider.upload(file, { signal });
    onProgress?.(100);
    return {
      ok: true,
      result: {
        bucket: 'local',
        reference: `local/${ownerId}/${documentId}/${publicIdSlug}`,
        previewUrl: res.previewUrl ?? res.url,
        source: 'local',
        providerMetadata: { source: 'mock', mock: 'true' },
      },
    };
  } catch (err) {
    log.warn('documents-storage', 'local mock upload failed', err);
    return { ok: false, error: safeUploadError(err) };
  }
}

/** Remove a stored medical file from the active backend. Best-effort + safe. */
export async function deleteDocumentFromStorage(
  reference: string,
  source: 'cloudinary' | 'supabase' | 'local'
): Promise<boolean> {
  try {
    if (source === 'supabase') {
      return await removeMedicalFile(reference);
    }
    // Cloudinary signed/admin deletion is a privileged, server-bound operation.
    // The browser cannot safely delete Cloudinary assets without a secret  so
    // we leave binary cleanup to the server boundary. Metadata is still removed.
    if (source === 'cloudinary') {
      log.info('documents-storage', 'cloudinary binary deletion is server-bound; metadata removed only');
      return true;
    }
    // Local mock: nothing to revoke beyond the object URL (handled by caller).
    return true;
  } catch (err) {
    log.warn('documents-storage', 'delete failed', err);
    return false;
  }
}

/** Build the storage folder namespace (owner-scoped) for Cloudinary. */
export function documentFolder(ownerId: string, familyProfileId: string | null): string {
  const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFamily = (familyProfileId ?? 'self').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `carelink/${safeOwner}/${safeFamily}`;
}

function safeUploadError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Upload cancelled.';
  if (err instanceof Error && /network|fetch/i.test(err.message)) return 'Network error during upload. Please try again.';
  return 'We could not upload this file. Please try again.';
}

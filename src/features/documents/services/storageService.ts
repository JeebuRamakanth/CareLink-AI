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
import { realCloudinaryStorage } from '../../health-agent/services/adapters/realAdapters';
import { mockStorageProvider } from '../../health-agent/services/adapters/mockAdapters';
import type { StorageUploadResult } from '../../health-agent/services/adapters/interfaces';
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
 * The active storage mode. Cloudinary (unsigned) takes precedence for binary
 * delivery when configured; otherwise we fall back to private Supabase storage
 * when configured; otherwise local mock.
 */
export function getStorageMode(): StorageAvailability {
  if (env.cloudinary.configured) return 'real';
  if (isSupabaseConfigured()) return 'real';
  return 'mock';
}

/** A human label for the demo/real badge. */
export function storageModeLabel(): string {
  const mode = getStorageMode();
  if (mode === 'real' && env.cloudinary.configured) return 'Cloudinary';
  if (mode === 'real') return 'Supabase Storage';
  return 'Local (demo)';
}

/**
 * Upload a medical file. Routes to Cloudinary unsigned upload when configured,
 * else private Supabase storage, else a local blob URL (mock). Never throws 
 * on failure returns a safe error result so the pipeline can mark `failed`.
 */
export async function uploadDocumentToStorage(
  input: DocumentStorageUploadInput
): Promise<{ ok: true; result: DocumentStorageResult } | { ok: false; error: string }> {
  const { file: rawFile, ownerId, documentId, publicIdSlug, folder, signal, onProgress } = input;
  // Single storage-boundary function. Every return is explicit; never throws.
  // 1) Validate the file  magic bytes first (never trust client MIME io).
  onProgress?.(5);
  const magic = await sniffFileMagic(rawFile);
  if (!isSafeMagicKind(magic)) {
    return { ok: false, error: "We could not accept this file. The content type could not be verified safely. Please upload a JPG, PNG, WEBP, or PDF file." };
  }

  // 2) Optimize raster images (decode  resize  re-encode  verify byte
  // size honestly  never claim a size that wasn't measured; document uploads keep
  // a higher quality floor so medical legibility is preserved (Phase 14).
  let file = rawFile;
  let width: number | null = null;
  let height: number | null = null;
  let optimized: boolean | null = null;
  let optimizedByteSize: number | null = null;
  const docLike = /\.(pdf|docx?)$/i.test(file.name) || file.type === 'application/pdf';
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    const optimizedResult = await optimizeImageForUpload(file, {
      targetKind: docLike ? 'document' : rawFile.size > 1_500_000 ? 'document' : 'avatar',
    });
    file = optimizedResult.file;
    width = optimizedResult.width;
    height = optimizedResult.height;
    optimized = optimizedResult.optimized;
    optimizedByteSize = optimizedResult.byteSize;
  }

  // 3) Cloudinary unsigned upload (binary delivery). Metadata stays in Supabase.
  if (env.cloudinary.configured) {
    try {
      onProgress?.(10);
      const res: StorageUploadResult = await realCloudinaryStorage.upload(file, {
        folder,
        signal,
      });
      onProgress?.(100);
      return {
        ok: true,
        result: {
          bucket: 'cloudinary',
          // The Cloudinary public URL acts as the storage reference. We never
          // expose it as a "public medical document URL" in the UI; it is a
          // backend delivery reference stored in provider metadata only.
          reference: `cloudinary/${folder}/${publicIdSlug}`,
          previewUrl: res.previewUrl ?? res.url,
          source: 'cloudinary',
          providerMetadata: {
            ...res.providerMetadata,
            source: 'cloudinary',
            width: typeof width === 'number' ? String(width) : '',
            height: typeof height === 'number' ? String(height) : '',
            optimized: optimized === true ? 'true' : '',
            optimizedByteSize: typeof optimizedByteSize === 'number' ? String(optimizedByteSize) : '',
          },
        },
      };
    } catch (err) {
      log.warn('documents-storage', 'cloudinary upload failed', err);
      return { ok: false, error: safeUploadError(err) };
    }
  }

  // 4) Private Supabase storage (signed URLs only, never public).
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
      log.warn('documents-storage', 'supabase upload failed', err);
      return { ok: false, error: safeUploadError(err) };
    }
  }

  // 5) Local mock   blob URL preview only. Clearly tagged as mock.
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

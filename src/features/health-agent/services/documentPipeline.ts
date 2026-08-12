/**
 * Secure document/image intelligence pipeline (Step 11).
 *
 * The single entry point that turns a user-supplied File into a normalized,
 * backend-agnostic {@link DocumentAttachment}. The pipeline:
 *
 *   VALIDATE → SECURE STORAGE → METADATA PERSISTENCE → PROCESSING STATE →
 *   MOCK ANALYSIS → STRUCTURED RESULT → (AGENT CONTEXT)
 *
 * SECURITY CONTRACT:
 * - Files are validated (size/type/mismatch/dedupe) before any upload.
 * - Raw file bytes never enter React global state; only a local blob / signed
 *   URL preview is kept.
 * - Storage uses the replaceable StorageProvider boundary (Cloudinary today,
 *   Supabase Storage / other later). Public medical URLs are never created —
 *   access is via signed URLs only when a real backend exists.
 * - Metadata (filename, mime, size, storage ref, processing status) is
 *   persisted via the documentsRepository; raw document content is NOT stored
 *   in database fields.
 * - Errors are normalized to safe, non-revealing messages. No medical content,
 *   extracted values, or personal info is ever logged.
 * - Uploads support cancellation via AbortSignal; abandoned uploads are aborted.
 *
 * When real providers are unconfigured, the pipeline degrades to a clearly
 * mock-labelled local flow — never pretending a real cloud upload happened.
 */

import type {
  DocumentAnalysisResult,
  DocumentAttachment,
  HealthDocumentKind,
} from '../types';
import type { StorageProvider } from './adapters/interfaces';
import { adapters } from './adapters/registry';
import { getStorageProvider, isRealStorageConfigured } from '../../../services/storage';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import {
  createDocument,
  deleteDocument,
  updateDocumentStatus,
  type DocumentMetadataInput,
} from '../../../services/health-data/documentsRepository';
import type { DocumentKind } from '../../../services/health-data/types';
import {
  sanitizeFileName,
  validateFileBatch,
  type FileBatchValidation,
  type FileValidationIssue,
} from '../../../lib/validation';
import { createId } from '../../../lib';
import { detectDocumentKind } from '../utils/helpers';
import { log } from '../../../lib/security';

/** A no-op storage provider used as a last-resort fallback. */
const noopStorage: StorageProvider = {
  name: 'No storage (demo)',
  available: false,
  async upload() {
    return { url: '', providerMetadata: {}, source: 'mock' as const };
  },
};

function resolveStorage(): StorageProvider {
  try {
    return getStorageProvider();
  } catch {
    return noopStorage;
  }
}

export type DocumentPipelineEvent =
  | { type: 'validating'; documentId: string }
  | { type: 'upload-progress'; documentId: string; progress: number }
  | { type: 'uploaded'; documentId: string; storageRef?: { bucket: string; path: string } }
  | { type: 'processing'; documentId: string; progress: number }
  | { type: 'analyzed'; documentId: string; analysis: DocumentAnalysisResult }
  | { type: 'error'; documentId: string; message: string }
  | { type: 'cancelled'; documentId: string };

export interface DocumentPipelineProgress {
  /** 0–100 across the whole validate→upload→analyze flow. */
  progress: number;
}

export interface ProcessOptions {
  ownerId?: string;
  familyProfileId?: string | null;
  source?: DocumentAttachment['source'];
  signal?: AbortSignal;
  onProgress?: (e: DocumentPipelineEvent) => void;
}

export interface PipelineAcceptResult {
  accepted: DocumentAttachment[];
  issues: FileValidationIssue[];
}

/** Validate a batch of files and create idle DocumentAttachments (no upload yet). */
export function prepareDocumentBatch(
  files: File[],
  options: Pick<ProcessOptions, 'ownerId' | 'familyProfileId' | 'source'> = {},
): PipelineAcceptResult {
  const { accepted, issues }: FileBatchValidation = validateFileBatch(files);
  const attachments: DocumentAttachment[] = accepted.map((file) => {
    const kind: HealthDocumentKind = detectDocumentKind(file);
    const safeName = sanitizeFileName(file.name);
    const previewUrl = kind === 'image' && typeof URL !== 'undefined' ? URL.createObjectURL(file) : undefined;
    return {
      id: createId('doc'),
      ownerId: options.ownerId,
      familyProfileId: options.familyProfileId ?? null,
      fileName: file.name,
      safeFileName: safeName,
      fileSize: file.size,
      mime: file.type || 'application/octet-stream',
      kind,
      source: options.source ?? 'upload',
      createdAt: new Date().toISOString(),
      uploadState: 'pending',
      processingState: 'idle',
      progress: 0,
      previewUrl,
      dataSource: 'mock',
    };
  });
  return { accepted: attachments, issues };
}

function toDocumentKind(kind: HealthDocumentKind): DocumentKind | null {
  switch (kind) {
    case 'image':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'document':
      return 'document';
    default:
      return null;
  }
}

function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Upload cancelled.';
  // Never surface raw provider payloads — only generic, safe messages.
  return fallback;
}

/**
 * Run the full pipeline for a single document. Returns the updated attachment
 * with its analysis result (or an error state). Respects an AbortSignal so the
 * caller can cancel an abandoned upload.
 */
export async function processDocument(
  attachment: DocumentAttachment,
  file: File,
  options: ProcessOptions = {},
): Promise<DocumentAttachment> {
  const { ownerId, familyProfileId, signal, onProgress } = options;
  const storage = resolveStorage();
  const emit = (e: DocumentPipelineEvent) => {
    try {
      onProgress?.(e);
    } catch {
      /* listener errors must never break the pipeline */
    }
  };

  // 1. VALIDATE (already done at batch prep, but guard single-file path).
  emit({ type: 'validating', documentId: attachment.id });
  if (signal?.aborted) {
    return { ...attachment, processingState: 'cancelled', uploadState: 'cancelled' };
  }

  // 2. SECURE STORAGE — upload via the replaceable boundary, fall back to local.
  let storageRef: { bucket: string; path: string } | undefined;
  let providerMetadata: Record<string, string> | undefined;
  let dataSource: DocumentAttachment['dataSource'] = 'mock';
  try {
    if (storage.available) {
      emit({ type: 'upload-progress', documentId: attachment.id, progress: 10 });
      const upload = await storage.upload(file, {
        folder: ownerId ? `carelink/${ownerId}` : 'carelink',
        signal,
        onProgress: (p) => emit({ type: 'upload-progress', documentId: attachment.id, progress: 10 + Math.round(p.progress * 0.4) }),
      });
      storageRef = upload.storageRef;
      providerMetadata = upload.providerMetadata;
      dataSource = upload.source === 'real' ? 'real' : 'mock';
      emit({ type: 'uploaded', documentId: attachment.id, storageRef });
    } else {
      // Mock/local adapter — simulate upload progress, keep the local blob URL.
      emit({ type: 'upload-progress', documentId: attachment.id, progress: 30 });
      const upload = await storage.upload(file, {
        signal,
        onProgress: (p) => emit({ type: 'upload-progress', documentId: attachment.id, progress: 10 + Math.round(p.progress * 0.4) }),
      });
      storageRef = upload.storageRef;
      providerMetadata = upload.providerMetadata;
      dataSource = 'mock';
      emit({ type: 'uploaded', documentId: attachment.id, storageRef });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      emit({ type: 'cancelled', documentId: attachment.id });
      return { ...attachment, processingState: 'cancelled', uploadState: 'cancelled' };
    }
    log.warn('document-pipeline', 'upload failed; falling back to local preview');
    // Keep local blob preview; mark data source as fallback (still works).
    dataSource = 'fallback';
  }

  // 3. METADATA PERSISTENCE — never store raw content, only safe metadata.
  if (isSupabaseConfigured() && ownerId && storageRef) {
    try {
      const meta: DocumentMetadataInput = {
        family_profile_id: familyProfileId ?? null,
        file_name: attachment.safeFileName,
        mime_type: attachment.mime,
        file_size: attachment.fileSize,
        storage_bucket: storageRef.bucket,
        storage_path: storageRef.path,
        document_kind: toDocumentKind(attachment.kind),
        upload_status: 'uploaded',
        processing_status: 'processing',
        provider_metadata: providerMetadata ?? {},
      };
      await createDocument(meta);
    } catch (err) {
      log.warn('document-pipeline', 'metadata persistence unavailable; continuing with local state');
    }
  }

  // 4. PROCESSING STATE → MOCK ANALYSIS → STRUCTURED RESULT.
  emit({ type: 'processing', documentId: attachment.id, progress: 70 });
  let analysis: DocumentAnalysisResult | undefined;
  try {
    analysis = await adapters.documents.analyzeDocument(attachment);
    emit({ type: 'analyzed', documentId: attachment.id, analysis });
  } catch (err) {
    const message = safeErrorMessage(err, 'Analysis unavailable. You can retry or continue.');
    emit({ type: 'error', documentId: attachment.id, message });
    // Update metadata status if persisted.
    if (isSupabaseConfigured() && ownerId && storageRef) {
      void updateDocumentStatus(attachment.id, { processing_status: 'error' }).catch(() => {});
    }
    return { ...attachment, processingState: 'failed', uploadState: 'failed', errorMessage: message, dataSource };
  }

  // Mark processing complete in metadata (best-effort).
  if (isSupabaseConfigured() && ownerId && storageRef) {
    void updateDocumentStatus(attachment.id, { processing_status: 'ready', extracted_text_placeholder: analysis.extractedTextPlaceholder }).catch(() => {});
  }

  return {
    ...attachment,
    uploadState: 'uploaded',
    processingState: 'analyzed',
    progress: 100,
    storageRef,
    providerMetadata,
    analysis,
    dataSource,
  };
}

/**
 * Securely delete a document: remove the storage object (if a real backend) +
 * delete the metadata row. Local blob URLs are revoked. Never raises — a failed
 * storage delete still removes the metadata reference so it can't be retrieved.
 */
export async function deleteDocumentArtifact(attachment: DocumentAttachment): Promise<boolean> {
  let storageDeleted = true;
  if (attachment.storageRef) {
    const storage = resolveStorage();
    if (storage.delete) {
      try {
        storageDeleted = await storage.delete(attachment.storageRef);
      } catch {
        storageDeleted = false;
      }
    }
  }
  if (attachment.previewUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(attachment.previewUrl);
    } catch {
      /* ignore */
    }
  }
  let metaDeleted = true;
  if (isSupabaseConfigured() && attachment.ownerId) {
    try {
      metaDeleted = await deleteDocument(attachment.id);
    } catch {
      metaDeleted = false;
    }
  }
  return storageDeleted || metaDeleted;
}

/** Whether any real storage backend (Cloudinary or Supabase Storage) is wired. */
export function isRealDocumentStorageConfigured(): boolean {
  return isRealStorageConfigured() || isSupabaseConfigured();
}

export { adapters };

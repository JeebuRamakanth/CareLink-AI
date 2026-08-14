/**
 * CareLink-AI — Step 11 document service (orchestration boundary).
 *
 * The single surface the UI calls for the medical-document lifecycle. It composes:
 *   validate → upload to storage → persist metadata → analyze → persist analysis.
 *
 * Components never call storage / repository / analysis APIs directly — they go
 * through `documentService`, which keeps the security boundaries intact:
 * - metadata is RLS-scoped to the owner + selected family profile,
 * - storage references are owner-scoped and never public medical URLs,
 * - analysis output is schema-validated before being surfaced.
 *
 * When Supabase is unavailable, the service operates in local/mock mode: it
 * keeps an in-browser list (per owner + family profile) so the upload pipeline,
 * library, and family isolation are all exercisable without credentials.
 * Mock results are always tagged so they can't be mistaken for real storage.
 */

import { createId } from '../../../lib';
import { log } from '../../../lib/security';
import { env } from '../../../config';
import {
  createDocument,
  deleteDocument as repoDeleteDocument,
  getDocument,
  listDocumentsForProfile,
  updateAnalysisStatus,
  updateDocumentStatus,
} from '../../../services/health-data/documentsRepository';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import type { MedicalDocumentRow } from '../../../services/health-data/types';
import {
  detectDocumentKind,
  sanitizeDisplayName,
  sanitizePublicIdSlug,
} from './fileValidation';
import {
  deleteDocumentFromStorage,
  documentFolder,
  getStorageMode,
  uploadDocumentToStorage,
} from './storageService';
import { analyzeDocument, assessSafety } from './documentAnalysisService';
import type { DocumentAnalysisResult, DocumentSafetyAssessment, HealthDocument } from '../types';

const LOCAL_LIBRARY_KEY = 'carelink_ai_documents_local';
const LOCAL_ANALYSIS_KEY = 'carelink_ai_document_analysis_local';

/* ----------------------------------------------------------------------------
 * Row ↔ domain mapping
 * ------------------------------------------------------------------------- */

function rowToDocument(row: MedicalDocumentRow, analysis?: DocumentAnalysisResult): HealthDocument {
  const storageSource = row.storage_bucket === 'cloudinary'
    ? 'cloudinary'
    : row.storage_bucket === 'local'
      ? 'local'
      : 'supabase';
  return {
    id: row.id,
    ownerId: row.owner_id,
    familyProfileId: row.family_profile_id,
    fileName: row.file_name,
    publicIdSlug: row.storage_path.split('/').pop() ?? row.id,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    kind: row.document_kind ?? 'other',
    storageBucket: row.storage_bucket,
    storageReference: row.storage_path,
    previewReference: null,
    createdAt: row.created_at,
    storageSource,
    pipelineState: mapProcessingToPipeline(row.processing_status, row.upload_status),
    uploadProgress: row.upload_status === 'uploaded' ? 100 : row.upload_status === 'uploading' ? 50 : 0,
    processingProgress: row.processing_status === 'ready' ? 100 : row.processing_status === 'processing' ? 60 : 0,
    analysisStatus: row.processing_status === 'ready' ? 'ready' : row.processing_status === 'error' ? 'error' : 'pending',
    providerMetadata: (row.provider_metadata as Record<string, string>) ?? {},
    errorMessage: null,
    analysis,
  };
}

function mapProcessingToPipeline(
  processing: MedicalDocumentRow['processing_status'],
  upload: MedicalDocumentRow['upload_status']
): HealthDocument['pipelineState'] {
  if (upload === 'failed') return 'failed';
  if (processing === 'error') return 'failed';
  if (processing === 'ready') return 'completed';
  if (processing === 'processing') return 'analyzing';
  if (upload === 'uploaded') return 'uploaded';
  if (upload === 'uploading') return 'uploading';
  return 'idle';
}

/* ----------------------------------------------------------------------------
 * Local (mock) persistence — used when Supabase is unavailable
 * ------------------------------------------------------------------------- */

interface LocalDocumentRecord {
  id: string;
  ownerId: string;
  familyProfileId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: MedicalDocumentRow['document_kind'];
  storageBucket: string;
  storagePath: string;
  storageSource: 'cloudinary' | 'supabase' | 'local';
  createdAt: string;
  pipelineState: HealthDocument['pipelineState'];
  uploadProgress: number;
  processingProgress: number;
  analysisStatus: 'none' | 'pending' | 'ready' | 'error';
  providerMetadata: Record<string, string>;
  errorMessage: string | null;
}

function readLocalLibrary(): LocalDocumentRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
    return raw ? (JSON.parse(raw) as LocalDocumentRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLibrary(records: LocalDocumentRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(records.slice(0, 200)));
  } catch (err) {
    log.warn('documents-service', 'local library write failed', err);
  }
}

function readLocalAnalysisMap(): Record<string, DocumentAnalysisResult> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_ANALYSIS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DocumentAnalysisResult>) : {};
  } catch {
    return {};
  }
}

function writeLocalAnalysisMap(map: Record<string, DocumentAnalysisResult>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_ANALYSIS_KEY, JSON.stringify(map));
  } catch (err) {
    log.warn('documents-service', 'local analysis write failed', err);
  }
}

function localRecordToDocument(rec: LocalDocumentRecord, analysis?: DocumentAnalysisResult): HealthDocument {
  return {
    id: rec.id,
    ownerId: rec.ownerId,
    familyProfileId: rec.familyProfileId,
    fileName: rec.fileName,
    publicIdSlug: rec.storagePath.split('/').pop() ?? rec.id,
    mimeType: rec.mimeType,
    fileSize: rec.fileSize,
    kind: rec.kind ?? 'other',
    storageBucket: rec.storageBucket,
    storageReference: rec.storagePath,
    previewReference: null,
    createdAt: rec.createdAt,
    storageSource: rec.storageSource,
    pipelineState: rec.pipelineState,
    uploadProgress: rec.uploadProgress,
    processingProgress: rec.processingProgress,
    analysisStatus: rec.analysisStatus,
    providerMetadata: rec.providerMetadata,
    errorMessage: rec.errorMessage,
    analysis,
  };
}

/* ----------------------------------------------------------------------------
 * Public service API
 * ------------------------------------------------------------------------- */

export interface DocumentContext {
  ownerId: string;
  familyProfileId: string | null;
}

/**
 * List documents for the selected family profile. RLS-scoped (Supabase) or
 * owner-scoped (local mock). Never mixes profiles.
 */
export async function listDocumentsForContext(ctx: DocumentContext): Promise<HealthDocument[]> {
  if (isSupabaseConfigured()) {
    const rows = await listDocumentsForProfile(ctx.familyProfileId);
    return rows.map((row) => rowToDocument(row));
  }
  const records = readLocalLibrary().filter(
    (r) => r.ownerId === ctx.ownerId && (r.familyProfileId ?? null) === (ctx.familyProfileId ?? null)
  );
  const analysisMap = readLocalAnalysisMap();
  return records.map((rec) => localRecordToDocument(rec, analysisMap[rec.id]));
}

/** Get a single document (ownership-safe). */
export async function getDocumentById(id: string): Promise<HealthDocument | null> {
  if (isSupabaseConfigured()) {
    const row = await getDocument(id);
    return row ? rowToDocument(row) : null;
  }
  const rec = readLocalLibrary().find((r) => r.id === id);
  if (!rec) return null;
  const analysisMap = readLocalAnalysisMap();
  return localRecordToDocument(rec, analysisMap[rec.id]);
}

export interface UploadDocumentInput {
  file: File;
  ctx: DocumentContext;
  signal?: AbortSignal;
  onUploadProgress?: (progress: number) => void;
  onProcessingProgress?: (progress: number) => void;
}

export interface UploadDocumentOutcome {
  document: HealthDocument;
  analysis: DocumentAnalysisResult | null;
  safety: DocumentSafetyAssessment;
}

/**
 * Run the full pipeline for one file:
 *   validate → upload → persist metadata → analyze → persist analysis.
 * Never throws — returns a safe error outcome on failure.
 */
export async function uploadAndAnalyzeDocument(input: UploadDocumentInput): Promise<
  { ok: true; outcome: UploadDocumentOutcome } | { ok: false; error: string; document?: HealthDocument }
> {
  const { file, ctx, signal, onUploadProgress, onProcessingProgress } = input;
  const documentId = createId('doc');
  const kind = detectDocumentKind(file);
  const publicIdSlug = sanitizePublicIdSlug(file.name);
  const folder = documentFolder(ctx.ownerId, ctx.familyProfileId);

  // --- upload to storage boundary ---
  const uploadRes = await uploadDocumentToStorage({
    file,
    ownerId: ctx.ownerId,
    documentId,
    publicIdSlug,
    folder,
    signal,
    onProgress: onUploadProgress,
  });
  if (!uploadRes.ok) {
    return { ok: false, error: uploadRes.error };
  }
  const storage = uploadRes.result;

  // --- persist metadata ---
  if (isSupabaseConfigured()) {
    const row = await createDocument({
      family_profile_id: ctx.familyProfileId,
      file_name: sanitizeDisplayName(file.name),
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_bucket: storage.bucket,
      storage_path: storage.reference,
      document_kind: kind,
      upload_status: 'uploaded',
      processing_status: 'processing',
      provider_metadata: storage.providerMetadata,
    });
    if (!row) {
      return { ok: false, error: 'We saved the file but could not record its metadata. Please try again.' };
    }
    // --- analyze ---
    onProcessingProgress?.(40);
    const analysis = await analyzeDocument({ documentId: row.id, kind, fileName: row.file_name, file });
    const safety = assessSafety(analysis.labResult);
    await updateAnalysisStatus(row.id, {
      processing_status: 'ready',
      extracted_text_placeholder: analysis.summary.slice(0, 240),
      provider_metadata: { ...storage.providerMetadata, category: analysis.category, isMock: String(analysis.isMock) },
    });
    const document = rowToDocument(row, analysis);
    return { ok: true, outcome: { document, analysis, safety } };
  }

  // --- local mock path ---
  onProcessingProgress?.(40);
  const analysis = await analyzeDocument({ documentId, kind, fileName: sanitizeDisplayName(file.name), file });
  const safety = assessSafety(analysis.labResult);
  const record: LocalDocumentRecord = {
    id: documentId,
    ownerId: ctx.ownerId,
    familyProfileId: ctx.familyProfileId,
    fileName: sanitizeDisplayName(file.name),
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    kind,
    storageBucket: storage.bucket,
    storagePath: storage.reference,
    storageSource: storage.source,
    createdAt: new Date().toISOString(),
    pipelineState: 'completed',
    uploadProgress: 100,
    processingProgress: 100,
    analysisStatus: 'ready',
    providerMetadata: storage.providerMetadata,
    errorMessage: null,
  };
  const library = readLocalLibrary();
  library.unshift(record);
  writeLocalLibrary(library);
  const analysisMap = readLocalAnalysisMap();
  analysisMap[documentId] = analysis;
  writeLocalAnalysisMap(analysisMap);
  const document = localRecordToDocument(record, analysis);
  return { ok: true, outcome: { document, analysis, safety } };
}

/**
 * Re-analyze an existing document (e.g. from the library "Analyze" action).
 * Returns the (possibly new) analysis result without re-uploading.
 */
export async function analyzeExistingDocument(documentId: string): Promise<DocumentAnalysisResult | null> {
  const doc = await getDocumentById(documentId);
  if (!doc) return null;
  // For local mock documents we can re-run cheaply. For Supabase-backed docs we
  // only have metadata (no binary) in the browser, so we re-run the mock
  // interpretation using the stored kind + filename and persist the status.
  const analysis = await analyzeDocument({
    documentId,
    kind: doc.kind,
    fileName: doc.fileName,
    file: new File([], doc.fileName, { type: doc.mimeType }),
  });
  if (isSupabaseConfigured()) {
    await updateAnalysisStatus(documentId, {
      processing_status: 'ready',
      extracted_text_placeholder: analysis.summary.slice(0, 240),
      provider_metadata: { ...doc.providerMetadata, category: analysis.category, isMock: String(analysis.isMock) },
    });
  } else {
    const library = readLocalLibrary().map((r) =>
      r.id === documentId ? { ...r, analysisStatus: 'ready' as const, processingProgress: 100, pipelineState: 'completed' as const } : r
    );
    writeLocalLibrary(library);
    const analysisMap = readLocalAnalysisMap();
    analysisMap[documentId] = analysis;
    writeLocalAnalysisMap(analysisMap);
  }
  return analysis;
}

/**
 * Delete a document: remove metadata (RLS-scoped) + best-effort binary removal.
 * Never throws; returns false only when the metadata could not be removed.
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const doc = await getDocumentById(documentId);
  if (!doc) return false;

  // Best-effort binary removal (server-bound for Cloudinary).
  await deleteDocumentFromStorage(doc.storageReference, doc.storageSource).catch(() => false);

  if (isSupabaseConfigured()) {
    return repoDeleteDocument(documentId);
  }
  const library = readLocalLibrary().filter((r) => r.id !== documentId);
  writeLocalLibrary(library);
  const analysisMap = readLocalAnalysisMap();
  delete analysisMap[documentId];
  writeLocalAnalysisMap(analysisMap);
  return true;
}

/** Whether the document metadata backend (Supabase) is configured. */
export function isDocumentBackendConfigured(): boolean {
  return isSupabaseConfigured();
}

/** The active storage mode label for the demo/real badge. */
export function documentStorageModeLabel(): string {
  const mode = getStorageMode();
  if (mode === 'mock') return 'Local (demo)';
  if (env.cloudinary.configured) return 'Cloudinary';
  return 'Supabase Storage';
}

export { updateDocumentStatus };

/**
 * CareLink-AI — Step 11 secure medical-document + image-intelligence models.
 *
 * Strongly-typed, backend-agnostic domain models for the document pipeline:
 * upload → validate → persist metadata → process → analyze → show result.
 *
 * SAFETY CONTRACT (mirrors the rest of the agent):
 * - These models describe *navigational* healthcare guidance. They never carry
 *   a diagnosis or a prescription.
 * - Raw medical content (OCR text, full report bodies) is intentionally NOT
 *   stored on these client models — only metadata + a short, schema-validated
 *   summary. The DB rows keep the same discipline (see migration 0001).
 * - AI/analysis output is always tagged with `isMock` / `source` so the UI can
 *   never present mock output as a real clinical analysis.
 */

import type { DocumentKind } from '../../services/health-data/types';

/* ----------------------------------------------------------------------------
 * Pipeline status
 * ------------------------------------------------------------------------- */

/** Full document lifecycle state. Drives the upload UI + processing animation. */
export type DocumentPipelineState =
  | 'idle'
  | 'validating'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Where a result came from — drives the REAL/MOCK/UNAVAILABLE badges. */
export type DocumentDataSource = 'real' | 'mock' | 'unavailable';

/** The broad category a document was classified into by the analysis adapter. */
export type DocumentCategory =
  | 'lab-report'
  | 'prescription'
  | 'medicine-image'
  | 'discharge-summary'
  | 'imaging'
  | 'doctor-note'
  | 'general-document';

/* ----------------------------------------------------------------------------
 * Health document (the canonical client-side record)
 * ------------------------------------------------------------------------- */

/**
 * The client-side medical document record. Combines file metadata, the
 * (Cloudinary/Supabase) storage reference, and pipeline status. Never holds the
 * file binary or a public URL — `previewReference` is at most a short-lived
 * local object URL for image previews.
 */
export interface HealthDocument {
  id: string;
  /** Owning user id (auth.uid()). Required for RLS/ownership checks. */
  ownerId: string;
  /** Selected family/patient profile id (null = "self"). Drives isolation. */
  familyProfileId: string | null;
  /** Original filename (sanitized for display only — never used as public id). */
  fileName: string;
  /** Sanitized public-id-safe slug used for storage references. */
  publicIdSlug: string;
  mimeType: string;
  fileSize: number;
  /** Broad kind for icons/filters; derived from MIME + filename. */
  kind: DocumentKind;
  /** Storage bucket name (private). */
  storageBucket: string;
  /** Storage path / reference (owner-scoped). Never a public URL. */
  storageReference: string;
  /** Optional short-lived local preview URL (object URL) for images. */
  previewReference: string | null;
  createdAt: string;
  /** Where the binary lives: 'cloudinary' | 'supabase' | 'local' (mock). */
  storageSource: 'cloudinary' | 'supabase' | 'local';
  pipelineState: DocumentPipelineState;
  uploadProgress: number;
  processingProgress: number;
  analysisStatus: 'none' | 'pending' | 'ready' | 'error';
  /** Provider-side metadata (public id, version, format) — no secrets. */
  providerMetadata: Record<string, string>;
  /** Safe, human-readable error for the UI (never raw vendor payloads). */
  errorMessage: string | null;
  /** Populated once analysis completes. */
  analysis?: DocumentAnalysisResult;
}

/* ----------------------------------------------------------------------------
 * Document attachment (the in-flight upload item shown in the composer tray)
 * ------------------------------------------------------------------------- */

/**
 * An attachment during the SELECT → ANALYZE pipeline. This is the transient
 * shape the upload UI manipulates; on success it is persisted as a HealthDocument.
 */
export interface DocumentAttachment {
  id: string;
  /** Underlying File handle (kept only in React state, never in DB/global store). */
  file: File;
  fileName: string;
  publicIdSlug: string;
  mimeType: string;
  fileSize: number;
  kind: DocumentKind;
  /** Local object URL for image preview (revoked on remove). */
  previewUrl: string | null;
  pipelineState: DocumentPipelineState;
  uploadProgress: number;
  processingProgress: number;
  storageReference: string | null;
  storageSource: 'cloudinary' | 'supabase' | 'local' | null;
  errorMessage: string | null;
  /** Abort controller token for cancel/timeout. */
  abortController?: AbortController;
}

/* ----------------------------------------------------------------------------
 * Processing + analysis result
 * ------------------------------------------------------------------------- */

/** Processing-state payload surfaced while a document is being handled. */
export interface DocumentProcessingState {
  documentId: string;
  state: DocumentPipelineState;
  uploadProgress: number;
  processingProgress: number;
  message: string;
}

/** A single structured value extracted from a lab report. */
export interface ExtractedMedicalValue {
  testName: string;
  measuredValue: string;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'attention' | 'abnormal' | 'unknown';
  collectionDate: string | null;
}

/** Structured extraction for a lab result (clearly "extracted from report"). */
export interface LabResult {
  reportTitle: string;
  collectionDate: string | null;
  values: ExtractedMedicalValue[];
  /** Values flagged as needing attention. */
  valuesRequiringAttention: ExtractedMedicalValue[];
  /** Values within the listed reference range. */
  normalValues: ExtractedMedicalValue[];
}

/** Structured extraction for a prescription. Only fields actually extracted. */
export interface PrescriptionExtraction {
  doctorName: string | null;
  date: string | null;
  medicineNames: string[];
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  /** Fields that were unclear in the source document. */
  needsVerification: string[];
}

/** Result of recognizing a medicine/tablet from text or image. */
export interface MedicineRecognitionResult {
  name: string | null;
  strength: string | null;
  dosageForm: string | null;
  /** Manufacturer placeholder only — never assert a real manufacturer. */
  manufacturerPlaceholder: string | null;
  /** 0–100 recognition confidence (mock unless a real backend exists). */
  confidence: number;
  commonPurpose: string | null;
  safetyWarning: string | null;
  prescriptionRequired: boolean;
  /** True when recognition is uncertain — UI must ask the user to verify. */
  isUncertain: boolean;
  source: DocumentDataSource;
}

/** Schema-validated analysis result. UI renders ONLY validated fields. */
export interface DocumentAnalysisResult {
  documentId: string;
  category: DocumentCategory;
  /** Short, safe summary. Never a diagnosis. */
  summary: string;
  /** Key observations (extracted facts only). */
  importantObservations: string[];
  /** Concerns worth discussing with a clinician (never a diagnosis). */
  possibleConcerns: string[];
  /** Recommended next action (navigational). */
  recommendedNextAction: string;
  labResult?: LabResult;
  prescription?: PrescriptionExtraction;
  medicine?: MedicineRecognitionResult;
  /** Always true until a real analysis backend exists. */
  isMock: boolean;
  source: DocumentDataSource;
  /** Schema-validation pass/fail flag (UI never renders unvalidated output). */
  validated: boolean;
}

/**
 * Safety assessment attached to every analyzed document. The agent uses this to
 * decide whether to surface emergency guidance instead of a plain result.
 */
export interface DocumentSafetyAssessment {
  /** True if the document contains emergency-grade signals. */
  isEmergency: boolean;
  /** True if any value sits far outside the reference range. */
  hasAttentionValues: boolean;
  /** Short, safe reason for the assessment (no PHI). */
  reason: string;
}

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
import type { DocumentExtraction } from './services/extraction/types';
import type { DocumentClassification } from './services/extraction/classify';
import type { AnalyteTrend } from './services/clinical/trends';
import type { ParsedMedicine } from './services/clinical/prescriptionParser';
import type { TriageResult } from './services/clinical/triage';
import type { LabValueStatus, StatusBasis } from './services/clinical/labParser';
import type { UnitStatus } from './services/clinical/units';
import type { MedicineVisionRead } from './services/vision/types';

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

/**
 * A single structured value extracted from a lab report.
 *
 * Every field is either read from the document or explicitly unknown. `status`
 * is our computed classification; `reportFlag` is what the LAB printed. They are
 * kept separate so the lab's judgement and ours never blur.
 */
export interface ExtractedMedicalValue {
  testName: string;
  measuredValue: string;
  unit: string;
  /** The reference interval exactly as printed on the report. */
  referenceRange: string;
  status: LabValueStatus;
  /** How the status was decided (report flag vs. report range vs. catalog). */
  statusBasis: StatusBasis;
  collectionDate: string | null;
  /** 1-based page the value came from, when known. */
  page?: number;
  /** The lab's own flag, verbatim (e.g. 'H', 'Low'), when printed. */
  reportFlag?: string | null;
  /** Whether the unit could be reconciled with the catalog. */
  unitStatus?: UnitStatus;
  /** Matched catalog analyte key, when recognised. */
  analyteKey?: string | null;
  /** Plain-language explanation of what the test measures. */
  about?: string;
  /** Why clinicians commonly order this test. */
  whyOrdered?: string;
  /** True when the value sits in a catalog CRITICAL band. */
  critical?: boolean;
  /** Reason for the critical flag. */
  criticalReason?: string;
  /** The raw source line, for "view source". */
  rawLine?: string;
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
  /** Values the parser could not classify (unreadable unit/no interval). */
  unknownValues?: ExtractedMedicalValue[];
  /** Lines that looked like data rows but could not be parsed. */
  unparsedLines?: { line: string; page: number }[];
  /** Total pages in the source document. */
  pageCount?: number;
}

/** One row of the derived medication schedule. */
export interface ScheduleRow {
  medicine: string;
  strength: string | null;
  form: string | null;
  dose: string | null;
  /** The instruction exactly as written. */
  instruction: string;
  frequency: string | null;
  timing: string | null;
  duration: string | null;
  /** morning/afternoon/night slots, only when the source supports them. */
  schedule: string[];
  /** Fields that need professional confirmation. */
  needsConfirmation: string[];
  /** The raw source line. */
  rawLine: string;
  page: number;
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
  /** The full parsed medication table. */
  medicines?: ParsedMedicine[];
  /** Rows rendered as the medication schedule. */
  schedule?: ScheduleRow[];
  /** Follow-up / advice lines found on the document. */
  followUp?: string[];
  /** Lines that looked like prescriptions but could not be parsed. */
  unparsedLines?: { line: string; page: number }[];
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
  /** True when the name was matched against a verified external database. */
  verified?: boolean;
  /** Generic/active ingredient, when verified. */
  genericName?: string | null;
  /** Verified common uses (from a label source), when available. */
  uses?: string[];
  /** Verified common side effects, when available. */
  sideEffects?: string[];
  /** Verified serious warnings, when available. */
  seriousWarnings?: string[];
  /** Reference/verified dosage text from the label — never a patient dose. */
  referenceDosage?: string | null;
  /** Why the identification is uncertain (e.g. no label text readable). */
  uncertaintyReason?: string | null;
  /** Provenance entries for the medicine facts shown. */
  evidence?: EvidenceReference[];
  /** What could not be verified. */
  unverified?: string[];
}

/** A source citation attached to a medical claim. */
export interface EvidenceReference {
  /** Short human label, e.g. "openFDA drug label". */
  label: string;
  /** Official URL when available. */
  url?: string;
  /** Date the source was retrieved (ISO). */
  retrievedAt?: string;
  /** What the source supports. */
  supports: string;
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
  /**
   * The structured vision READ of a medicine photograph (what the vision model
   * actually read). Present only when a real vision backend produced it —
   * it is never synthesised from a filename or a mock dataset.
   */
  visionRead?: MedicineVisionRead;
  /** How well a photographed medicine could be identified. */
  identificationLevel?: 'verified' | 'possible' | 'unidentifiable';
  /** True when the vision backend was unavailable (as opposed to an unreadable photo). */
  visionUnavailable?: boolean;
  /** Always true until a real analysis backend exists. */
  isMock: boolean;
  source: DocumentDataSource;
  /** Schema-validation pass/fail flag (UI never renders unvalidated output). */
  validated: boolean;

  /* --- Phase 2-5 additions: real extraction + deterministic interpretation --- */

  /** The raw text extraction outcome (pages, provenance, limitations). */
  extraction?: DocumentExtraction;
  /** How the document was classified and why. */
  classification?: DocumentClassification;
  /** Deterministic urgency triage for this document. */
  triage?: TriageResult;
  /** Source citations for the medical claims shown. */
  evidence?: EvidenceReference[];
  /** What could not be read/verified, stated explicitly. */
  limitations?: string[];
  /** Cross-report trends, when several comparable reports were analysed. */
  trends?: AnalyteTrend[];
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
  /** The full deterministic triage result, when computed. */
  triage?: TriageResult;
}

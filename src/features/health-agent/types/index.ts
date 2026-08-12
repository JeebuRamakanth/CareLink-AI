/**
 * CareLink Health Agent — strongly-typed domain models.
 *
 * This is the contract every adapter, the orchestrator, and the UI all share.
 * Models are deliberately backend-agnostic: a real Supabase/API/LLM layer can
 * populate these same shapes without touching components.
 *
 * SAFETY CONTRACT: these models describe *navigational* healthcare guidance.
 * They never carry a diagnosis or a prescription. Emergency payloads escalate
 * to safe call-to-action data instead of clinical claims.
 */

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------------- */

export type AgentLanguage = 'en' | 'te' | 'hi';

export type UrgencyLevel = 'routine' | 'attention' | 'urgent' | 'emergency';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type TransportMode = 'driving' | 'walking' | 'transit';

/** Information tier the agent distinguishes for safe behaviour. */
export type InformationTier =
  | 'educational' // general knowledge
  | 'triage' // possible concern / what-to-watch
  | 'next-action' // recommended next step
  | 'emergency' // urgent-care escalation
  | 'professional'; // explicit "ask a clinician"

export type RouteTargetKind = 'hospital' | 'doctor' | 'pharmacy' | 'lab';

/* ----------------------------------------------------------------------------
 * Intent model — the full intent taxonomy the orchestrator can detect
 * ------------------------------------------------------------------------- */

export type AgentIntent =
  | 'symptom'
  | 'disease'
  | 'hospital'
  | 'doctor'
  | 'pharmacy'
  | 'medicine'
  | 'lab'
  | 'report'
  | 'appointment'
  | 'emergency'
  | 'route'
  | 'recovery'
  | 'vaccination'
  | 'child-care'
  | 'elder-care'
  | 'mental-health'
  | 'family'
  | 'location'
  | 'general';

export interface IntentClassification {
  intent: AgentIntent;
  confidence: ConfidenceLevel;
  /** Extracted entities (specialty, condition, medicine, place…). */
  entities: string[];
  rawInput: string;
  /** Heuristic language hint detected from the input. */
  detectedLanguage?: AgentLanguage;
}

/* ----------------------------------------------------------------------------
 * Action model — a single actionable next step with an optional deep-link
 * ------------------------------------------------------------------------- */

export type AgentActionType =
  | 'view-hospital'
  | 'view-doctor'
  | 'view-pharmacy'
  | 'view-lab'
  | 'book-appointment'
  | 'reschedule-appointment'
  | 'cancel-appointment'
  | 'view-appointments'
  | 'get-directions'
  | 'open-map'
  | 'view-distance'
  | 'view-eta'
  | 'call-facility'
  | 'call-emergency'
  | 'find-pharmacy'
  | 'find-doctor'
  | 'find-hospital'
  | 'upload-report'
  | 'upload-prescription'
  | 'track-recovery'
  | 'ask-follow-up'
  | 'open-command-center';

export interface AgentAction {
  type: AgentActionType;
  label: string;
  /** Internal route (existing hospital/doctor/appointment pages) or external (tel:). */
  href?: string;
  /** Hint for icon selection in the UI. */
  icon?: AgentActionType;
}

/* ----------------------------------------------------------------------------
 * Attachment / document model — unified across image, PDF, doc, medicine photo
 * ------------------------------------------------------------------------- */

export type HealthDocumentKind = 'image' | 'pdf' | 'document' | 'camera' | 'unknown';

/**
 * Full processing-state machine for a document (Step 11 §pipeline).
 * idle → validating → uploading → uploaded → processing → analyzed → failed/cancelled.
 * The legacy `HealthDocumentStatus` (kept for the existing chat attachment flow)
 * maps onto this superset.
 */
export type DocumentProcessingState =
  | 'idle'
  | 'validating'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'analyzed'
  | 'failed'
  | 'cancelled';

/** Legacy processing-status labels used by the existing chat attachment UI. */
export type HealthDocumentStatus =
  | 'queued'
  | 'uploading'
  | 'reading'
  | 'extracting'
  | 'organizing'
  | 'preparing'
  | 'ready'
  | 'error';

export type DocumentUploadState = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

export type DocumentAnalysisCategory =
  | 'lab-report'
  | 'prescription'
  | 'medicine-image'
  | 'discharge-summary'
  | 'imaging'
  | 'general-document';

/**
 * A normalized document attachment carried through the agent pipeline.
 * Backend-agnostic; never carries raw file bytes (only a local/blob or signed
 * URL preview). Ownership + family-profile scoping is enforced at the service
 * boundary, never trusted from the UI alone.
 */
export interface DocumentAttachment {
  id: string;
  /** Authenticated owner id (Supabase user id, or a local-dev sentinel in mock). */
  ownerId?: string;
  /** Selected patient/family profile the document belongs to. */
  familyProfileId?: string | null;
  fileName: string;
  /** Sanitized filename used for storage paths (no path traversal). */
  safeFileName: string;
  fileSize: number;
  mime: string;
  kind: HealthDocumentKind;
  source: 'upload' | 'camera' | 'drag-drop' | 'mobile-picker';
  createdAt: string;
  uploadState: DocumentUploadState;
  processingState: DocumentProcessingState;
  /** 0–100 progress across the upload + processing pipeline. */
  progress: number;
  /** Object URL (local) or signed URL for image preview. Never a public medical URL. */
  previewUrl?: string;
  /** Storage reference (bucket + path) when persisted to a real backend. */
  storageRef?: { bucket: string; path: string };
  /** Provider metadata (public id, format, version) — never secrets. */
  providerMetadata?: Record<string, string>;
  errorMessage?: string;
  /** Populated by the document-analysis adapter. */
  analysis?: DocumentAnalysisResult;
  /** Whether this artifact came from a real provider or the mock/local adapter. */
  dataSource: 'real' | 'mock' | 'fallback';
}

/**
 * Backward-compatible HealthDocument shape consumed by the existing orchestrator.
 * It is a slim view over {@link DocumentAttachment}.
 */
export interface HealthDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mime: string;
  kind: HealthDocumentKind;
  status: HealthDocumentStatus;
  /** 0–100 progress across the mock analysis pipeline. */
  progress: number;
  /** Object URL for local image preview. */
  previewUrl?: string;
  errorMessage?: string;
  /** Populated by the document-analysis adapter (placeholder text for now). */
  analysis?: DocumentAnalysis;
  /** Owner/family scoping (Step 11). */
  ownerId?: string;
  familyProfileId?: string | null;
  uploadState?: DocumentUploadState;
  processingState?: DocumentProcessingState;
}

/**
 * Structured value extracted from a lab report (Step 11 §lab-report-support).
 * The UI MUST distinguish "value extracted from document" from "AI explanation".
 */
export interface ExtractedMedicalValue {
  id: string;
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  abnormalFlag: 'normal' | 'low' | 'high' | 'critical-high' | 'critical-low' | 'unknown';
  /** ISO date the sample was collected, if present in the document. */
  collectionDate?: string;
  /** True when the value was read from the document vs. inferred (always false in mock). */
  extractedFromDocument: boolean;
}

/** Normalized lab report extracted from a document. */
export interface LabResult {
  reportTitle: string;
  sourceFileName?: string;
  collectionDate?: string;
  values: ExtractedMedicalValue[];
  /** Values outside the reference range, surfaced for clinician review. */
  valuesRequiringAttention: ExtractedMedicalValue[];
  /** Free-text lab notes, if any were present. */
  notes?: string;
}

/**
 * Result of recognizing a medicine from a photo or text (Step 11 §medicine-intelligence).
 * NEVER carries a dosage recommendation or prescription.
 */
export interface MedicineRecognitionResult {
  id: string;
  name: string;
  strength?: string;
  dosageForm?: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'inhaler' | 'unknown';
  /** Manufacturer placeholder — real verified data only when a real source is connected. */
  manufacturerPlaceholder?: string;
  recognitionConfidence: ConfidenceLevel;
  /** 0–1 numeric confidence, when available. */
  confidenceScore?: number;
  commonPurpose?: string;
  warningsPlaceholder?: string[];
  prescriptionRequired?: boolean;
  /** Always true until a real verified medicine data source is connected. */
  isMock: true;
}

/**
 * Safety assessment over extracted document values (Step 11 §safety).
 * Never produces a diagnosis — only concern tiers + recommended actions.
 */
export interface DocumentSafetyAssessment {
  /** Highest concern tier detected across the document. */
  tier: InformationTier;
  /** Human-readable, non-diagnostic summary. */
  summary: string;
  /** Non-diagnostic concern notes, e.g. "value outside reference range". */
  concerns: string[];
  /** Recommended next actions (navigate to a clinician / lab / emergency). */
  recommendedActions: string[];
  /** Whether an emergency indicator was detected (drives urgent-care UI). */
  hasEmergencyIndicator: boolean;
  /** Explicit disclaimer that this is not a diagnosis. */
  disclaimer: string;
  /** Always true until a real clinical interpretation backend exists. */
  isMock: true;
}

/** Full analysis result returned by the document-analysis adapter. */
export interface DocumentAnalysisResult {
  category: DocumentAnalysisCategory;
  /** Extracted text placeholder — a real OCR/NLP layer fills this later. */
  extractedTextPlaceholder: string;
  /** Key phrases the mock adapter surfaces as a demo. */
  keyFindings: string[];
  /** Structured lab values when the document is a lab report. */
  labResult?: LabResult;
  /** Recognized medicine when the document is a medicine image. */
  medicine?: MedicineRecognitionResult;
  /** Safety assessment over extracted values. */
  safety?: DocumentSafetyAssessment;
  /** Always true until a real analysis backend exists. */
  isMock: true;
}

/** Legacy analysis shape (kept for the existing orchestrator/mock flow). */
export interface DocumentAnalysis {
  category: DocumentAnalysisCategory;
  /** Extracted text placeholder — a real OCR/NLP layer fills this later. */
  extractedTextPlaceholder: string;
  /** Key phrases the mock adapter surfaces as a demo. */
  keyFindings: string[];
  /** Always true until a real analysis backend exists. */
  isMock: true;
  /** Full structured result (Step 11), when available. */
  result?: DocumentAnalysisResult;
}

/* ----------------------------------------------------------------------------
 * Recommendation models (carry deep-link ids to existing routes)
 * ------------------------------------------------------------------------- */

export interface RouteRecommendation {
  destinationName: string;
  destinationAddress: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  transportMode: TransportMode;
  deepLink?: { kind: RouteTargetKind; id: string };
}

/* ----------------------------------------------------------------------------
 * Smart healthcare search — explainable ranking ("Why this result?")
 * ------------------------------------------------------------------------- */

export type RankReasonTag =
  | 'near-you'
  | 'highly-rated'
  | 'relevant-specialty'
  | 'doctor-availability'
  | 'open-now'
  | 'matches-treatment'
  | 'accepts-new-patients';

export interface RankReason {
  tag: RankReasonTag;
  /** Human label, e.g. "Highly rated (4.8)". */
  label: string;
  /** 0..1 relative weight contribution for this reason. */
  weight: number;
}

export interface RankingContext {
  patientLocation?: { label: string; lat?: number; lng?: number };
  requestedSpecialty?: string;
  requestedTreatment?: string;
  urgency: UrgencyLevel;
  language: AgentLanguage;
}

/** A ranked recommendation carries its score + human-readable reasons. */
export interface RankedRecommendation {
  score: number;
  reasons: RankReason[];
}

/** Composite score field attachable to any recommendation list item. */
export interface WithRanking {
  rank?: RankedRecommendation;
}

export interface HospitalRecommendation {
  id: string;
  /** Id used by the EXISTING route /hospitals/:hospitalId. */
  detailSlug: string;
  name: string;
  rating: number;
  reviewCount: number;
  specialties: string[];
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  hasEmergency: boolean;
  address: string;
  city: string;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}

export interface DoctorRecommendation {
  id: string;
  /** Id used by the EXISTING route /doctors/:doctorId. */
  detailSlug: string;
  fullName: string;
  specialty: string;
  hospitalName: string;
  hospitalDetailSlug?: string;
  rating: number;
  reviewCount: number;
  yearsOfExperience: number;
  languages: string[];
  availabilityStatus: 'available' | 'busy' | 'limited' | 'offline';
  nextAvailableSlot: string;
  consultationFee?: string;
  acceptsNewPatients: boolean;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}

export interface PharmacyRecommendation {
  id: string;
  name: string;
  medicineName?: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  /** Mock placeholder only — never claim real-time stock. */
  availabilityPlaceholder: string;
  estimatedPrice?: string;
  address: string;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}

export interface LabRecommendation {
  id: string;
  name: string;
  testsOffered: string[];
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  homeCollectionAvailable: boolean;
  address: string;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}

/* ----------------------------------------------------------------------------
 * Medicine + medical report models (mock, clearly labelled)
 * ------------------------------------------------------------------------- */

export interface MedicineResult {
  id: string;
  name: string;
  commonPurpose: string;
  importantSafetyInfo: string;
  prescriptionRequired: boolean;
  interactionWarningPlaceholder: string;
  pharmacyDiscoveryAction?: PharmacyRecommendation;
}

export interface MedicineInput {
  /** Free text the user typed, e.g. a tablet name. */
  text?: string;
  /** Medicine photo / prescription attached. */
  documentId?: string;
}

export interface MedicalReportValue {
  label: string;
  value: string;
  range?: string;
  status: 'normal' | 'attention' | 'abnormal';
}

export interface MedicalReport {
  id: string;
  reportTitle: string;
  sourceFileName?: string;
  summary: string;
  importantObservations: string[];
  valuesRequiringAttention: MedicalReportValue[];
  normalValues: MedicalReportValue[];
  trendComparisonPlaceholder: string;
  questionsToAskYourDoctor: string[];
  recommendedNextAction: string;
  /** Always true until a real interpretation backend exists. */
  isMockInterpretation: true;
}

/* ----------------------------------------------------------------------------
 * Emergency assessment
 * ------------------------------------------------------------------------- */

export interface EmergencyFacility {
  id: string;
  detailSlug?: string;
  name: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  address: string;
  route?: RouteRecommendation;
}

export interface EmergencyContactAction {
  label: string;
  phone?: string;
  href?: string;
}

export interface EmergencyAssessment {
  severity: UrgencyLevel;
  indicatorLabel: string;
  immediateGuidance: string[];
  recommendedNextAction: string;
  nearbyFacilities: EmergencyFacility[];
  contacts: EmergencyContactAction[];
  disclaimer: string;
}

/* ----------------------------------------------------------------------------
 * Appointment recommendation
 * ------------------------------------------------------------------------- */

export interface AppointmentRecommendation {
  kind: 'book' | 'reschedule' | 'cancel' | 'view';
  doctorDetailSlug?: string;
  hospitalDetailSlug?: string;
  label: string;
  description: string;
}

/* ----------------------------------------------------------------------------
 * Recovery check-in
 * ------------------------------------------------------------------------- */

export type RecoveryTrend = 'better' | 'same' | 'worse';

export interface RecoveryCheckIn {
  id: string;
  trend: RecoveryTrend;
  note?: string;
  recordedAt: string;
}

export interface RecoveryStatus {
  conditionLabel: string;
  currentTrend: RecoveryTrend;
  lastCheckInAt?: string;
  streakDays: number;
  checkIns: RecoveryCheckIn[];
  followUpReminderPlaceholder: string;
  isMockTracking: true;
}

/* ----------------------------------------------------------------------------
 * Patient context
 * ------------------------------------------------------------------------- */

export type FamilyRelation = 'self' | 'parent' | 'child' | 'spouse' | 'other';

export interface PatientProfile {
  id: string;
  label: string;
  relation: FamilyRelation;
  contextSummary: string;
  contextTags: string[];
}

export interface AgentNavigationContext {
  symptoms?: string[];
  diseaseTopic?: string;
  medicine?: string;
  ageProfile?: string;
  familyMember?: string;
  urgency?: UrgencyLevel;
  location?: { label: string; lat?: number; lng?: number };
  selectedHospitalSlug?: string;
  selectedDoctorSlug?: string;
  appointmentIntent?: 'book' | 'reschedule' | 'cancel' | 'view';
  requestedSpecialty?: string;
  requestedTreatment?: string;
}

export interface PatientContext {
  activeProfileId: string;
  profile: PatientProfile;
  /** Optional location-aware context for location-sensitive intents. */
  location?: { label: string; lat?: number; lng?: number };
  /** Structured context carried across navigation steps (Step 9 §7). */
  navigation?: AgentNavigationContext;
}

/* ----------------------------------------------------------------------------
 * Conversation + message
 * ------------------------------------------------------------------------- */

export type AgentMessageRole = 'user' | 'assistant';

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  /** Structured result rendered as a result card (assistant only). */
  result?: AgentResult;
  documents: HealthDocument[];
  contextTags: string[];
  patientProfileId: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  language: AgentLanguage;
  patientProfileId: string;
}

/* ----------------------------------------------------------------------------
 * AgentResult — the canonical structured response the orchestrator returns
 * ------------------------------------------------------------------------- */

export interface AgentResultMeta {
  confidence: ConfidenceLevel;
  urgency: UrgencyLevel;
  tier: InformationTier;
  disclaimer?: string;
  sources?: string[];
}

export interface AgentResult {
  id: string;
  /** Which intent the orchestrator resolved. */
  intent: AgentIntent;
  summary: string;
  explanation: string;
  urgency: UrgencyLevel;
  meta: AgentResultMeta;
  recommendedNextSteps: string[];
  hospitals: HospitalRecommendation[];
  doctors: DoctorRecommendation[];
  pharmacies: PharmacyRecommendation[];
  labs: LabRecommendation[];
  medicines: MedicineResult[];
  routes: RouteRecommendation[];
  appointments: AppointmentRecommendation[];
  medicalReport?: MedicalReport;
  emergency?: EmergencyAssessment;
  recovery?: RecoveryStatus;
  warnings: string[];
  /** Whether the result came from real providers, mock, or fallback (demo). */
  dataSource?: 'real' | 'mock' | 'fallback';
  /** True when any part of the result is demo/mock data (drives UI badge). */
  isDemoData?: boolean;
  /** Provenance / verification metadata. */
  sources: string[];
  /** Clarifying prompts to keep the conversation moving. */
  followUpQuestions: string[];
  /** Renderable CTA actions (deep-link into existing flows). */
  actions: AgentAction[];
  /** Quick-reply chips. */
  suggestedReplies: string[];
}

/* ----------------------------------------------------------------------------
 * Orchestrator request
 * ------------------------------------------------------------------------- */

export interface AgentOrchestratorRequest {
  text: string;
  documents: HealthDocument[];
  patientContext: PatientContext;
  language: AgentLanguage;
}

export interface AgentOrchestratorResponse {
  result: AgentResult;
  classification: IntentClassification;
}

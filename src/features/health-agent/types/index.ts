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

/**
 * Languages the assistant can answer in (Phase 2).
 *
 * `en` is the guaranteed floor; the additional languages are handled by the
 * deterministic detector (native script + Romanized transliteration) and the
 * language-aware model instructions. Adding a language here is the ONLY change
 * needed for the selector, the schema validator and the gateway to accept it.
 */
export type AgentLanguage =
  | 'en' // English
  | 'te' // Telugu (script + Telugu-English transliteration)
  | 'hi' // Hindi (Devanagari + Hinglish)
  | 'kn' // Kannada
  | 'ta' // Tamil
  | 'ml' // Malayalam
  | 'bn' // Bengali
  | 'gu' // Gujarati
  | 'mr' // Marathi
  | 'ur'; // Urdu

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

/**
 * Medical safety level the AI safety layer assigns to every response
 * (Step 13 §4). Drives badges, escalation and disclaimer selection.
 */
export type SafetyLevel =
  | 'educational'
  | 'possible-concern'
  | 'urgent'
  | 'emergency'
  | 'professional-care';

/** mock/live/unavailable/refused provenance for any provider-derived payload. */
export interface AIProvenance {
  mode: 'real' | 'mock' | 'unavailable' | 'refused';
  provider: string;
  fetchedAt: string;
  /** verification status of the payload (schema-validated or fallback). */
  verification: 'validated' | 'fallback' | 'unverified';
}

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
  | 'blood'
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

/**
 * Alias of the real secure-analysis result produced by the documents pipeline
 * (vision read, lab extraction, prescription, triage). Declared here as a type
 * import so the agent's document model can carry it without a runtime cycle.
 */
export type SecureDocumentAnalysis = import('../../documents/types').DocumentAnalysisResult;

export type HealthDocumentKind = 'image' | 'pdf' | 'document' | 'camera' | 'unknown';
export type HealthDocumentStatus =
  | 'queued'
  | 'uploading'
  | 'reading'
  | 'extracting'
  | 'organizing'
  | 'preparing'
  | 'ready'
  | 'error';

export type DocumentAnalysisCategory =
  | 'lab-report'
  | 'prescription'
  | 'medicine-image'
  | 'discharge-summary'
  | 'imaging'
  | 'general-document';

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
  /**
   * The File handle for the in-flight document. Kept ONLY in React state so the
   * real analysis pipeline (vision/OCR/PDF) can read it; it is never persisted.
   */
  file?: File;
  /**
   * The REAL secure analysis result (vision read, lab extraction, prescription,
   * triage) produced by the documents pipeline. Present only when the real
   * pipeline ran — the orchestrator reads this instead of inventing values.
   */
  secureAnalysis?: SecureDocumentAnalysis;
  /** Honest failure reason when the real pipeline could not analyse the file. */
  pipelineError?: string;
}

/** Provenance for a single extracted value or an entire analysis payload. */
export interface ExtractionProvenance {
  /** Id of the source document the value came from. */
  sourceDocumentId?: string;
  /** Page/section locator when the processor provides one. */
  locator?: string;
  /** 0..1 extraction confidence; omitted when the processor cannot score it. */
  confidence?: number;
  /** ISO timestamp of processing. */
  processedAt?: string;
  /** Provider name ("mock" in demo mode). */
  provider?: string;
}

export interface DocumentAnalysis {
  category: DocumentAnalysisCategory;
  /** Extracted text placeholder — a real OCR/NLP layer fills this later. */
  extractedTextPlaceholder: string;
  /** Key phrases the mock adapter surfaces as a demo. */
  keyFindings: string[];
  /** True whenever any part of the analysis is demo/mock data. */
  isMock: boolean;
  /** Provenance for the extraction (mock analyses tag provider "mock"). */
  provenance?: ExtractionProvenance;
}

/* ----------------------------------------------------------------------------
 * Recommendation models (carry deep-link ids to existing routes)
 * ------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------
 * Explainability — every scored recommendation carries why it was picked.
 * ------------------------------------------------------------------------- */

/**
 * Why a single recommendation was selected and how strongly. Rendered as a
 * human-readable rationale ("Recommended #1 because…"). Kept on the model so a
 * future backend can populate the same fields — the ranking engine fills these
 * for the mock today.
 */
export interface RecommendationReason {
  /** 0–100 normalized score across all ranking factors. */
  recommendationScore: number;
  /** Short human-readable reasons, e.g. "2.3 km away", "rated 4.8/5". */
  matchedReasons: string[];
  /** The single strongest factor, surfaced as the headline reason. */
  topReason?: string;
}

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

/**
 * Mixin helper: any recommendation can carry explainability. Declared as an
 * optional intersection on each concrete recommendation type below so the UI
 * can render `recommendationScore` / `matchedReasons` when present.
 */
export type Explainable<T> = T & Partial<RecommendationReason>;

export interface HospitalRecommendation extends Explainable<{
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
  /**
   * Whether `distanceKm` is a real computed distance. Absent (legacy mock data)
   * is treated as available. `false` means no coordinates exist, so the UI must
   * say "Distance unavailable" rather than print a fabricated number.
   */
  distanceAvailable?: boolean;
  /**
   * Verbatim availability label when operating hours are unknown (e.g.
   * "Availability unlisted"). Absent = derive from `isOpen`.
   */
  availabilityLabel?: string;
  /** Origin of this record — drives honest "directory" vs "demo" badges. */
  provenanceStatus?: string;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}> {}

export interface DoctorRecommendation extends Explainable<{
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
  /** Verbatim availability label when no real slot data exists. */
  availabilityLabel?: string;
  /** Origin of this record — drives honest "directory" vs "demo" badges. */
  provenanceStatus?: string;
  /** Hospitals this doctor is EXPLICITLY affiliated with (stable ids). */
  hospitalIds?: string[];
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}> {}

export interface PharmacyRecommendation extends Explainable<{
  id: string;
  name: string;
  medicineName?: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  /** Honest stock state — never a fabricated level. */
  availabilityPlaceholder: string;
  /** Price is set ONLY when a source publishes one (none do today). */
  estimatedPrice?: string;
  address: string;
  /** False when the record has no coordinates or the patient has no location. */
  distanceAvailable?: boolean;
  /** Verbatim published opening hours, or null when the source published none. */
  hoursLabel?: string | null;
  /** Source attribution shown on the card. */
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  latitude?: number;
  longitude?: number;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}> {}

export interface LabRecommendation extends Explainable<{
  id: string;
  name: string;
  testsOffered: string[];
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  homeCollectionAvailable: boolean;
  address: string;
  distanceAvailable?: boolean;
  hoursLabel?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  latitude?: number;
  longitude?: number;
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}> {}

/**
 * A real, sourced blood centre from the corridor directory. Live stock is NOT
 * represented: `stockSource` states whether a live integration exists, so the UI
 * can never imply a stock level that was not fetched.
 */
export interface BloodCentreRecommendation extends Explainable<{
  id: string;
  name: string;
  address: string;
  locality: string;
  phone?: string;
  website?: string;
  ownership?: string;
  /** 'live' only when an authorised stock service is wired up. */
  stockSource: 'live' | 'not_integrated';
  /** Associated hospital id, when a source states the association. */
  hospitalId?: string;
  route?: RouteRecommendation;
}> {}

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
  /** Strength/dosage form ONLY when verified from a data source — never invented. */
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  /** 0..1 recognition confidence; low values force an uncertainty warning. */
  recognitionConfidence?: number;
  /** True when identification is uncertain and must be verified with the label/pharmacist. */
  uncertain?: boolean;
  /** mock/live provenance for the recognition. */
  source?: 'real' | 'mock';
  /** True only when the name was verified against an authoritative database. */
  verified?: boolean;
  /** Verified common uses (from a label source), when available. */
  uses?: string[];
  /** Verified common side effects, when available. */
  sideEffects?: string[];
  /** Verified serious warnings, when available. */
  seriousWarnings?: string[];
  /** Reference/label dosage text — never a patient-specific dose. */
  referenceDosage?: string | null;
  /** Why the identification is uncertain. */
  uncertaintyReason?: string | null;
  /** Provenance entries for the medicine facts shown. */
  evidence?: { label: string; url?: string; retrievedAt?: string; supports: string }[];
  /** What could not be verified — surfaced, never hidden. */
  unverified?: string[];
}

/** Verified medicine facts + the user's own prescription instruction. */
export interface MedicineCareInfo {
  /** True only when the medicine was verified against a reference database. */
  verified: boolean;
  /** Why it is not verified (never empty when `verified` is false). */
  uncertaintyReason: string | null;
  /** Verified educational facts, each traceable to a source. */
  facts: { label: string; detail: string }[];
  /** Source labels for the facts above. */
  sources: string[];
  /** What could NOT be verified — stated, never hidden. */
  unverified: string[];
  /** The user's own prescription instruction for this medicine, when attached. */
  prescriptionInstruction: {
    asWritten: string;
    strength: string | null;
    form: string | null;
    frequency: string | null;
    timing: string | null;
    duration: string | null;
    schedule: string[];
    needsConfirmation: string[];
    page: number;
  } | null;
  /** The reference (label) dosage text — never a patient-specific dose. */
  referenceDosage: string | null;
}

/**
 * A facility recommended from the findings of an analysed report, with the
 * facility's OWN published department as the evidence for relevance.
 */
export interface ReportFacilityRecommendation {
  /** Canonical clinical specialty the finding maps to (a SERVICE, not a diagnosis). */
  specialty: string;
  /** Plain-language clinical area. */
  area: string;
  /** The department name the FACILITY itself publishes (verbatim). */
  matchedDepartment: string;
  /** The report findings that made this facility relevant. */
  findings: { testName: string; measuredValue: string; referenceRange: string; basis: string }[];
  /** Full evidence-grounded explanation rendered with the card. */
  whyRelevant: string;
  /** The facility record (rendered with the standard hospital card). */
  facility: HospitalRecommendation;
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
  /** True only when the interpretation is a clearly-labelled demo, never a real read. */
  isMockInterpretation: boolean;
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
  bloodCentres: BloodCentreRecommendation[];
  medicines: MedicineResult[];
  /**
   * Verified medicine facts + the user's own prescription instruction for the
   * medicine on screen. Present only when a medicine was resolved this turn.
   */
  medicineCareInfo?: MedicineCareInfo;
  /**
   * Facilities recommended from the findings of an analysed report, each with
   * the facility's OWN published department as evidence of relevance. Populated
   * only when a report with abnormal findings was attached.
   */
  reportFacilities?: ReportFacilityRecommendation[];
  /** Honest explanation when no facility publishes a matching service. */
  reportFacilityNotice?: string;
  /**
   * The user's OWN prescription, extracted from an attached document and shown
   * exactly as written. Present only when a prescription was actually read.
   * CareLink never creates, changes or reminds about a prescription.
   */
  prescriptionSchedule?: {
    medicine: string;
    strength: string | null;
    form: string | null;
    instruction: string;
    frequency: string | null;
    timing: string | null;
    duration: string | null;
    schedule: string[];
    needsConfirmation: string[];
    page: number;
  }[];
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
  /** Safety level assigned by the medical safety layer. */
  safetyLevel?: SafetyLevel;
  /** Structured provenance for the AI payload itself (mock/live + timestamp). */
  provenance?: AIProvenance;
  /** Clarifying prompts to keep the conversation moving. */
  followUpQuestions: string[];
  /** Renderable CTA actions (deep-link into existing flows). */
  actions: AgentAction[];
  /** Quick-reply chips. */
  suggestedReplies: string[];
}

/* ----------------------------------------------------------------------------
 * Conversation context memory
 * ------------------------------------------------------------------------- */

/**
 * Accumulated conversational context derived from prior turns by the
 * ContextManager. Lets "Hospital kavali" carry forward the diabetes context
 * from "Naaku diabetes undi" without the user repeating themselves.
 *
 * SAFETY: this is navigational context only (conditions, specialties, intents).
 * It never stores a diagnosis — only tags that help route the next query.
 */
export interface ConversationContext {
  /** Conditions mentioned across the conversation (diabetes, hypertension…). */
  conditions: string[];
  /** Clinical specialties inferred (Cardiology, Endocrinology…). */
  specialties: string[];
  /** Medicines mentioned (metformin, paracetamol…). */
  medicines: string[];
  /** Recent intents, most-recent-first (capped). */
  recentIntents: AgentIntent[];
  /** Human-readable summary used to seed explainability and follow-ups. */
  summary: string;
  /** True once a condition/specialty context has been established. */
  hasContext: boolean;
}

/* ----------------------------------------------------------------------------
 * Orchestrator request
 * ------------------------------------------------------------------------- */

export interface AgentOrchestratorRequest {
  text: string;
  documents: HealthDocument[];
  patientContext: PatientContext;
  language: AgentLanguage;
  /** Prior turns (most-recent-last) for multi-turn context memory. */
  history?: AgentMessage[];
  /** Accumulated context from earlier turns (ContextManager output). */
  conversationContext?: ConversationContext;
}

export interface AgentOrchestratorResponse {
  result: AgentResult;
  classification: IntentClassification;
  /** Updated conversation context to carry into the next turn. */
  context: ConversationContext;
  /**
   * The language the response was actually produced in (Phase 2). Equals the
   * requested language when detection was inconclusive, or the detected
   * language when the user changed language mid-conversation.
   */
  language?: AgentLanguage;
  /** The full language detection for this turn (script, code-switching, …). */
  detection?: {
    language: AgentLanguage;
    confidence: 'high' | 'medium' | 'low';
    script: string;
    codeSwitched: boolean;
    transliterated: boolean;
    reason: string;
  };
}

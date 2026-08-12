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
}

export interface DocumentAnalysis {
  category: DocumentAnalysisCategory;
  /** Extracted text placeholder — a real OCR/NLP layer fills this later. */
  extractedTextPlaceholder: string;
  /** Key phrases the mock adapter surfaces as a demo. */
  keyFindings: string[];
  /** Always true until a real analysis backend exists. */
  isMock: true;
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

export interface HospitalRecommendation {

/**
 * Mixin helper: any recommendation can carry explainability. Declared as an
 * optional intersection on each concrete recommendation type below so the UI
 * can render `recommendationScore` / `matchedReasons` when present.
 */
export type Explainable<T> = T & Partial<RecommendationReason>;

export interface HospitalRecommendation extends Explainable<{
>>>>>>> home-hero-ai-command-center
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
}> {}
>>>>>>> home-hero-ai-command-center

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
  route?: RouteRecommendation;
  rank?: RankedRecommendation;
}
}> {}
>>>>>>> home-hero-ai-command-center

export interface PharmacyRecommendation extends Explainable<{
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
}> {}
>>>>>>> home-hero-ai-command-center

export interface LabRecommendation extends Explainable<{
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
}> {}
>>>>>>> home-hero-ai-command-center

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
}

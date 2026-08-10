/**
 * CareLink-AI Agent — strongly-typed data architecture (mock intelligence layer).
 *
 * Everything here is UI/local-state only. No backend, no real medical model.
 * Response payloads are structured so cards can render them without parsing text,
 * and so a future real backend can be dropped behind the same interface.
 *
 * IMPORTANT SAFETY NOTE: this layer deliberately produces *navigational* guidance,
 * never autonomous diagnosis or prescription. Emergency intents escalate to safe
 * call-to-action UI rather than clinical claims.
 */

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------------- */

export type AgentLanguage = 'en' | 'te' | 'hi';

export type UrgencyLevel = 'routine' | 'attention' | 'urgent' | 'emergency';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type TransportMode = 'driving' | 'walking' | 'transit';

export type AttachmentKind = 'image' | 'pdf' | 'document' | 'camera' | 'unknown';

export type AttachmentStatus =
  | 'queued'
  | 'uploading'
  | 'reading'
  | 'extracting'
  | 'organizing'
  | 'preparing'
  | 'ready'
  | 'error';

/** Metadata attached to any response so cards can render badges consistently. */
export interface AgentMeta {
  confidence?: ConfidenceLevel;
  urgency?: UrgencyLevel;
  disclaimer?: string;
  sources?: string[];
}

/* ----------------------------------------------------------------------------
 * Step 16 — Route / map abstraction
 * ------------------------------------------------------------------------- */

export interface RouteResult {
  destinationName: string;
  destinationAddress: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  transportMode: TransportMode;
  /** Intent target the host app can resolve to open a real maps provider later. */
  deepLink?: {
    kind: 'hospital' | 'doctor' | 'pharmacy' | 'lab';
    id: string;
  };
}

/* ----------------------------------------------------------------------------
 * Step 5/6/7 — Recommendation models (carry deep-link ids to existing routes)
 * ------------------------------------------------------------------------- */

export interface HospitalRecommendation {
  id: string;
  /** Slug id used by the EXISTING hospital detail route: /hospitals/:hospitalId */
  detailSlug: string;
  name: string;
  rating: number;
  reviewCount: number;
  specialties: string[];
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  hasEmergency: boolean;
  hasIcu: boolean;
  is24x7: boolean;
  address: string;
  city: string;
  route?: RouteResult;
}

export interface DoctorRecommendation {
  id: string;
  /** Slug id used by the EXISTING doctor profile route: /doctors/:doctorId */
  detailSlug: string;
  fullName: string;
  specialty: string;
  hospitalName: string;
  /** Slug id linking the hospital name to the existing hospital detail route. */
  hospitalDetailSlug?: string;
  rating: number;
  reviewCount: number;
  yearsOfExperience: number;
  languages: string[];
  availabilityStatus: 'available' | 'busy' | 'limited' | 'offline';
  nextAvailableSlot: string;
  consultationFee?: string;
  acceptsNewPatients: boolean;
  route?: RouteResult;
}

export interface PharmacyRecommendation {
  id: string;
  name: string;
  medicineName?: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  isOpen: boolean;
  /** Mock placeholder only — never claim real-time stock until a real API exists. */
  availabilityPlaceholder: string;
  estimatedPrice?: string;
  address: string;
  route?: RouteResult;
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
  route?: RouteResult;
}

/* ----------------------------------------------------------------------------
 * Step 10 — Medicine model
 * ------------------------------------------------------------------------- */

export interface MedicineResult {
  id: string;
  name: string;
  commonPurpose: string;
  importantSafetyInfo: string;
  prescriptionRequired: boolean;
  /** Placeholder only — real interaction checks need a backend. */
  interactionWarningPlaceholder: string;
  pharmacyDiscoveryAction?: PharmacyRecommendation;
}

/* ----------------------------------------------------------------------------
 * Step 9 — Medical report model (mock interpretation, clearly labelled)
 * ------------------------------------------------------------------------- */

export interface MedicalReportValue {
  label: string;
  value: string;
  range?: string;
  status: 'normal' | 'attention' | 'abnormal';
}

export interface MedicalReportResult {
  id: string;
  reportTitle: string;
  sourceFileName?: string;
  summary: string;
  importantObservations: string[];
  valuesRequiringAttention: MedicalReportValue[];
  normalValues: MedicalReportValue[];
  /** Placeholder — trend comparison requires historical data not yet available. */
  trendComparisonPlaceholder: string;
  questionsToAskYourDoctor: string[];
  recommendedNextAction: string;
  /** Always rendered so users never mistake mock output for clinical advice. */
  isMockInterpretation: true;
}

/* ----------------------------------------------------------------------------
 * Step 11 — Emergency model
 * ------------------------------------------------------------------------- */

export interface EmergencyFacility {
  id: string;
  detailSlug?: string;
  name: string;
  distanceKm: number;
  estimatedTravelTimeMin: number;
  address: string;
  route?: RouteResult;
}

export interface EmergencyContactAction {
  label: string;
  phone?: string;
  /** External link (e.g. tel:) so the UI can render a real call action. */
  href?: string;
}

export interface EmergencyResponse {
  severity: UrgencyLevel;
  indicatorLabel: string;
  immediateGuidance: string[];
  recommendedNextAction: string;
  nearbyFacilities: EmergencyFacility[];
  contacts: EmergencyContactAction[];
  /** Disclaimers are mandatory for any emergency payload. */
  disclaimer: string;
}

/* ----------------------------------------------------------------------------
 * Step 4 — Symptom / disease models
 * ------------------------------------------------------------------------- */

export interface SymptomInsight {
  symptoms: string[];
  possibleSpecialties: string[];
  /** Navigational guidance only — never a diagnosis. */
  guidance: string;
  recommendedNextAction: string;
  suggestedDoctorSpecialty?: string;
}

export interface DiseaseInsight {
  diseaseName: string;
  overview: string;
  relevantSpecialties: string[];
  careNavigation: string[];
  recommendedNextAction: string;
}

/* ----------------------------------------------------------------------------
 * Step 12 — Appointment action + follow-up
 * ------------------------------------------------------------------------- */

export interface AppointmentAction {
  kind: 'book' | 'reschedule' | 'cancel' | 'view';
  doctorId?: string;
  doctorDetailSlug?: string;
  hospitalDetailSlug?: string;
  label: string;
  description: string;
}

export interface FollowUpCardData {
  title: string;
  description: string;
  reminderLabel: string;
  /** ISO date string for the proposed follow-up. */
  suggestedDate?: string;
  suggestedAction: string;
}

/* ----------------------------------------------------------------------------
 * Step 15 — Recovery tracker
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
  /** Mock only — never claim clinical monitoring. */
  isMockTracking: true;
}

/* ----------------------------------------------------------------------------
 * Step 35 — Health summary
 * ------------------------------------------------------------------------- */

export interface HealthSummaryCardData {
  title: string;
  summary: string;
  metrics: { label: string; value: string; status?: 'normal' | 'attention' | 'abnormal' }[];
  recommendedNextAction: string;
}

/* ----------------------------------------------------------------------------
 * Step 4 — Response payload union (one card per AI message)
 * ------------------------------------------------------------------------- */

export type AgentResponseKind =
  | 'symptom'
  | 'disease'
  | 'hospital'
  | 'doctor'
  | 'pharmacy'
  | 'lab'
  | 'medicine'
  | 'report'
  | 'emergency'
  | 'appointment'
  | 'route'
  | 'follow-up'
  | 'recovery'
  | 'health-summary'
  | 'text';

export interface BaseAgentResponse {
  kind: AgentResponseKind;
  title: string;
  explanation?: string;
  meta?: AgentMeta;
  /** Quick reply chips rendered under the card to keep the conversation moving. */
  suggestedReplies?: string[];
}

export interface SymptomResponse extends BaseAgentResponse {
  kind: 'symptom';
  data: SymptomInsight;
}

export interface DiseaseResponse extends BaseAgentResponse {
  kind: 'disease';
  data: DiseaseInsight;
}

export interface HospitalResponse extends BaseAgentResponse {
  kind: 'hospital';
  data: HospitalRecommendation[];
}

export interface DoctorResponse extends BaseAgentResponse {
  kind: 'doctor';
  data: DoctorRecommendation[];
}

export interface PharmacyResponse extends BaseAgentResponse {
  kind: 'pharmacy';
  data: PharmacyRecommendation[];
}

export interface LabResponse extends BaseAgentResponse {
  kind: 'lab';
  data: LabRecommendation[];
}

export interface MedicineResponse extends BaseAgentResponse {
  kind: 'medicine';
  data: MedicineResult;
}

export interface MedicalReportResponse extends BaseAgentResponse {
  kind: 'report';
  data: MedicalReportResult;
}

export interface EmergencyResponsePayload extends BaseAgentResponse {
  kind: 'emergency';
  data: EmergencyResponse;
}

export interface AppointmentResponse extends BaseAgentResponse {
  kind: 'appointment';
  data: AppointmentAction;
}

export interface RouteResponse extends BaseAgentResponse {
  kind: 'route';
  data: RouteResult;
}

export interface FollowUpResponse extends BaseAgentResponse {
  kind: 'follow-up';
  data: FollowUpCardData;
}

export interface RecoveryResponse extends BaseAgentResponse {
  kind: 'recovery';
  data: RecoveryStatus;
}

export interface HealthSummaryResponse extends BaseAgentResponse {
  kind: 'health-summary';
  data: HealthSummaryCardData;
}

export interface TextResponse extends BaseAgentResponse {
  kind: 'text';
}

export type AgentResponse =
  | SymptomResponse
  | DiseaseResponse
  | HospitalResponse
  | DoctorResponse
  | PharmacyResponse
  | LabResponse
  | MedicineResponse
  | MedicalReportResponse
  | EmergencyResponsePayload
  | AppointmentResponse
  | RouteResponse
  | FollowUpResponse
  | RecoveryResponse
  | HealthSummaryResponse
  | TextResponse;

/* ----------------------------------------------------------------------------
 * Step 17 — Intent model
 * ------------------------------------------------------------------------- */

export type AgentIntent =
  | 'symptom'
  | 'disease'
  | 'hospital'
  | 'doctor'
  | 'pharmacy'
  | 'lab'
  | 'medicine'
  | 'report'
  | 'appointment'
  | 'emergency'
  | 'route'
  | 'recovery'
  | 'general';

export interface IntentClassification {
  intent: AgentIntent;
  confidence: ConfidenceLevel;
  /** Extracted terms (specialty, condition, etc.) used to build mock responses. */
  entities: string[];
  rawInput: string;
}

/* ----------------------------------------------------------------------------
 * Step 8 — Attachments
 * ------------------------------------------------------------------------- */

export interface AgentAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mime: string;
  kind: AttachmentKind;
  status: AttachmentStatus;
  /** 0-100 progress for upload/processing pipeline. */
  progress: number;
  /** Object URL for local preview of images. */
  previewUrl?: string;
  errorMessage?: string;
}

/* ----------------------------------------------------------------------------
 * Step 12/13 — Conversation + message + patient context
 * ------------------------------------------------------------------------- */

export type AgentMessageRole = 'user' | 'assistant';

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  /** User text or assistant plain-text companion text. */
  content: string;
  createdAt: string;
  /** Structured response rendered as a result card (assistant only). */
  response?: AgentResponse;
  attachments: AgentAttachment[];
  /** Context tags surfaced in the context panel, e.g. ["Diabetes","Recent report"]. */
  contextTags: string[];
  /** Active family profile id when the message was sent. */
  patientProfileId: string;
}

export interface PatientProfile {
  id: string;
  label: string;
  relation: 'self' | 'parent' | 'child' | 'spouse' | 'other';
  /** Short context line shown in the agent UI. */
  contextSummary: string;
  contextTags: string[];
}

export interface PatientContext {
  activeProfileId: string;
  profile: PatientProfile;
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

export interface AgentStateStatus {
  status:
    | 'initial'
    | 'thinking'
    | 'processing'
    | 'uploading'
    | 'success'
    | 'empty'
    | 'no-results'
    | 'network-unavailable'
    | 'unsupported-file'
    | 'file-too-large'
    | 'analysis-unavailable'
    | 'emergency'
    | 'error';
  detail?: string;
}

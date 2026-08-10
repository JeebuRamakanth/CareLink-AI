/**
 * Service adapter interfaces for the Health Agent.
 *
 * Each adapter is a small, replaceable contract. The mock implementations live
 * alongside and read from the mock datasets. A future real backend (Supabase /
 * hospital API / maps provider / LLM / OCR) implements the same interface and
 * swaps in via the adapter registry — no UI changes required.
 */

import type {
  AgentIntent,
  AgentLanguage,
  ConfidenceLevel,
  DocumentAnalysis,
  EmergencyAssessment,
  HealthDocument,
  HospitalRecommendation,
  IntentClassification,
  LabRecommendation,
  MedicineInput,
  MedicineResult,
  PatientContext,
  PharmacyRecommendation,
  DoctorRecommendation,
  RecoveryTrend,
  RouteRecommendation,
} from '../../types';

/* ----------------------------------------------------------------------------
 * AI provider — intent understanding (mock heuristic today, LLM later)
 * ------------------------------------------------------------------------- */

export interface AIProvider {
  classify(input: string, context: PatientContext): Promise<IntentClassification>;
  /** Future: stream a natural-language explanation from an LLM. */
  explain?(intent: AgentIntent, entities: string[], language: AgentLanguage): Promise<string>;
}

/* ----------------------------------------------------------------------------
 * Search adapters
 * ------------------------------------------------------------------------- */

export interface HospitalSearchAdapter {
  search(query: string, context: PatientContext): Promise<HospitalRecommendation[]>;
  bySpecialty(specialty: string): Promise<HospitalRecommendation[]>;
}

export interface DoctorSearchAdapter {
  search(query: string, context: PatientContext): Promise<DoctorRecommendation[]>;
  bySpecialty(specialty: string): Promise<DoctorRecommendation[]>;
}

export interface PharmacySearchAdapter {
  search(medicineName: string, context: PatientContext): Promise<PharmacyRecommendation[]>;
}

export interface LaboratorySearchAdapter {
  search(query: string, context: PatientContext): Promise<LabRecommendation[]>;
}

/* ----------------------------------------------------------------------------
 * Maps / routing
 * ------------------------------------------------------------------------- */

export interface MapsRoutingAdapter {
  routeTo(destinationId: string, kind: RouteRecommendation['deepLink'] extends infer K ? K extends { kind: infer C } ? C : never : never): Promise<RouteRecommendation | null>;
}

/* ----------------------------------------------------------------------------
 * Appointment service
 * ------------------------------------------------------------------------- */

export interface AppointmentServiceAdapter {
  viewAppointmentsUrl(): string;
  bookUrl(doctorDetailSlug?: string, hospitalDetailSlug?: string): string;
  rescheduleUrl(appointmentId?: string): string;
  cancelUrl(appointmentId?: string): string;
}

/* ----------------------------------------------------------------------------
 * Document analysis (OCR/NLP placeholder)
 * ------------------------------------------------------------------------- */

export interface DocumentAnalysisAdapter {
  analyze(document: HealthDocument): Promise<DocumentAnalysis>;
}

/* ----------------------------------------------------------------------------
 * Medicine recognition
 * ------------------------------------------------------------------------- */

export interface MedicineRecognitionAdapter {
  recognize(input: MedicineInput): Promise<MedicineResult | null>;
}

/* ----------------------------------------------------------------------------
 * Recovery service
 * ------------------------------------------------------------------------- */

export interface RecoveryServiceAdapter {
  getStatus(): Promise<import('../../types').RecoveryStatus>;
  checkIn(trend: RecoveryTrend, note?: string): Promise<import('../../types').RecoveryStatus>;
}

/* ----------------------------------------------------------------------------
 * Emergency service
 * ------------------------------------------------------------------------- */

export interface EmergencyServiceAdapter {
  assess(input: string, context: PatientContext): Promise<EmergencyAssessment>;
}

/* ----------------------------------------------------------------------------
 * Registry — the orchestrator depends on this bag of adapters, not concrete impls.
 * ------------------------------------------------------------------------- */

export interface AgentAdapters {
  ai: AIProvider;
  hospitals: HospitalSearchAdapter;
  doctors: DoctorSearchAdapter;
  pharmacies: PharmacySearchAdapter;
  labs: LaboratorySearchAdapter;
  maps: MapsRoutingAdapter;
  appointments: AppointmentServiceAdapter;
  documents: DocumentAnalysisAdapter;
  medicines: MedicineRecognitionAdapter;
  recovery: RecoveryServiceAdapter;
  emergency: EmergencyServiceAdapter;
}

export type { ConfidenceLevel };

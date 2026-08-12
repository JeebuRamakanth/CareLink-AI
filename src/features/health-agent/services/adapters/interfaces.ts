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
  RouteTargetKind,
  TransportMode,
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

export interface RouteRecommendationLike {
  deepLink?: { kind: RouteTargetKind; id: string };
}

export interface MapsRoutingAdapter {
  routeTo(destinationId: string, kind: RouteTargetKind): Promise<RouteRecommendation | null>;
}

export interface MapsProvider {
  /** Build a directions deep-link URL (no key required for public maps URL). */
  directionsUrl(params: { destination: string; origin?: { label: string; lat?: number; lng?: number }; mode?: TransportMode }): string;
  /** Build a place-search deep-link URL. */
  placeUrl(query: string): string;
  /** Name for badges/logging. */
  readonly name: string;
}

export interface DirectionsProvider {
  /** Live route data; returns null when no real provider is available. */
  route(origin: { lat?: number; lng?: number; label?: string }, destination: { lat?: number; lng?: number; label?: string }): Promise<RouteRecommendation | null>;
  /** Whether the provider can compute live distance/ETA right now. */
  readonly available: boolean;
}

export interface GeocodingProvider {
  /** Resolve a free-text address to coordinates; null when unavailable. */
  geocode(address: string): Promise<{ lat: number; lng: number; label: string } | null>;
  /** Reverse-geocode coordinates to a human address; null when unavailable. */
  reverseGeocode(coords: { lat: number; lng: number }): Promise<string | null>;
  readonly available: boolean;
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
 * Storage (Cloudinary-style) — upload boundary for images/documents
 * ------------------------------------------------------------------------- */

export interface StorageUploadResult {
  /** Public URL of the stored asset, or a local blob URL in mock mode. */
  url: string;
  /** Optional optimized/preview URL for the UI. */
  previewUrl?: string;
  /** Provider-side metadata (public id, version, format). */
  providerMetadata?: Record<string, string>;
  /** Whether this came from a real provider or the mock/local adapter. */
  source: 'real' | 'mock';
}

export interface StorageProvider {
  upload(file: File, options?: { folder?: string; signal?: AbortSignal }): Promise<StorageUploadResult>;
  /** Whether a real storage backend is configured. */
  readonly available: boolean;
  readonly name: string;
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
  mapsProvider: MapsProvider;
  directions: DirectionsProvider;
  geocoding: GeocodingProvider;
  storage: StorageProvider;
  appointments: AppointmentServiceAdapter;
  documents: DocumentAnalysisAdapter;
  medicines: MedicineRecognitionAdapter;
  recovery: RecoveryServiceAdapter;
  emergency: EmergencyServiceAdapter;
}

export type { ConfidenceLevel };

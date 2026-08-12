/**
 * CareLink-AI — database row types (Step 10).
 *
 * Strongly-typed shapes for every table in supabase/migrations. These mirror the
 * SQL schema so the UI never consumes vendor-specific response shapes —
 * repositories convert raw Supabase rows into these CareLink types.
 *
 * SECURITY: these types intentionally avoid storing PHI text fields in logs.
 * Repository code must use `safeLog` from `src/lib/security` if it logs at all.
 */

type ISODate = string;

export interface ProfileRow {
  id: string;
  display_name: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  location_preference: string | null;
  language_preference: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  communication_preferences: Record<string, unknown> | null;
  avatar_url: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export type FamilyRelation = 'self' | 'parent' | 'child' | 'spouse' | 'other';

export interface FamilyProfileRow {
  id: string;
  owner_id: string;
  relation: FamilyRelation;
  label: string;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  context_summary: string | null;
  context_tags: string[] | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface HealthContextRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  active_symptoms: string[] | null;
  chronic_conditions: string[] | null;
  allergies: string[] | null;
  current_medications: string[] | null;
  notes: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export type DocumentKind = 'image' | 'pdf' | 'document' | 'lab_report' | 'prescription' | 'medicine_image' | 'other';
export type DocumentUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
export type DocumentProcessingStatus = 'queued' | 'processing' | 'ready' | 'error';

export interface MedicalDocumentRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  document_kind: DocumentKind | null;
  upload_status: DocumentUploadStatus;
  processing_status: DocumentProcessingStatus;
  extracted_text_placeholder: string | null;
  provider_metadata: Record<string, unknown> | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface MedicalReportRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  medical_document_id: string | null;
  report_title: string | null;
  summary: string | null;
  important_observations: unknown[] | null;
  values_requiring_attention: unknown[] | null;
  normal_values: unknown[] | null;
  questions_for_doctor: unknown[] | null;
  recommended_next_action: string | null;
  is_mock_interpretation: boolean;
  provider_metadata: Record<string, unknown> | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface MedicineRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  name: string;
  common_purpose: string | null;
  important_safety_info: string | null;
  prescription_required: boolean;
  medicine_image_document_id: string | null;
  provider_metadata: Record<string, unknown> | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export type AppointmentStatus = 'confirmed' | 'upcoming' | 'completed' | 'cancelled' | 'rescheduled';
export type AppointmentType = 'Consultation' | 'Follow-up' | 'Telehealth';

export interface AppointmentRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  specialty: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  appointment_type: AppointmentType | null;
  scheduled_date: string;
  scheduled_time: string;
  status: AppointmentStatus;
  consultation_fee: string | null;
  notes: string | null;
  preparation_notes: string | null;
  consultation_mode: string | null;
  location: string | null;
  booking_timestamp: ISODate;
  created_at: ISODate;
  updated_at: ISODate;
}

export type AppointmentEventType = 'booked' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';

export interface AppointmentEventRow {
  id: string;
  appointment_id: string;
  owner_id: string;
  event_type: AppointmentEventType;
  previous_date: string | null;
  previous_time: string | null;
  reason: string | null;
  occurred_at: ISODate;
}

export type RecoveryTrend = 'better' | 'same' | 'worse';

export interface RecoveryCheckInRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  appointment_id: string | null;
  condition_label: string | null;
  trend: RecoveryTrend;
  note: string | null;
  recorded_at: ISODate;
}

export interface VaccinationRecordRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  vaccine_name: string;
  dose_number: number | null;
  administered_date: string | null;
  next_due_date: string | null;
  provider: string | null;
  notes: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface ConversationRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  title: string;
  language: string | null;
  intent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  owner_id: string;
  role: 'user' | 'assistant';
  content: string | null;
  response: unknown | null;
  attachments: unknown[] | null;
  context_tags: string[] | null;
  patient_profile_id: string | null;
  intent: string | null;
  actions: unknown[] | null;
  created_at: ISODate;
}

export interface SavedHospitalRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  hospital_id: string;
  detail_slug: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface SavedDoctorRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  doctor_id: string;
  detail_slug: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface SavedPharmacyRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  pharmacy_id: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface SavedLabRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  lab_id: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface EmergencyEventRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  severity: string | null;
  indicator_label: string | null;
  guidance: unknown[] | null;
  contacts: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface AuditEventRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  safe_message: string | null;
  created_at: ISODate;
}

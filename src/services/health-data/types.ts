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
  /** Additive (0010): link to appointment_slots; double-booking-protected. */
  slot_id: string | null;
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

/* ===========================================================================
 * Step 10.5 row types (migrations 0003–0018). Mirrors the SQL schema exactly.
 * ========================================================================== */

/* ---- Master data (0004) ---- */
export interface SpecialtyRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface ConditionRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface SymptomRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

/* ---- Provider ecosystem (0005) ---- */
export interface HospitalRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface HospitalLocationRow {
  id: string;
  hospital_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: ISODate;
}

export interface HospitalServiceRow {
  id: string;
  hospital_id: string;
  service_name: string;
  description: string | null;
  created_at: ISODate;
}

export interface HospitalHourRow {
  id: string;
  hospital_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_24_hours: boolean;
  created_at: ISODate;
}

export interface EmergencyCapabilitiesRow {
  id: string;
  hospital_id: string;
  has_emergency_department: boolean;
  has_ambulance: boolean;
  has_icu: boolean;
  capabilities: Record<string, unknown>;
  created_at: ISODate;
}

export interface DoctorRow {
  id: string;
  slug: string;
  name: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  years_experience: number | null;
  bio: string | null;
  photo_url: string | null;
  languages: string[] | null;
  rating: number | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface DoctorAvailabilityRow {
  id: string;
  doctor_id: string;
  hospital_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  created_at: ISODate;
}

export interface ConsultationFeeRow {
  id: string;
  doctor_id: string;
  hospital_id: string | null;
  appointment_type: AppointmentType | null;
  fee: number;
  currency: string;
  created_at: ISODate;
}

export interface PharmacyRow {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone_number: string | null;
  rating: number | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface PharmacyMedicineRow {
  id: string;
  pharmacy_id: string;
  medicine_name: string;
  brand: string | null;
  dosage_form: string | null;
  strength: string | null;
  created_at: ISODate;
}

export interface LabRow {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone_number: string | null;
  rating: number | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface LabTestRow {
  id: string;
  lab_id: string;
  test_name: string;
  description: string | null;
  price: number | null;
  created_at: ISODate;
}

export type LabBookingStatus = 'scheduled' | 'completed' | 'cancelled';

export interface LabBookingRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  lab_id: string;
  lab_test_id: string | null;
  scheduled_at: ISODate;
  status: LabBookingStatus;
  created_at: ISODate;
  updated_at: ISODate;
}

/* ---- RBAC (0006) ---- */
export type CareLinkRole =
  | 'patient'
  | 'doctor'
  | 'hospital_admin'
  | 'pharmacy_admin'
  | 'lab_admin'
  | 'admin'
  | 'super_admin';

export interface UserRoleRow {
  id: string;
  user_id: string;
  role_id: CareLinkRole;
  granted_by: string | null;
  granted_at: ISODate;
}

export type ProviderKind = 'hospital' | 'pharmacy' | 'lab';

export interface ProviderMembershipRow {
  id: string;
  user_id: string;
  provider_kind: ProviderKind;
  hospital_id: string | null;
  pharmacy_id: string | null;
  lab_id: string | null;
  created_at: ISODate;
}

export interface DoctorUserLinkRow {
  id: string;
  user_id: string;
  doctor_id: string;
  status: 'pending' | 'approved' | 'revoked';
  approved_by: string | null;
  created_at: ISODate;
}

/* ---- Reviews (0007) ---- */
export type ReviewStatus = 'published' | 'pending' | 'hidden' | 'removed';

export interface ReviewRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  hospital_id: string | null;
  doctor_id: string | null;
  pharmacy_id: string | null;
  lab_id: string | null;
  appointment_id: string | null;
  title: string | null;
  body: string | null;
  overall_rating: number;
  status: ReviewStatus;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface ReviewVerificationRow {
  id: string;
  review_id: string;
  verified_interaction: boolean;
  appointment_id: string | null;
  verified_at: ISODate | null;
  created_at: ISODate;
}

export interface ProviderResponseRow {
  id: string;
  review_id: string;
  responder_id: string;
  body: string;
  created_at: ISODate;
  updated_at: ISODate;
}

/* ---- Recommendation provenance (0008) ---- */
export interface AgentRecommendationRow {
  id: string;
  owner_id: string;
  patient_profile_id: string | null;
  conversation_id: string | null;
  entity_type: 'hospital' | 'doctor' | 'pharmacy' | 'lab';
  entity_id: string;
  relevance_score: number | null;
  distance_score: number | null;
  rating_score: number | null;
  availability_score: number | null;
  specialty_score: number | null;
  emergency_score: number | null;
  cost_score: number | null;
  overall_score: number | null;
  matched_reasons: string[];
  source: string;
  is_mock: boolean;
  fetched_at: ISODate;
  created_at: ISODate;
}

/* ---- AI backend (0009) ---- */
export interface PatientContextSnapshotRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  conversation_id: string | null;
  snapshot: Record<string, unknown>;
  language: string;
  created_at: ISODate;
}

export interface AgentIntentRow {
  id: string;
  owner_id: string;
  conversation_id: string | null;
  message_id: string | null;
  intent: string;
  confidence: 'low' | 'medium' | 'high' | null;
  created_at: ISODate;
}

export interface AgentActionRow {
  id: string;
  owner_id: string;
  conversation_id: string | null;
  action: string;
  parameters: Record<string, unknown>;
  status: 'suggested' | 'completed' | 'dismissed';
  created_at: ISODate;
}

export interface AgentFeedbackRow {
  id: string;
  owner_id: string;
  conversation_id: string | null;
  message_id: string | null;
  rating: -1 | 0 | 1;
  comment: string | null;
  created_at: ISODate;
}

export interface AgentFollowupRow {
  id: string;
  owner_id: string;
  conversation_id: string | null;
  question: string;
  source_intent: string | null;
  status: 'offered' | 'answered' | 'dismissed';
  due_at: ISODate | null;
  created_at: ISODate;
}

/* ---- Appointment expansion (0010) ---- */
export interface AppointmentSlotRow {
  id: string;
  doctor_id: string;
  hospital_id: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  status: 'open' | 'blocked';
  created_at: ISODate;
  updated_at: ISODate;
}

export interface AppointmentStatusHistoryRow {
  id: string;
  appointment_id: string;
  owner_id: string;
  old_status: AppointmentStatus | null;
  new_status: AppointmentStatus;
  changed_by: string | null;
  changed_at: ISODate;
}

export type ReminderStatus = 'scheduled' | 'sent' | 'cancelled';

export interface ReminderRow {
  id: string;
  owner_id: string;
  appointment_id: string;
  remind_at: ISODate;
  channel: 'in_app' | 'email' | 'sms';
  status: ReminderStatus;
  payload: Record<string, unknown>;
  created_at: ISODate;
}

/* ---- Medication scheduling (0011) ---- */
export interface MedicineMasterRow {
  id: string;
  name: string;
  common_purpose: string | null;
  prescription_required: boolean;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export type DosageSource = 'clinician' | 'verified' | 'user_entered_prescription';
export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'every_8_hours'
  | 'weekly'
  | 'custom';

export interface MedicationScheduleRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  medicine_master_id: string | null;
  medicine_name: string;
  dosage_label: string | null;
  dosage_source: DosageSource;
  frequency: MedicationFrequency;
  times_of_day: string[];
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export type MedicationLogStatus = 'taken' | 'missed' | 'skipped';

export interface MedicationLogRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  medication_schedule_id: string;
  scheduled_for: ISODate;
  taken_at: ISODate | null;
  status: MedicationLogStatus;
  note: string | null;
  created_at: ISODate;
}

export interface ScheduledMedicationReminderRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  medication_schedule_id: string;
  schedule_time: ISODate;
  /** Always schedule_time - 30 minutes (database-trigger enforced). */
  reminder_time: ISODate;
  channel: 'in_app' | 'email' | 'sms';
  status: 'scheduled' | 'sent' | 'dismissed';
  created_at: ISODate;
}

/* ---- Recovery expansion (0012) ---- */
export interface RecoveryPlanRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  appointment_id: string | null;
  condition_label: string | null;
  plan: Record<string, unknown>;
  status: 'active' | 'completed' | 'cancelled';
  started_at: ISODate;
  ended_at: ISODate | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface RecoveryFollowupQuestionRow {
  id: string;
  owner_id: string;
  recovery_plan_id: string;
  question: string;
  answer: string | null;
  asked_at: ISODate;
  answered_at: ISODate | null;
}

export interface RecoveryEscalationEventRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  recovery_plan_id: string | null;
  checkin_id: string | null;
  trend_snapshot: RecoveryTrend | null;
  reason: string | null;
  created_at: ISODate;
}

/* ---- Health timeline (0013) ---- */
export type HealthTimelineEventType =
  | 'report'
  | 'lab_test'
  | 'prescription'
  | 'appointment'
  | 'hospital_visit'
  | 'medication'
  | 'vaccination'
  | 'recovery'
  | 'follow_up';

export interface HealthTimelineEventRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  event_type: HealthTimelineEventType;
  medical_document_id: string | null;
  medical_report_id: string | null;
  appointment_id: string | null;
  vaccination_record_id: string | null;
  recovery_checkin_id: string | null;
  medication_schedule_id: string | null;
  title: string;
  summary: string | null;
  occurred_at: ISODate;
  metadata: Record<string, unknown>;
  created_at: ISODate;
}

/* ---- Notifications (0014) ---- */
export type NotificationKind =
  | 'appointment'
  | 'medication'
  | 'vaccination'
  | 'recovery'
  | 'donor_request'
  | 'sos'
  | 'ai_followup';

export type NotificationStatus = 'scheduled' | 'pending' | 'sent' | 'read' | 'failed' | 'cancelled';

export interface NotificationRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  template_code: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  scheduled_for: ISODate;
  sent_at: ISODate | null;
  status: NotificationStatus;
  created_at: ISODate;
}

/* ---- SOS workflow (0015) ---- */
export type HospitalEmergencyNotificationStatus = 'sent' | 'accepted' | 'rejected' | 'expired';
export type AmbulanceStatus = 'requested' | 'assigned' | 'en_route' | 'arrived' | 'completed' | 'cancelled';

export interface HospitalEmergencyNotificationRow {
  id: string;
  emergency_event_id: string;
  owner_id: string;
  hospital_id: string;
  status: HospitalEmergencyNotificationStatus;
  responded_by: string | null;
  responded_at: ISODate | null;
  created_at: ISODate;
}

export interface AmbulanceRequestRow {
  id: string;
  emergency_event_id: string;
  owner_id: string;
  hospital_id: string;
  status: AmbulanceStatus;
  requested_at: ISODate;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface AmbulanceStatusRow {
  id: string;
  ambulance_request_id: string;
  owner_id: string;
  status: AmbulanceStatus;
  note: string | null;
  recorded_by: string | null;
  recorded_at: ISODate;
}

export interface EmergencyEventHistoryRow {
  id: string;
  emergency_event_id: string;
  owner_id: string;
  from_state: string | null;
  to_state: string;
  actor_id: string | null;
  note: string | null;
  created_at: ISODate;
}

/* ---- Blood donation (0016) ---- */
export type BloodGroupCode = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface DonorProfileRow {
  id: string;
  owner_id: string;
  blood_group_code: BloodGroupCode;
  city: string | null;
  phone: string | null;
  date_of_birth: string | null;
  is_active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export type BloodRequestStatus = 'open' | 'fulfilled' | 'cancelled' | 'expired';
export type BloodRequestUrgency = 'routine' | 'urgent' | 'critical';

export interface BloodRequestRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  blood_group_code: BloodGroupCode;
  units_needed: number;
  hospital_id: string | null;
  city: string | null;
  urgency: BloodRequestUrgency;
  status: BloodRequestStatus;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface DonorMatchResultRow {
  id: string;
  blood_request_id: string;
  owner_id: string;
  donor_profile_id: string;
  matched_at: ISODate;
  notified: boolean;
}

export type DonorRequestStatus = 'sent' | 'accepted' | 'declined' | 'expired';

export interface DonorRequestRow {
  id: string;
  blood_request_id: string;
  donor_profile_id: string;
  owner_id: string;
  status: DonorRequestStatus;
  responded_at: ISODate | null;
  created_at: ISODate;
}

export interface DonorNotificationRow {
  id: string;
  donor_request_id: string | null;
  donor_profile_id: string;
  kind: 'match' | 'request' | 'reminder' | 'result';
  payload: Record<string, unknown>;
  sent_at: ISODate;
}

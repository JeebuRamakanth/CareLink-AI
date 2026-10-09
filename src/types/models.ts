export type EntityStatus = 'active' | 'inactive' | 'pending' | 'maintenance' | 'archived';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type EmergencySeverity = 'critical' | 'high' | 'medium' | 'low';

export type BloodDonorStatus = 'available' | 'unavailable' | 'on_hold' | 'inactive';

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
}

/**
 * Honest provenance for directory records. Distinguishes officially verified
 * data from provider-supplied, third-party directory, and development fixtures
 * so the UI never presents a third-party listing as verified.
 */
export type DataStatus =
  | 'VERIFIED'
  | 'PROVIDER_LISTED'
  | 'SOURCE_LISTED'
  | 'THIRD_PARTY_DIRECTORY'
  | 'DEVELOPMENT_SEED';

export interface DataProvenance {
  /** Who/what produced the record, e.g. 'krishna.ap.gov.in', 'star-health'. */
  data_source: string;
  /** Public URL of the source the record was derived from (when available). */
  source_url?: string;
  /** Provider-specific external id / reference (when available). */
  source_ref?: string;
  /** When the record was last fetched/derived from the source (ISO date). */
  fetched_at?: string;
  data_status: DataStatus;
}

export interface Hospital extends BaseEntity {
  status: EntityStatus;
  name: string;
  slug: string;
  type: 'hospital' | 'medical_center' | 'specialty_center' | 'emergency_center';
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  email?: string;
  website?: string;
  specialties: string[];
  departments: string[];
  facilities: {
    emergency: boolean;
    icu: boolean;
    ambulance: boolean;
    blood_bank: boolean;
    parking: boolean;
    twenty_four_hours: boolean;
    telehealth: boolean;
  };
  rating: number;
  review_count: number;
  distance_km?: number;
  availability_status: 'open' | 'busy' | 'limited' | 'closed' | null;
  image_url?: string;
  timezone?: string;
  insurance_partners?: string[];
  emergency_contact?: string;
  tags?: string[];
  is_verified?: boolean;
  doctor_count?: number;
  provenance?: DataProvenance;
}

export interface HospitalFilters {
  city?: string;
  department?: string;
  specialty?: string;
  emergency?: boolean;
  twenty_four_hours?: boolean;
  icu?: boolean;
  ambulance?: boolean;
  blood_bank?: boolean;
  parking?: boolean;
  insurance?: boolean;
  rating_min?: number;
  distance_max_km?: number;
  sort_by?: 'recommended' | 'highest_rated' | 'nearest' | 'twenty_four_hours';
}

export interface Doctor extends BaseEntity {
  status: EntityStatus;
  first_name: string;
  last_name: string;
  full_name: string;
  specialty: string;
  sub_specialties: string[];
  bio: string;
  hospital_ids: string[];
  location: string;
  city: string;
  state: string;
  country: string;
  years_of_experience: number;
  education: string[];
  languages: string[];
  consultation_modes: string[];
  rating: number;
  review_count: number;
  availability_status: 'available' | 'busy' | 'limited' | 'offline' | null;
  is_verified: boolean;
  accepts_new_patients: boolean;
  phone?: string;
  email?: string;
  image_url?: string;
  next_available_at?: string;
  license_number?: string;
  provenance?: DataProvenance;
}

export interface DoctorFilters {
  specialty?: string;
  location?: string;
  hospital_id?: string;
  availability?: 'available' | 'busy' | 'limited' | 'offline';
  rating_min?: number;
  accepts_new_patients?: boolean;
  sort_by?: 'recommended' | 'highest_rated' | 'experience' | 'availability';
}

export interface Review extends BaseEntity {
  patient_name: string;
  patient_initials: string;
  patient_verified: boolean;
  subject_type: 'Doctor' | 'Hospital';
  subject_name: string;
  rating: number;
  title: string;
  comment: string;
  reviewed_at: string;
}

export interface PatientProfile extends BaseEntity {
  status: EntityStatus;
  user_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
  blood_group?: string;
  emergency_contact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  medical_notes?: string[];
  consent_flags?: Record<string, boolean>;
  preferred_language?: string;
}

export interface Appointment extends BaseEntity {
  status: AppointmentStatus;
  patient_id: string;
  doctor_id: string;
  hospital_id?: string;
  scheduled_at: string;
  appointment_type: 'consultation' | 'follow_up' | 'emergency' | 'telehealth' | 'lab';
  reason: string;
  notes?: string;
  confirmation_code?: string;
}

export interface EmergencyRequest extends BaseEntity {
  status: 'pending' | 'dispatched' | 'arrived' | 'resolved' | 'cancelled';
  patient_id?: string;
  requested_by?: string;
  incident_type: 'medical' | 'trauma' | 'cardiac' | 'pediatric' | 'obstetric' | 'other';
  severity: EmergencySeverity;
  location: string;
  city: string;
  state?: string;
  description?: string;
  hospital_id?: string;
  assigned_unit?: string;
  requested_at: string;
}

export interface BloodDonor extends BaseEntity {
  status: BloodDonorStatus;
  full_name: string;
  email?: string;
  phone?: string;
  blood_group: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  city: string;
  state?: string;
  country: string;
  available: boolean;
  last_donation_at?: string;
  medical_eligibility: boolean;
  preferred_contact: 'sms' | 'email' | 'call';
}

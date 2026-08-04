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
  availability_status: 'open' | 'busy' | 'limited' | 'closed';
  image_url?: string;
  timezone?: string;
  insurance_partners?: string[];
  emergency_contact?: string;
  tags?: string[];
  is_verified?: boolean;
  doctor_count?: number;
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
  availability_status: 'available' | 'busy' | 'limited' | 'offline';
  is_verified: boolean;
  accepts_new_patients: boolean;
  phone?: string;
  email?: string;
  image_url?: string;
  next_available_at?: string;
  license_number?: string;
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

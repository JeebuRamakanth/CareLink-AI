import type { Doctor } from '../types';

/**
 * CareLink-AI — doctor directory data.
 *
 * OFFLINE / DEMO fallback for the Doctor directory (Supabase registry used when
 * configured — see `src/services/health-data/providerDiscovery.ts`).
 *
 * SOURCING & HONESTY RULES (non-negotiable):
 *   - Region: Machilipatnam, Krishna District, Andhra Pradesh, India.
 *   - Only practitioners whose name, role and hospital/clinic are attributable
 *     to a public source are listed. Nothing is invented.
 *   - Qualification / experience / registration numbers are only set when a
 *     source states them; otherwise they are left empty or 0.
 *   - `is_verified` is false for every record here: a directory listing or a
 *     provider's own website is NOT proof of credentials. Real verification only
 *     happens in the database via the guarded verification workflow.
 *   - `rating` / `review_count` are 0 until real, eligible patient reviews exist.
 *   - No portraits are fabricated; `image_url` is omitted so the UI shows the
 *     existing fallback avatar rather than a random person's photo.
 *
 * Sources (checked 2026-10-09):
 *   - muralikrishnahospital.com, savehospitalmachilipatnam.com
 *   - apollo247.com (third-party directory), public directory listings
 */

const CREATED = '2026-10-09T00:00:00.000Z';

export const doctorsData: Doctor[] = [
  {
    id: 'doc-murali-krishna',
    created_at: CREATED,
    updated_at: CREATED,
    status: 'active',
    first_name: 'K.',
    last_name: 'Murali Krishna',
    full_name: 'Dr. K. Murali Krishna',
    specialty: 'General Medicine',
    sub_specialties: [],
    bio: 'General physician (MD) and chief doctor at Murali Krishna Hospital, Machilipatnam, providing daily outpatient consultation and emergency support since 2009.',
    hospital_ids: ['mph-murali-krishna'],
    location: 'Machilipatnam, Andhra Pradesh',
    city: 'Machilipatnam',
    state: 'Andhra Pradesh',
    country: 'India',
    years_of_experience: 0,
    education: ['MBBS', 'MD (Physician)'],
    languages: ['Telugu', 'English'],
    consultation_modes: ['In-person'],
    rating: 0,
    review_count: 0,
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    image_url: undefined,
    provenance: {
      data_source: 'muralikrishnahospital.com',
      source_url: 'https://muralikrishnahospital.com',
      data_status: 'PROVIDER_LISTED',
      fetched_at: '2026-10-09',
    },
  },
  {
    id: 'doc-venkat-basu',
    created_at: CREATED,
    updated_at: CREATED,
    status: 'active',
    first_name: 'Venkat',
    last_name: 'Basu',
    full_name: 'Dr. Venkat Basu',
    specialty: 'Orthopaedics',
    sub_specialties: ['Joint Replacement'],
    bio: "Consultant orthopaedic and joint-replacement surgeon practising at Dr. Venkat Basu's Bone & Joint Clinic, Machilipatnam.",
    hospital_ids: ['mph-venkat-basu-clinic', 'mph-andhra-hospitals'],
    location: 'Machilipatnam, Andhra Pradesh',
    city: 'Machilipatnam',
    state: 'Andhra Pradesh',
    country: 'India',
    years_of_experience: 0,
    education: ['Consultant Orthopaedic & Joint Replacement Surgeon'],
    languages: ['Telugu', 'English'],
    consultation_modes: ['In-person'],
    rating: 0,
    review_count: 0,
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    phone: '6309955880',
    image_url: undefined,
    provenance: {
      data_source: 'public directory listing',
      data_status: 'THIRD_PARTY_DIRECTORY',
      fetched_at: '2026-10-09',
    },
  },
  {
    id: 'doc-tejaswi-ponnam',
    created_at: CREATED,
    updated_at: CREATED,
    status: 'active',
    first_name: 'Tejaswi',
    last_name: 'Ponnam',
    full_name: 'Dr. Tejaswi Ponnam',
    specialty: 'General Medicine',
    sub_specialties: ['Internal Medicine'],
    bio: 'General physician and internal medicine specialist consulting at H & H Clinic, Machilipatnam.',
    hospital_ids: ['mph-hh-clinic'],
    location: 'Machilipatnam, Andhra Pradesh',
    city: 'Machilipatnam',
    state: 'Andhra Pradesh',
    country: 'India',
    years_of_experience: 0,
    education: ['MBBS', 'MD (General Medicine)'],
    languages: ['Telugu', 'English'],
    consultation_modes: ['In-person'],
    rating: 0,
    review_count: 0,
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    image_url: undefined,
    provenance: {
      data_source: 'Apollo 24|7 directory',
      source_url: 'https://www.apollo247.com/doctors/lady-doctors-in-machilipatnam-dcity',
      data_status: 'THIRD_PARTY_DIRECTORY',
      fetched_at: '2026-10-09',
    },
  },
  {
    id: 'doc-sandeep-vemu',
    created_at: CREATED,
    updated_at: CREATED,
    status: 'active',
    first_name: 'Sandeep',
    last_name: 'Vemu',
    full_name: 'Dr. Sandeep Vemu',
    specialty: 'ENT',
    sub_specialties: [],
    bio: 'ENT specialist and co-founder of SAVE Multi-Speciality Hospital, Machilipatnam.',
    hospital_ids: ['mph-save-hospital'],
    location: 'Machilipatnam, Andhra Pradesh',
    city: 'Machilipatnam',
    state: 'Andhra Pradesh',
    country: 'India',
    years_of_experience: 0,
    education: [],
    languages: ['Telugu', 'English'],
    consultation_modes: ['In-person'],
    rating: 0,
    review_count: 0,
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    image_url: undefined,
    provenance: {
      data_source: 'savehospitalmachilipatnam.com',
      source_url: 'https://savehospitalmachilipatnam.com/en',
      data_status: 'PROVIDER_LISTED',
      fetched_at: '2026-10-09',
    },
  },
  {
    id: 'doc-praveena-madasu',
    created_at: CREATED,
    updated_at: CREATED,
    status: 'active',
    first_name: 'Praveena',
    last_name: 'Madasu',
    full_name: 'Dr. Praveena Madasu',
    specialty: 'Ophthalmology',
    sub_specialties: [],
    bio: 'Ophthalmologist and co-founder of SAVE Multi-Speciality Hospital, Machilipatnam.',
    hospital_ids: ['mph-save-hospital'],
    location: 'Machilipatnam, Andhra Pradesh',
    city: 'Machilipatnam',
    state: 'Andhra Pradesh',
    country: 'India',
    years_of_experience: 0,
    education: [],
    languages: ['Telugu', 'English'],
    consultation_modes: ['In-person'],
    rating: 0,
    review_count: 0,
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    image_url: undefined,
    provenance: {
      data_source: 'savehospitalmachilipatnam.com',
      source_url: 'https://savehospitalmachilipatnam.com/en',
      data_status: 'PROVIDER_LISTED',
      fetched_at: '2026-10-09',
    },
  },
];

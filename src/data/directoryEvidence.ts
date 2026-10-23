/**
 * CareLink-AI — hospital department directory (SOURCE-ATTRIBUTED CURATED EVIDENCE).
 *
 * A department is attached to a hospital ONLY when a facility-specific source
 * states it. Every entry carries the exact source URL and the date it was read.
 * The catalogue of possible department names is NEVER used as evidence that a
 * hospital runs that department.
 *
 * SOURCES (checked 2026-10-22)
 *   - Government Medical College Machilipatnam — official departments page
 *     https://www.gmcmachilipatnam-ap-gov.com/departments/
 *   - Murali Krishna Hospital — official doctors & services pages
 *     https://muralikrishnahospital.com/doctors  ·  /services
 *   - SAVE Multi-Speciality Hospital — official services page
 *     https://savehospitalmachilipatnam.com/en/services
 *   - Dr. Madhu Super Speciality Hospital — official branch service page
 *     https://madhuneuro.com/machilipatnam/
 *
 * HONESTY RULES
 *   - `evidence_status` is 'published': a facility-specific source names it.
 *   - `appointment_capable` is true only when the facility publishes an
 *     appointment path (a booking page / an appointment request form). It is
 *     NOT a claim that a slot is currently free.
 *   - No department phone, floor or opening hours are invented; those fields are
 *     present only when the cited page stated them.
 */

import type { HospitalDepartment, DoctorAffiliation } from '../types';

const CHECKED = '2026-10-22';
const CREATED = '2026-10-22T00:00:00.000Z';

/** Stable department id from hospital + canonical name. */
export function departmentId(hospitalId: string, name: string): string {
  return `dept-${hospitalId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** Stable affiliation id from doctor + hospital. */
export function affiliationId(doctorId: string, hospitalId: string): string {
  return `aff-${doctorId}-${hospitalId}`;
}

interface DepartmentSeed {
  hospitalId: string;
  name: string;
  specialtyCategory?: string;
  description?: string;
  services?: string[];
  appointmentCapable?: boolean;
  sourceLabel: string;
  sourceUrl: string;
}

/**
 * Department evidence. Each row names the facility-specific page it came from.
 * `hospitalId` values are the stable ids in the generated directory
 * (src/data/hospitals.ts) — the curated migration-0031 ids for the reviewed
 * Machilipatnam facilities, and the NTR/Krishna government listing ids.
 */
const DEPARTMENT_SEEDS: DepartmentSeed[] = [
  // --- Government Medical College & Teaching General Hospital, Machilipatnam ---
  // The college's official Departments page lists each teaching department.
  ...['Anaesthesiology', 'Anatomy', 'Bio-Chemistry', 'Community Medicine', 'Dentistry', 'Dermatology',
    'ENT', 'Forensic Medicine', 'General Medicine', 'General Surgery', 'Gynecology', 'Micro Biology',
    'Orthopedics', 'Paediatrics', 'Pathology', 'Pharmacology', 'Physiology', 'Psychiatry', 'Pulmonology',
    'Radiology', 'Emergency Medicine'].map((name): DepartmentSeed => ({
    hospitalId: '7f100002-0000-0000-0000-000000000002',
    name,
    appointmentCapable: false,
    sourceLabel: 'Government Medical College Machilipatnam — Departments',
    sourceUrl: 'https://www.gmcmachilipatnam-ap-gov.com/departments/',
  })),

  // --- Murali Krishna Hospital, Machilipatnam ---
  {
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    name: 'General Medicine',
    specialtyCategory: 'Medicine',
    services: ['Outpatient consultation', 'Emergency support'],
    appointmentCapable: true,
    sourceLabel: 'Murali Krishna Hospital — Doctors & Services',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  ...['Orthopaedics', 'General Surgery', 'Obstetrics & Gynaecology', 'Dermatology', 'Rheumatology',
    'Psychiatry', 'Neurology', 'Gastroenterology', 'Cardiology', 'Pulmonology', 'Nephrology']
    .map((name): DepartmentSeed => ({
      hospitalId: '7f100007-0000-0000-0000-000000000007',
      name,
      description: 'Visiting specialist department listed on the hospital’s published doctors roster.',
      appointmentCapable: true,
      sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
      sourceUrl: 'https://muralikrishnahospital.com/doctors',
    })),
  ...['Diabetic Profile Package', 'Fever Profile Package', 'Endoscopy Test Package', 'Liver Profile Package',
    'Kidney Profile Package', 'Anemia Profile Package', 'Hairfall Profile Package', 'Arthritis Profile Package',
    'Surgical Profile Package'].map((name): DepartmentSeed => ({
      hospitalId: '7f100007-0000-0000-0000-000000000007',
      name: 'Diagnostic Support',
      specialtyCategory: 'Diagnostics',
      services: [name],
      appointmentCapable: false,
      sourceLabel: 'Murali Krishna Hospital — Medical Services',
      sourceUrl: 'https://muralikrishnahospital.com/services',
    })),

  // --- SAVE Multi-Speciality Hospital, Machilipatnam ---
  // The official services page lists these specialities; each is named there
  // (e.g. "Maternity & Women's Health" with prenatal/postnatal care, and
  // "Physiotherapy & Rehabilitation" with physical/occupational therapy).
  ...['ENT', 'Orthopaedics', 'Ophthalmology', 'General Medicine', 'Emergency Medicine',
    'Diagnostic Support', 'General Surgery', 'Cardiology', 'Paediatrics', 'Rehabilitation Medicine',
    'Obstetrics & Gynaecology', 'Pharmacy Services']
    .map((name): DepartmentSeed => ({
      hospitalId: '7f100008-0000-0000-0000-000000000008',
      name,
      appointmentCapable: true,
      sourceLabel: 'SAVE Multi-Speciality Hospital — Services',
      sourceUrl: 'https://savehospitalmachilipatnam.com/en/services',
    })),

  // --- Dr. Madhu Super Speciality Hospital, Machilipatnam ---
  ...['Neurology', 'Neurosurgery', 'Nephrology', 'Rheumatology', 'Cardiology', 'Orthopaedics',
    'Endocrinology', 'Pulmonology', 'General Surgery', 'General Medicine', 'ENT',
    'Gastroenterology', 'Dermatology', 'General Surgery']
    .map((name): DepartmentSeed => ({
      hospitalId: '7f10000a-0000-0000-0000-00000000000a',
      name,
      appointmentCapable: true,
      sourceLabel: 'Dr. Madhu Super Speciality Hospital — Machilipatnam branch services',
      sourceUrl: 'https://madhuneuro.com/machilipatnam/',
    })),
];

/** De-duplicate (hospital, department) pairs while keeping the first source. */
export function buildDepartments(): HospitalDepartment[] {
  const seen = new Set<string>();
  const out: HospitalDepartment[] = [];
  for (const seed of DEPARTMENT_SEEDS) {
    const id = departmentId(seed.hospitalId, seed.name);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      hospital_id: seed.hospitalId,
      name: seed.name,
      ...(seed.specialtyCategory ? { specialty_category: seed.specialtyCategory } : {}),
      ...(seed.description ? { description: seed.description } : {}),
      services: seed.services ?? [],
      appointment_capable: seed.appointmentCapable ?? false,
      evidence_status: 'published',
      provenance: {
        data_source: seed.sourceLabel,
        source_url: seed.sourceUrl,
        data_status: 'PROVIDER_LISTED',
        fetched_at: CHECKED,
      },
      created_at: CREATED,
      updated_at: CREATED,
    });
  }
  return out;
}

interface DoctorSeed {
  id: string;
  name: string;
  specialty: string;
  subSpecialties?: string[];
  qualifications: string[];
  hospitalId: string;
  departmentName?: string;
  role?: string;
  scheduleNote?: string;
  bio?: string;
  phone?: string;
  status?: DoctorAffiliation['status'];
  sourceLabel: string;
  sourceUrl: string;
}

/**
 * Doctor evidence. Every doctor below is named on the cited facility's own
 * published page, together with the qualification and role that page states.
 * A visiting specialist's schedule is reproduced verbatim; nothing is inferred.
 */
const DOCTOR_SEEDS: DoctorSeed[] = [
  // Murali Krishna Hospital — official doctors page.
  {
    id: 'doc-murali-krishna',
    name: 'Dr. K. Murali Krishna',
    specialty: 'General Medicine',
    qualifications: ['MD (Physician)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'General Medicine',
    role: 'Chief physician',
    scheduleNote: 'Daily consultation 10:00 AM – 1:00 PM and 6:00 PM – 8:00 PM',
    bio: 'General physician and chief doctor at Murali Krishna Hospital, Machilipatnam, providing daily outpatient consultation and emergency support.',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-a-sandeep',
    name: 'Dr. A. Sandeep',
    specialty: 'Orthopaedics',
    subSpecialties: ['Joint Replacement'],
    qualifications: ['M.S. Ortho', 'Fellow in Joint Replacement'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Orthopaedics',
    role: 'Visiting specialist',
    scheduleNote: '1st and 3rd Friday of each month, 10:00 AM onwards',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-g-dinesh',
    name: 'Dr. G. Dinesh',
    specialty: 'General Surgery',
    qualifications: ['MS General Surgery'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'General Surgery',
    role: 'Consulting surgeon (on call)',
    scheduleNote: 'Everyday (on call)',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-harika-matti',
    name: 'Dr. Harika Matti',
    specialty: 'Obstetrics & Gynaecology',
    qualifications: ['MBBS', 'MS (OBG)', 'FRM (RGUHS)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Obstetrics & Gynaecology',
    role: 'Visiting specialist',
    scheduleNote: '11:00 AM every month, 2nd Tuesday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-harishta-battula',
    name: 'Dr. Harishta Battula',
    specialty: 'Dermatology',
    qualifications: ['MBBS', 'MD DVL', 'Fellow in aesthetic medicine'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Dermatology',
    role: 'Visiting specialist',
    scheduleNote: '1st and 3rd Tuesday of each month, 10:00 AM – 1:00 PM',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-kona-ravi-kiran',
    name: 'Dr. Kona Ravi Kiran',
    specialty: 'Rheumatology',
    qualifications: ['MBBS', 'MD (Rheumatology Fellowship - Manipal)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Rheumatology',
    role: 'Visiting specialist',
    scheduleNote: '10:00 AM – 1:00 PM every month, 4th Thursday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-l-srikanth',
    name: 'Dr. L. Srikanth',
    specialty: 'Psychiatry',
    qualifications: ['MD (Neuro Psychiatry)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Psychiatry',
    role: 'Visiting specialist',
    scheduleNote: '10:30 AM – 2:00 PM every month, 3rd Sunday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-p-sai-sandeep',
    name: 'Dr. P. Sai Sandeep',
    specialty: 'Neurology',
    qualifications: ['DNB (Gen Med)', 'DM (Neurology)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Neurology',
    role: 'Visiting specialist',
    scheduleNote: '1st Sunday of each month, 10:00 AM onwards',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-u-bhaskar-rao',
    name: 'Dr. U. Bhaskar Rao',
    specialty: 'Gastroenterology',
    qualifications: ['MD', 'DM (Gastroenterology)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Gastroenterology',
    role: 'Visiting specialist',
    scheduleNote: '10:00 AM – 1:00 PM every month, 4th Sunday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-vsr-bhupal',
    name: 'Dr. V.S.R. Bhupal',
    specialty: 'Cardiology',
    qualifications: ['MD', 'DM (NIMS)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Cardiology',
    role: 'Visiting specialist',
    scheduleNote: '5:00 PM every month, 3rd Friday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-vvs-dsr-sagar',
    name: 'Dr. VVS DSR Sagar',
    specialty: 'Pulmonology',
    qualifications: ['MD (Pulmonology)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Pulmonology',
    role: 'Visiting specialist',
    scheduleNote: '4:00 PM every month, 4th Tuesday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },
  {
    id: 'doc-y-ramesh',
    name: 'Dr. Y. Ramesh',
    specialty: 'Nephrology',
    qualifications: ['MD', 'DM (Nephrology)'],
    hospitalId: '7f100007-0000-0000-0000-000000000007',
    departmentName: 'Nephrology',
    role: 'Visiting specialist',
    scheduleNote: '3:00 PM – 5:00 PM every month, 4th Friday',
    sourceLabel: 'Murali Krishna Hospital — Doctors & Specialists',
    sourceUrl: 'https://muralikrishnahospital.com/doctors',
  },

  // SAVE Multi-Speciality Hospital — official team page.
  {
    id: 'doc-sandeep-vemu',
    name: 'Dr. Sandeep Vemu',
    specialty: 'ENT',
    qualifications: ['MBBS (Andhra Medical College, Visakhapatnam)', 'MS (ENT)', 'DNB (ENT)', 'Gold Medalist in ENT'],
    hospitalId: '7f100008-0000-0000-0000-000000000008',
    departmentName: 'ENT',
    role: 'Founder, Medical Director & Lead ENT Surgeon',
    bio: 'ENT specialist and co-founder of SAVE Multi-Speciality Hospital, Machilipatnam. Expert in sinus surgery, hearing restoration, tonsillectomy and head & neck procedures.',
    sourceLabel: 'SAVE Multi-Speciality Hospital — Our Team',
    sourceUrl: 'https://savehospitalmachilipatnam.com/en/team',
  },
  {
    id: 'doc-praveena-madasu',
    name: 'Dr. Praveena Madasu',
    specialty: 'Ophthalmology',
    qualifications: ['MBBS (Andhra Medical College, Visakhapatnam)', 'MS (Ophthalmology)', 'DNB (Ophthalmology)', 'FRCS'],
    hospitalId: '7f100008-0000-0000-0000-000000000008',
    departmentName: 'Ophthalmology',
    role: 'Head of Ophthalmology & Lead Eye Surgeon',
    bio: 'Ophthalmologist and co-founder of SAVE Multi-Speciality Hospital, Machilipatnam, with expertise in cataract surgery, glaucoma management and comprehensive eye care.',
    sourceLabel: 'SAVE Multi-Speciality Hospital — Our Team',
    sourceUrl: 'https://savehospitalmachilipatnam.com/en/team',
  },
];

export interface DoctorDirectoryEntry {
  id: string;
  name: string;
  specialty: string;
  subSpecialties: string[];
  qualifications: string[];
  affiliations: DoctorAffiliation[];
  bio: string;
  phone?: string;
  sourceLabel: string;
  sourceUrl: string;
}

/** Build the doctor directory plus the affiliation relationships. */
export function buildDoctors(): DoctorDirectoryEntry[] {
  return DOCTOR_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    specialty: seed.specialty,
    subSpecialties: seed.subSpecialties ?? [],
    qualifications: seed.qualifications,
    bio: seed.bio ?? `${seed.specialty} specialist listed on the facility’s published roster.`,
    ...(seed.phone ? { phone: seed.phone } : {}),
    sourceLabel: seed.sourceLabel,
    sourceUrl: seed.sourceUrl,
    affiliations: [
      {
        id: affiliationId(seed.id, seed.hospitalId),
        doctor_id: seed.id,
        hospital_id: seed.hospitalId,
        ...(seed.departmentName ? { department_name: seed.departmentName } : {}),
        status: seed.status ?? 'current',
        ...(seed.role ? { role: seed.role } : {}),
        ...(seed.scheduleNote ? { schedule_note: seed.scheduleNote } : {}),
        provenance: {
          data_source: seed.sourceLabel,
          source_url: seed.sourceUrl,
          data_status: 'PROVIDER_LISTED',
          fetched_at: CHECKED,
        },
        last_verified_at: CHECKED,
      },
    ],
  }));
}

export const DOCTOR_SEED_COUNT = DOCTOR_SEEDS.length;
export const DEPARTMENT_SEED_COUNT = DEPARTMENT_SEEDS.length;

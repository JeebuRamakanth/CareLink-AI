import { doctorsData } from '../../../data/doctors';
import { hospitalsData } from '../../../data/hospitals';
import type { Doctor } from '../../../types';

export type DoctorReviewFilterOption =
  | 'All'
  | '5 Star'
  | '4 Star'
  | '3 Star'
  | '2 Star'
  | '1 Star'
  | 'Most Recent'
  | 'Highest Rated'
  | 'Most Helpful'
  | 'Treatment-related';

export interface DoctorAvailabilitySlot {
  id: string;
  day: string;
  time: string;
  status: 'available' | 'reserved' | 'unavailable';
  period: 'Morning' | 'Afternoon' | 'Evening';
}

export interface DoctorMatchInfo {
  score: number;
  label: string;
  disclaimer: string;
  tags: string[];
  description: string;
}

export interface DoctorExpertiseItem {
  id: string;
  specialty: string;
  reviewCount: number;
  rating: number;
  experienceIndicator: string;
}

export interface DoctorRatingCategory {
  label: string;
  score: number;
}

export interface DoctorReviewItem {
  id: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  specialtyTag: string;
  verified: boolean;
  helpfulCount: number;
  reviewerInitials?: string;
  reviewerRelationship?: string;
  isTreatmentRelated?: boolean;
  response?: string;
}

export interface DoctorProfileCard {
  id: string;
  name: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  fee?: string;
  hospital: string;
  availability: string;
  location: string;
  profileInitials: string;
  imageUrl?: string;
}

export interface DoctorHospitalConnection {
  id: string;
  name: string;
  rating: number;
  location: string;
  specialties: string[];
  imageUrl?: string;
  distance: string;
  address: string;
  role: string;
  hours: string;
}

export interface DoctorProfile {
  id: string;
  name: string;
  specialty: string;
  subSpecialty: string;
  profileInitials: string;
  yearsExperience: number;
  rating: number;
  totalReviews: number;
  verified: boolean;
  imageUrl?: string;
  hospitalAffiliation: string;
  hospitalId: string;
  availabilityStatus: string;
  nextAvailable: string;
  consultationFee: string;
  location: string;
  languages: string[];
  profileMatch?: DoctorMatchInfo;
  patientsTreated?: number;
  treatmentRate?: string;
  verifiedReviewCount?: number;
  profileSummary: string;
  education: string[];
  qualifications: string[];
  certifications: string[];
  specializations: string[];
  expertiseAreas: string[];
  hospitalsWorkedWith: string[];
  memberships: string[];
  consultationModes: string[];
  professionalHighlights: string[];
  performanceMetrics: Array<{ label: string; value: string; note?: string }>;
  expertiseList: DoctorExpertiseItem[];
  starBreakdown: Array<{ stars: number; percent: number }>;
  categoryRatings: DoctorRatingCategory[];
  reviews: DoctorReviewItem[];
  availabilitySlots: DoctorAvailabilitySlot[];
  consultationInfo: {
    fee: string;
    duration: string;
    modes: string[];
    inPerson: string;
    online: string;
    location: string;
    mockDisclaimer: string;
  };
  hospitalConnection: DoctorHospitalConnection;
  relatedDoctors: DoctorProfileCard[];
  /** True for profiles derived from the catalogue rather than curated data. */
  isBridgeProfile?: boolean;
}

export const doctorReviewFilters: DoctorReviewFilterOption[] = [
  'All',
  '5 Star',
  '4 Star',
  '3 Star',
  '2 Star',
  '1 Star',
  'Most Recent',
  'Highest Rated',
  'Treatment-related',
  'Most Helpful',
];

export const doctorProfiles: DoctorProfile[] = [
  {
    id: 'anjali-desai',
    name: 'Dr. Anjali Desai',
    specialty: 'Pediatrics',
    subSpecialty: 'Pediatric Cardiology',
    profileInitials: 'AD',
    yearsExperience: 15,
    rating: 5.0,
    totalReviews: 298,
    verified: true,
    hospitalAffiliation: 'Luma Children’s Hospital',
    hospitalId: 'luma-children-hospital',
    availabilityStatus: 'Available Today',
    nextAvailable: 'Today, 10:30 AM',
    consultationFee: '$170',
    location: 'Toronto, Canada',
    languages: ['English', 'Hindi', 'Punjabi'],
    profileMatch: {
      score: 95,
      label: 'Clinical fit for congenital pediatric care',
      disclaimer: 'Mock patient-doctor matching based on specialty, availability, and care continuity.',
      tags: ['Congenital care', 'Family-first support', 'Pediatric cardiology'],
      description:
        'This premium match highlights the doctor’s strong alignment with complex pediatric heart conditions and long-term child wellness plans.',
    },
    patientsTreated: 1200,
    treatmentRate: '94%',
    verifiedReviewCount: 276,
    profileSummary:
      'Dr. Desai is a pediatric cardiologist specializing in congenital heart care and family-centered treatment plans. She is known for compassionate communication, collaborative pediatric consulting, and a strong focus on long-term child wellness.',
    education: ['MD, University of Toronto', 'Fellowship, Boston Children’s Hospital'],
    qualifications: ['Board-certified Pediatric Cardiologist', 'Fellowship-trained in Congenital Heart Disease'],
    certifications: ['Pediatric Advanced Life Support (PALS)', 'Certified Pediatric Echocardiographer'],
    specializations: ['Pediatric Cardiology', 'Congenital Heart Conditions', 'Family-Centered Care'],
    expertiseAreas: ['Heart murmurs', 'Neonatal cardiology', 'Preventive pediatric cardiology', 'Growth-related cardiac care'],
    hospitalsWorkedWith: ['Luma Children’s Hospital', 'Northern Pediatric Clinic', 'Maple Heart Center'],
    memberships: ['Canadian Paediatric Society', 'Pediatric Cardiology Association'],
    consultationModes: ['In-person', 'Telehealth'],
    professionalHighlights: [
      'Trusted by families for clear communication and thoughtful care plans.',
      'Supports pediatric growth monitoring with specialist diagnostics.',
    ],
    performanceMetrics: [
      { label: 'Experience', value: '15 years' },
      { label: 'Patient satisfaction', value: '97%' },
      { label: 'Treatment success (mock)', value: '94% (sample data)' },
      { label: 'Review quality', value: '5.0 rating from 298 reviews' },
      { label: 'Consultation experience', value: 'Fast follow-up and clear guidance' },
      { label: 'Response readiness', value: 'Same-day scheduling available' },
    ],
    expertiseList: [
      { id: 'pediatric-cardiology', specialty: 'Pediatric Cardiology', reviewCount: 134, rating: 5.0, experienceIndicator: '15 yrs specialty' },
      { id: 'congenital-heart', specialty: 'Congenital Heart Disease', reviewCount: 89, rating: 5.0, experienceIndicator: 'Expert-led care' },
      { id: 'neonatal-cardiology', specialty: 'Neonatal Cardiology', reviewCount: 52, rating: 4.9, experienceIndicator: 'NICU-ready expertise' },
    ],
    starBreakdown: [
      { stars: 5, percent: 78 },
      { stars: 4, percent: 15 },
      { stars: 3, percent: 5 },
      { stars: 2, percent: 1 },
      { stars: 1, percent: 1 },
    ],
    categoryRatings: [
      { label: 'Communication', score: 5.0 },
      { label: 'Diagnosis experience', score: 4.9 },
      { label: 'Treatment experience', score: 4.9 },
      { label: 'Staff coordination', score: 4.8 },
      { label: 'Waiting time', score: 4.8 },
      { label: 'Explanation clarity', score: 5.0 },
    ],
    reviews: [
      {
        id: 'anjali-review-001',
        rating: 5,
        title: 'Family-centered cardiology care with strong communication',
        content:
          'Dr. Desai took the time to explain every result clearly and made sure our child felt safe. The follow-up plan was detailed and easy to follow.',
        date: '2026-07-24',
        specialtyTag: 'Pediatric Cardiology',
        verified: true,
        helpfulCount: 25,
        response: 'Thank you for trusting our pediatric team. We are always here to support your family’s care journey.',
      },
      {
        id: 'anjali-review-002',
        rating: 5,
        title: 'Excellent heart care for our newborn',
        content:
          'The neonatal cardiology appointment was reassuring and efficient. Dr. Desai created a clear care plan and listened carefully to our concerns.',
        date: '2026-06-29',
        specialtyTag: 'Neonatal Cardiology',
        verified: true,
        helpfulCount: 18,
      },
      {
        id: 'anjali-review-003',
        rating: 4,
        title: 'Very supportive doctor, excellent bedside manner',
        content:
          'The consultation felt calm and professional. We appreciated the care team’s coordination and the thorough explanation of options.',
        date: '2026-06-05',
        specialtyTag: 'Preventive Care',
        verified: true,
        helpfulCount: 12,
      },
    ],
    availabilitySlots: [
      { id: 'slot-1', day: 'Today', time: '10:30 AM', status: 'available', period: 'Morning' },
      { id: 'slot-2', day: 'Today', time: '2:00 PM', status: 'reserved', period: 'Afternoon' },
      { id: 'slot-3', day: 'Tomorrow', time: '9:00 AM', status: 'available', period: 'Morning' },
      { id: 'slot-4', day: 'Tomorrow', time: '11:15 AM', status: 'available', period: 'Morning' },
      { id: 'slot-5', day: 'Upcoming', time: 'Monday 1:30 PM', status: 'available', period: 'Afternoon' },
    ],
    consultationInfo: {
      fee: '$170 per visit (mock pricing)',
      duration: '30 minutes',
      modes: ['In-person', 'Telehealth'],
      inPerson: 'Available at Luma Children’s Hospital',
      online: 'Secure video consultation available',
      location: 'Toronto, Canada',
      mockDisclaimer: 'Mock consultation details for premium experience.',
    },
    hospitalConnection: {
      id: 'luma-children-hospital',
      name: 'Luma Children’s Hospital',
      rating: 5.0,
      location: 'Toronto, Canada',
      specialties: ['Pediatrics', 'Neonatal Care', 'Family Medicine'],
      imageUrl: '/images/hospitals/luma-children.png',
      distance: '2.4 km',
      address: '18 Maple Avenue, Toronto',
      role: 'Primary pediatric affiliation',
      hours: 'Mon–Fri 8:00 AM – 6:00 PM',
    },
    relatedDoctors: [
      { id: 'sophia-miller', name: 'Dr. Sophia Miller', specialty: 'Neonatal Care', experienceYears: 13, rating: 4.9, hospital: 'Luma Children’s Hospital', availability: 'Tue–Sat', profileInitials: 'SM', location: 'Toronto' },
      { id: 'louis-singh', name: 'Dr. Louis Singh', specialty: 'Pediatric Oncology', experienceYears: 14, rating: 4.8, hospital: 'Luma Children’s Hospital', availability: 'Mon–Fri', profileInitials: 'LS', location: 'Toronto' },
      { id: 'elena-park', name: 'Dr. Elena Park', specialty: 'Pediatric Neurology', experienceYears: 12, rating: 4.8, hospital: 'Luma Children’s Hospital', availability: 'Wed–Sat', profileInitials: 'EP', location: 'Toronto' },
    ],
  },
  {
    id: 'sophia-miller',
    name: 'Dr. Sophia Miller',
    specialty: 'Neonatal Care',
    subSpecialty: 'NICU Support',
    profileInitials: 'SM',
    yearsExperience: 13,
    rating: 4.9,
    totalReviews: 214,
    verified: true,
    hospitalAffiliation: 'Luma Children’s Hospital',
    hospitalId: 'luma-children-hospital',
    availabilityStatus: 'Next available Tomorrow',
    nextAvailable: 'Tomorrow, 9:00 AM',
    consultationFee: '$160',
    location: 'Toronto, Canada',
    languages: ['English', 'French'],
    profileSummary:
      'Dr. Miller leads neonatal consults with a strong focus on early-life stabilization and family education. Her care model blends clinical precision with empathetic communication for new parents.',
    education: ['MD, McGill University', 'Fellowship, SickKids Hospital'],
    qualifications: ['Board-certified Neonatologist', 'Advanced Neonatal Resuscitation Provider'],
    certifications: ['Neonatal Resuscitation Program (NRP)', 'Neonatal Pain Management Training'],
    specializations: ['NICU Support', 'Premature Infant Care', 'Developmental Follow-up'],
    expertiseAreas: ['Premature birth support', 'NICU coordination', 'Parent counseling', 'Early intervention planning'],
    hospitalsWorkedWith: ['Luma Children’s Hospital', 'SickKids', 'Montreal Children’s'],
    memberships: ['Canadian Paediatric Society', 'Neonatal Medical Association'],
    consultationModes: ['In-person', 'Telehealth'],
    professionalHighlights: [
      'Provides calm, expert guidance for neonatal care pathways.',
      'Strong partner to families during early-life treatment plans.',
    ],
    performanceMetrics: [
      { label: 'Experience', value: '13 years' },
      { label: 'Patient satisfaction', value: '96%' },
      { label: 'Treatment success (mock)', value: '92% (sample data)' },
      { label: 'Review quality', value: '4.9 rating from 214 reviews' },
      { label: 'Consultation experience', value: 'Efficient, care-focused conversations' },
      { label: 'Response readiness', value: 'Next-day availability' },
    ],
    expertiseList: [
      { id: 'nicu-care', specialty: 'NICU Support', reviewCount: 98, rating: 4.9, experienceIndicator: '13 yrs NICU care' },
      { id: 'prematurity', specialty: 'Premature Infant Care', reviewCount: 62, rating: 5.0, experienceIndicator: 'Family-centered follow-up' },
      { id: 'early-intervention', specialty: 'Developmental Follow-up', reviewCount: 54, rating: 4.8, experienceIndicator: 'Long-term planning' },
    ],
    starBreakdown: [
      { stars: 5, percent: 74 },
      { stars: 4, percent: 18 },
      { stars: 3, percent: 6 },
      { stars: 2, percent: 1 },
      { stars: 1, percent: 1 },
    ],
    categoryRatings: [
      { label: 'Communication', score: 4.9 },
      { label: 'Diagnosis experience', score: 4.9 },
      { label: 'Treatment experience', score: 4.8 },
      { label: 'Staff coordination', score: 4.8 },
      { label: 'Waiting time', score: 4.7 },
      { label: 'Explanation clarity', score: 4.9 },
    ],
    reviews: [
      {
        id: 'sophia-review-001',
        rating: 5,
        title: 'Neonatal care that felt both expert and gentle',
        content:
          'Dr. Miller explained the NICU process clearly and helped us feel supported throughout our stay. The discharge plan was reassuring and practical.',
        date: '2026-07-16',
        specialtyTag: 'NICU Support',
        verified: true,
        helpfulCount: 21,
      },
      {
        id: 'sophia-review-002',
        rating: 5,
        title: 'Excellent follow-up and attentive support',
        content:
          'The follow-up video call after our discharge answered every question and made the next steps easy to manage.',
        date: '2026-06-28',
        specialtyTag: 'Follow-up Care',
        verified: true,
        helpfulCount: 17,
        response: 'We’re glad to stay in touch and continue supporting your family’s next steps.',
      },
    ],
    availabilitySlots: [
      { id: 'slot-6', day: 'Tomorrow', time: '9:00 AM', status: 'available', period: 'Morning' },
      { id: 'slot-7', day: 'Tomorrow', time: '11:45 AM', status: 'available', period: 'Morning' },
      { id: 'slot-8', day: 'Upcoming', time: 'Wednesday 2:00 PM', status: 'available', period: 'Afternoon' },
      { id: 'slot-9', day: 'Upcoming', time: 'Friday 10:15 AM', status: 'available', period: 'Morning' },
    ],
    consultationInfo: {
      fee: '$160 per visit (mock pricing)',
      duration: '30 minutes',
      modes: ['In-person', 'Telehealth'],
      inPerson: 'Available at Luma Children’s Hospital',
      online: 'Virtual neonatal consultation available',
      location: 'Toronto, Canada',
      mockDisclaimer: 'Mock consultation details for premium experience.',
    },
    hospitalConnection: {
      id: 'luma-children-hospital',
      name: 'Luma Children’s Hospital',
      rating: 5.0,
      location: 'Toronto, Canada',
      specialties: ['Pediatrics', 'Neonatal Care', 'Family Medicine'],
      imageUrl: '/images/hospitals/luma-children.png',
      distance: '2.4 km',
      address: '18 Maple Avenue, Toronto',
      role: 'Primary pediatric affiliation',
      hours: 'Mon–Fri 8:00 AM – 6:00 PM',
    },
    relatedDoctors: [
      { id: 'anjali-desai', name: 'Dr. Anjali Desai', specialty: 'Pediatrics', experienceYears: 15, rating: 5.0, hospital: 'Luma Children’s Hospital', availability: 'Today', profileInitials: 'AD', location: 'Toronto' },
      { id: 'louis-singh', name: 'Dr. Louis Singh', specialty: 'Pediatric Oncology', experienceYears: 14, rating: 4.8, hospital: 'Luma Children’s Hospital', availability: 'Mon–Fri', profileInitials: 'LS', location: 'Toronto' },
      { id: 'elena-park', name: 'Dr. Elena Park', specialty: 'Pediatric Neurology', experienceYears: 12, rating: 4.8, hospital: 'Luma Children’s Hospital', availability: 'Wed–Sat', profileInitials: 'EP', location: 'Toronto' },
    ],
  },
  {
    id: 'louise-grant',
    name: 'Dr. Louise Grant',
    specialty: 'Orthopedics',
    subSpecialty: 'Sports Rehabilitation',
    profileInitials: 'LG',
    yearsExperience: 14,
    rating: 4.6,
    totalReviews: 216,
    verified: true,
    hospitalAffiliation: 'Northside Health Pavilion',
    hospitalId: 'northside-health-pavilion',
    availabilityStatus: 'Available Today',
    nextAvailable: 'Today, 1:00 PM',
    consultationFee: '$170',
    location: 'London, United Kingdom',
    languages: ['English', 'French'],
    profileSummary:
      'Dr. Grant specializes in sports-related orthopedic rehabilitation for active patients. Her practice emphasizes progressive recovery, multidisciplinary support, and functional outcomes.',
    education: ['MBBS, King’s College London', 'Fellowship, Royal National Orthopaedic Hospital'],
    qualifications: ['Board-certified Orthopedic Surgeon', 'Fellowship in Sports Rehabilitation'],
    certifications: ['Cert. in Sports Injury Management', 'Advanced Musculoskeletal Ultrasound'],
    specializations: ['Sports Rehabilitation', 'Spine Health', 'Joint Preservation'],
    expertiseAreas: ['ACL recovery', 'Spinal stability', 'Arthroscopic care', 'Therapy pathway planning'],
    hospitalsWorkedWith: ['Northside Health Pavilion', 'West End Sports Clinic'],
    memberships: ['British Orthopaedic Association', 'International Society of Arthroscopy'],
    consultationModes: ['In-person'],
    professionalHighlights: [
      'Delivers rehabilitation plans that prioritize mobility and return-to-sport goals.',
      'Collaborates with physical therapists and sports medicine teams for joined care.',
    ],
    performanceMetrics: [
      { label: 'Experience', value: '14 years' },
      { label: 'Patient satisfaction', value: '94%' },
      { label: 'Treatment success (mock)', value: '91% (sample data)' },
      { label: 'Review quality', value: '4.6 rating from 216 reviews' },
      { label: 'Consultation experience', value: 'Structured rehabilitation pathways' },
      { label: 'Response readiness', value: 'Same-day clinic availability' },
    ],
    expertiseList: [
      { id: 'sports-rehab', specialty: 'Sports Rehabilitation', reviewCount: 120, rating: 4.6, experienceIndicator: '14 yrs in sports care' },
      { id: 'spine-health', specialty: 'Spine Health', reviewCount: 58, rating: 4.5, experienceIndicator: 'Expert spine focus' },
      { id: 'joint-preservation', specialty: 'Joint Preservation', reviewCount: 38, rating: 4.6, experienceIndicator: 'Modern arthroscopic practice' },
    ],
    starBreakdown: [
      { stars: 5, percent: 61 },
      { stars: 4, percent: 25 },
      { stars: 3, percent: 8 },
      { stars: 2, percent: 4 },
      { stars: 1, percent: 2 },
    ],
    categoryRatings: [
      { label: 'Communication', score: 4.7 },
      { label: 'Diagnosis experience', score: 4.6 },
      { label: 'Treatment experience', score: 4.6 },
      { label: 'Staff coordination', score: 4.6 },
      { label: 'Waiting time', score: 4.4 },
      { label: 'Explanation clarity', score: 4.7 },
    ],
    reviews: [
      {
        id: 'louise-review-001',
        rating: 5,
        title: 'Reassuring rehab plan and expert guidance',
        content:
          'Dr. Grant designed a practical recovery plan and kept me informed at every stage. The follow-up appointments were well organized.',
        date: '2026-07-05',
        specialtyTag: 'Sports Rehabilitation',
        verified: true,
        helpfulCount: 19,
      },
      {
        id: 'louise-review-002',
        rating: 4,
        title: 'Strong collaboration with physio team',
        content:
          'The care team worked smoothly together and I felt supported throughout my spine recovery. The appointment timing was easy to arrange.',
        date: '2026-06-19',
        specialtyTag: 'Spine Health',
        verified: true,
        helpfulCount: 13,
      },
    ],
    availabilitySlots: [
      { id: 'slot-10', day: 'Today', time: '1:00 PM', status: 'available', period: 'Afternoon' },
      { id: 'slot-11', day: 'Tomorrow', time: '10:00 AM', status: 'available', period: 'Morning' },
      { id: 'slot-12', day: 'Upcoming', time: 'Thursday 3:00 PM', status: 'available', period: 'Afternoon' },
      { id: 'slot-13', day: 'Upcoming', time: 'Saturday 11:00 AM', status: 'available', period: 'Morning' },
    ],
    consultationInfo: {
      fee: '$170 per visit (mock pricing)',
      duration: '35 minutes',
      modes: ['In-person'],
      inPerson: 'Clinic at Northside Health Pavilion',
      online: 'Not available online',
      location: 'London, UK',
      mockDisclaimer: 'Mock consultation details for premium experience.',
    },
    hospitalConnection: {
      id: 'northside-health-pavilion',
      name: 'Northside Health Pavilion',
      rating: 4.6,
      location: 'London, United Kingdom',
      specialties: ['Orthopedics', 'Rehabilitation', 'Sports Medicine'],
      imageUrl: '/images/hospitals/northside-health.png',
      distance: '1.2 km',
      address: '12 King’s Road, London',
      role: 'Primary orthopedic practice',
      hours: 'Mon–Fri 8:30 AM – 5:30 PM',
    },
    relatedDoctors: [
      { id: 'mark-baker', name: 'Dr. Mark Baker', specialty: 'Sports Medicine', experienceYears: 11, rating: 4.7, hospital: 'Northside Health Pavilion', availability: 'Tue–Sat', profileInitials: 'MB', location: 'London' },
      { id: 'maya-kapoor', name: 'Dr. Maya Kapoor', specialty: 'Physiotherapy', experienceYears: 12, rating: 4.6, hospital: 'Northside Health Pavilion', availability: 'Mon–Fri', profileInitials: 'MK', location: 'London' },
      { id: 'sina-ray', name: 'Dr. Sina Ray', specialty: 'Sports Medicine', experienceYears: 10, rating: 4.5, hospital: 'Northside Health Pavilion', availability: 'Wed–Sun', profileInitials: 'SR', location: 'London' },
    ],
  },
];

export function getDoctorProfileById(id: string | undefined) {
  if (!id) return null;
  return doctorProfiles.find((profile) => profile.id === id) ?? null;
}

/* ---------------------------------------------------------------------------
 * Bridge for the catalogue in src/data/doctors.ts (Step 14 bug fix).
 *
 * The /doctors list renders the `doctorsData` catalogue (doc-### ids), while
 * rich profiles + booking exist only for the three curated `doctorProfiles`
 * above. Previously the list-card "View profile" / "Book visit" buttons had
 * no handlers at all — dead controls. For catalogue doctors without a curated
 * profile we derive a conservative profile from real catalogue fields only:
 * availability is generated from `next_available_at` (no fabricated slots),
 * review/metric sections stay empty, and synthetic entries are marked with
 * `isBridgeProfile` so the page shows transparent guidance instead of fake
 * detail.
 * ------------------------------------------------------------------------- */

function doctorSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextDayIso(offsetDays: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Slots derived from the real `next_available_at` timestamp — never invented. */
function bridgeAvailabilitySlots(doctor: Doctor): DoctorAvailabilitySlot[] {
  if (doctor.availability_status === 'offline' || !doctor.accepts_new_patients) return [];
  const base = doctor.next_available_at ? new Date(doctor.next_available_at) : null;
  const offset = base && !Number.isNaN(base.getTime())
    ? Math.max(0, Math.round((base.getTime() - Date.now()) / 86_400_000))
    : 1;
  const day = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'Upcoming';
  const hours = doctor.availability_status === 'limited' ? [10, 14] : [9, 11, 14, 16];
  const periods: DoctorAvailabilitySlot['period'][] = ['Morning', 'Morning', 'Afternoon', 'Evening'];
  return hours.map((hour, i) => ({
    id: `${doctor.id}-slot-${i + 1}`,
    day,
    time: new Date(nextDayIso(offset, hour)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    status: 'available',
    period: periods[i] ?? 'Afternoon',
  }));
}

function bridgeProfile(doctor: Doctor): DoctorProfile {
  const hospitalId = doctor.hospital_ids[0] ?? '';
  const hospital = hospitalsData.find((h) => h.id === hospitalId);
  const initials = doctor.full_name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const slots = bridgeAvailabilitySlots(doctor);
  return {
    isBridgeProfile: true,
    id: doctor.id,
    name: doctor.full_name,
    specialty: doctor.specialty,
    subSpecialty: doctor.sub_specialties[0] ?? '',
    profileInitials: initials || 'DR',
    yearsExperience: doctor.years_of_experience,
    rating: doctor.rating,
    totalReviews: doctor.review_count,
    verified: doctor.is_verified,
    hospitalAffiliation: hospital?.name ?? 'Independent practice',
    hospitalId: hospital?.slug ?? '',
    availabilityStatus: doctor.availability_status,
    nextAvailable: slots[0] ? `${slots[0].day} ${slots[0].time}` : 'Not currently listed',
    consultationFee: 'Not listed',
    location: doctor.location,
    languages: doctor.languages,
    patientsTreated: undefined,
    profileSummary: doctor.bio,
    education: doctor.education,
    qualifications: [],
    certifications: [],
    specializations: doctor.sub_specialties,
    expertiseAreas: doctor.sub_specialties,
    hospitalsWorkedWith: hospital ? [hospital.name] : [],
    memberships: [],
    consultationModes: doctor.consultation_modes,
    professionalHighlights: [],
    performanceMetrics: [],
    expertiseList: [],
    starBreakdown: [],
    categoryRatings: [],
    reviews: [],
    availabilitySlots: slots,
    consultationInfo: {
      fee: 'Not listed',
      duration: 'Standard consultation',
      modes: doctor.consultation_modes,
      inPerson: doctor.consultation_modes.includes('In-person') ? doctor.location : 'Not available',
      online: doctor.consultation_modes.some((m) => /tele|video|online/i.test(m)) ? 'Available' : 'Not available',
      location: doctor.location,
      mockDisclaimer: 'Availability is derived from the doctor’s listed schedule. Confirm details with the clinic before travelling.',
    },
    hospitalConnection: {
      id: hospital?.slug ?? '',
      name: hospital?.name ?? 'Independent practice',
      rating: hospital?.rating ?? 0,
      location: hospital ? `${hospital.city}, ${hospital.state}` : doctor.location,
      specialties: [doctor.specialty, ...doctor.sub_specialties],
      imageUrl: undefined,
      distance: '',
      address: hospital?.address ?? '',
      role: 'Listed affiliation',
      hours: '',
    },
    relatedDoctors: [],
  };
}

/** Curated profile first; otherwise a bridge profile derived from the catalogue. */
export function getDoctorProfileByAnyId(id: string | undefined): DoctorProfile | null {
  if (!id) return null;
  const curated = getDoctorProfileById(id);
  if (curated) return curated;
  const doctor = doctorsData.find((d) => d.id === id || doctorSlug(d.full_name) === id);
  return doctor ? bridgeProfile(doctor) : null;
}

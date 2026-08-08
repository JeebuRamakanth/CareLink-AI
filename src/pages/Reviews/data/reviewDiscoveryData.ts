export interface HospitalReviewSummary {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  specialties: string[];
  doctors: string[];
  diseaseTags: string[];
  highlight: string;
  reviewerName: string;
  reviewerRole: string;
  isVerified: boolean;
  reviewedAt: string;
  ratingBreakdown: Array<{ stars: number; percent: number }>;
  focusTags: Array<'doctors' | 'specialties' | 'diseases' | 'pediatrics' | 'womenHealth' | 'emergency'>;
}

export interface DoctorSummary {
  id: string;
  name: string;
  specialty: string;
  location: string;
  rating: number;
  reviewCount: number;
}

export interface SpecialtySummary {
  id: string;
  title: string;
  category: string;
  popularity: string;
}

export interface DiseaseSummary {
  id: string;
  title: string;
  category: string;
  impact: string;
}

export type SearchSuggestionItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  rating?: number;
  category: 'Hospital' | 'Doctor' | 'Specialty' | 'Disease';
};

export const sampleHospitalReviews: HospitalReviewSummary[] = [
  {
    id: 'aurora-medical-center',
    name: 'Aurora Medical Center',
    location: 'Stockholm, Sweden',
    rating: 4.9,
    reviewCount: 1284,
    distanceKm: 3.8,
    specialties: ['Cardiology', 'Emergency Medicine', 'Radiology'],
    doctors: ['Dr. Maya Kapoor', 'Dr. Anika Erickson'],
    diseaseTags: ['Heart disease', 'Stroke'],
    highlight: 'A seamless recovery journey with advanced diagnostics and compassionate specialists.',
    reviewerName: 'Elena R.',
    reviewerRole: 'Verified patient',
    isVerified: true,
    reviewedAt: '2026-07-26',
    ratingBreakdown: [
      { stars: 5, percent: 71 },
      { stars: 4, percent: 18 },
      { stars: 3, percent: 7 },
      { stars: 2, percent: 3 },
      { stars: 1, percent: 1 },
    ],
    focusTags: ['specialties', 'emergency', 'doctors'],
  },
  {
    id: 'beacon-heart-institute',
    name: 'Beacon Heart Institute',
    location: 'Boston, USA',
    rating: 4.8,
    reviewCount: 987,
    distanceKm: 12.4,
    specialties: ['Cardiology', 'Heart Surgery', 'Intensive Care'],
    doctors: ['Dr. Priya Nair', 'Dr. Daniel Kim'],
    diseaseTags: ['Arrhythmia', 'Hypertension'],
    highlight: 'Thoughtful coordination between cardiology and critical care made every step feel precise and safe.',
    reviewerName: 'Mira S.',
    reviewerRole: 'Patient advocate',
    isVerified: true,
    reviewedAt: '2026-08-01',
    ratingBreakdown: [
      { stars: 5, percent: 65 },
      { stars: 4, percent: 22 },
      { stars: 3, percent: 8 },
      { stars: 2, percent: 3 },
      { stars: 1, percent: 2 },
    ],
    focusTags: ['specialties', 'doctors'],
  },
  {
    id: 'luma-children-hospital',
    name: 'Luma Children’s Hospital',
    location: 'Toronto, Canada',
    rating: 5.0,
    reviewCount: 764,
    distanceKm: 7.2,
    specialties: ['Pediatrics', 'Neonatal Care', 'Family Medicine'],
    doctors: ['Dr. Anjali Desai', 'Dr. Sophie Martin'],
    diseaseTags: ['Asthma', 'Child development'],
    highlight: 'The pediatric team delivered calm, comprehensive care with clear communication at every visit.',
    reviewerName: 'Anika P.',
    reviewerRole: 'Parent',
    isVerified: true,
    reviewedAt: '2026-07-14',
    ratingBreakdown: [
      { stars: 5, percent: 78 },
      { stars: 4, percent: 14 },
      { stars: 3, percent: 5 },
      { stars: 2, percent: 2 },
      { stars: 1, percent: 1 },
    ],
    focusTags: ['pediatrics', 'womenHealth', 'specialties'],
  },
  {
    id: 'northside-health-pavilion',
    name: 'Northside Health Pavilion',
    location: 'London, United Kingdom',
    rating: 4.6,
    reviewCount: 583,
    distanceKm: 2.1,
    specialties: ['Orthopedics', 'Rehabilitation', 'Sports Medicine'],
    doctors: ['Dr. Louise Grant', 'Dr. Mark Baker'],
    diseaseTags: ['Sports injury', 'Joint pain'],
    highlight: 'Efficient admissions and a recovery team that kept updates timely and empathetic.',
    reviewerName: 'Owen L.',
    reviewerRole: 'Professional athlete',
    isVerified: true,
    reviewedAt: '2026-06-17',
    ratingBreakdown: [
      { stars: 5, percent: 59 },
      { stars: 4, percent: 24 },
      { stars: 3, percent: 10 },
      { stars: 2, percent: 4 },
      { stars: 1, percent: 3 },
    ],
    focusTags: ['specialties', 'diseases'],
  },
  {
    id: 'crescent-wellness-campus',
    name: 'Crescent Wellness Campus',
    location: 'Singapore',
    rating: 4.7,
    reviewCount: 448,
    distanceKm: 1.6,
    specialties: ['Wellness', 'Telehealth', 'Diagnostic Imaging'],
    doctors: ['Dr. Hana Lee', 'Dr. Wei Tan'],
    diseaseTags: ['Diabetes', 'Chronic care'],
    highlight: 'Modern outpatient flow with quick care coordination and thoughtful remote follow-up.',
    reviewerName: 'Sofia M.',
    reviewerRole: 'Executive patient',
    isVerified: true,
    reviewedAt: '2026-06-02',
    ratingBreakdown: [
      { stars: 5, percent: 62 },
      { stars: 4, percent: 23 },
      { stars: 3, percent: 9 },
      { stars: 2, percent: 4 },
      { stars: 1, percent: 2 },
    ],
    focusTags: ['diseases', 'doctors'],
  },
];

export const sampleDoctors: DoctorSummary[] = [
  { id: 'doctor-001', name: 'Dr. Maya Kapoor', specialty: 'Cardiology', location: 'Stockholm', rating: 4.9, reviewCount: 412 },
  { id: 'doctor-002', name: 'Dr. Priya Nair', specialty: 'Heart Surgery', location: 'Boston', rating: 4.8, reviewCount: 371 },
  { id: 'doctor-003', name: 'Dr. Anjali Desai', specialty: 'Pediatrics', location: 'Toronto', rating: 5.0, reviewCount: 298 },
  { id: 'doctor-004', name: 'Dr. Louise Grant', specialty: 'Orthopedics', location: 'London', rating: 4.6, reviewCount: 216 },
  { id: 'doctor-005', name: 'Dr. Hana Lee', specialty: 'Telehealth', location: 'Singapore', rating: 4.7, reviewCount: 184 },
];

export const sampleSpecialties: SpecialtySummary[] = [
  { id: 'specialty-001', title: 'Cardiology', category: 'Heart care', popularity: 'High demand' },
  { id: 'specialty-002', title: 'Neurology', category: 'Brain health', popularity: 'Top rated' },
  { id: 'specialty-003', title: 'Pediatrics', category: 'Child wellness', popularity: 'Family trusted' },
  { id: 'specialty-004', title: 'Orthopedics', category: 'Movement recovery', popularity: 'Trusted experts' },
];

export const sampleDiseases: DiseaseSummary[] = [
  { id: 'disease-001', title: 'Diabetes', category: 'Chronic care', impact: 'Care coordination' },
  { id: 'disease-002', title: 'Migraine', category: 'Neurology', impact: 'Specialized relief' },
  { id: 'disease-003', title: 'Asthma', category: 'Respiratory', impact: 'Family care' },
  { id: 'disease-004', title: 'Joint pain', category: 'Orthopedics', impact: 'Mobility support' },
];

export const sampleSearchSuggestions: SearchSuggestionItem[] = [
  { id: 'suggestion-001', title: 'Aurora Medical Center', subtitle: 'Hospital · Stockholm', meta: '4.9 rating', rating: 4.9, category: 'Hospital' },
  { id: 'suggestion-002', title: 'Beacon Heart Institute', subtitle: 'Hospital · Boston', meta: 'Cardiology center', rating: 4.8, category: 'Hospital' },
  { id: 'suggestion-003', title: 'Luma Children’s Hospital', subtitle: 'Hospital · Toronto', meta: 'Pediatrics specialist', rating: 5.0, category: 'Hospital' },
  { id: 'suggestion-004', title: 'Cardiology', subtitle: 'Specialty · Heart care', meta: 'Most requested', category: 'Specialty' },
  { id: 'suggestion-005', title: 'Neurology', subtitle: 'Specialty · Brain disorders', meta: 'Trusted experts', category: 'Specialty' },
  { id: 'suggestion-006', title: 'Diabetes', subtitle: 'Disease · Chronic care', meta: 'Popular query', category: 'Disease' },
  { id: 'suggestion-007', title: 'Migraine', subtitle: 'Disease · Neurology', meta: 'Condition-based care', category: 'Disease' },
  { id: 'suggestion-008', title: 'Dr. Maya Kapoor', subtitle: 'Doctor · Cardiology', meta: 'Top rated provider', rating: 4.9, category: 'Doctor' },
  { id: 'suggestion-009', title: 'Dr. Priya Nair', subtitle: 'Doctor · Heart Surgery', meta: 'Experienced surgeon', rating: 4.8, category: 'Doctor' },
];

export const sampleSearchKeywords = [
  'Aurora Medical Center',
  'Cardiology',
  'Pediatrics',
  'Emergency Medicine',
  'Telehealth',
  'Neurology',
  'Top rated hospitals',
  'Verified patient feedback',
  'Child care specialists',
  'Near me',
];

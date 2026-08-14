/**
 * Mock datasets for the health-agent feature.
 *
 * Reuses the REAL slug ids from the existing hospital/doctor detail pages so
 * agent cards deep-link into /hospitals/:hospitalId and /doctors/:doctorId
 * without duplicating pages. Pharmacies / labs / medicines are pure mock and
 * carry explicit availability placeholders rather than claiming live stock.
 */

import type {
  DoctorRecommendation,
  HospitalRecommendation,
  LabRecommendation,
  MedicineResult,
  PatientProfile,
  PharmacyRecommendation,
  RecoveryStatus,
  RecoveryTrend,
  RouteRecommendation,
} from '../types';

const buildRoute = (
  destinationName: string,
  destinationAddress: string,
  distanceKm: number,
  travelMin: number,
  deepLink?: RouteRecommendation['deepLink']
): RouteRecommendation => ({
  destinationName,
  destinationAddress,
  distanceKm,
  estimatedTravelTimeMin: travelMin,
  transportMode: 'driving',
  deepLink,
});

/* ----------------------------------------------------------------------------
 * Family profiles
 * ------------------------------------------------------------------------- */

export const patientProfiles: PatientProfile[] = [
  {
    id: 'self',
    label: 'Self',
    relation: 'self',
    contextSummary: 'Diabetes · recent lab report · upcoming appointment',
    contextTags: ['Diabetes', 'Recent report', 'Upcoming appointment'],
  },
  {
    id: 'parent',
    label: 'Parent',
    relation: 'parent',
    contextSummary: 'Hypertension · on regular medication',
    contextTags: ['Hypertension', 'Regular medication'],
  },
  {
    id: 'child',
    label: 'Child (age 4)',
    relation: 'child',
    contextSummary: 'Routine vaccination schedule',
    contextTags: ['Pediatric', 'Vaccination tracking'],
  },
  {
    id: 'spouse',
    label: 'Spouse',
    relation: 'spouse',
    contextSummary: 'Migraine management · follow-up due',
    contextTags: ['Migraine', 'Follow-up due'],
  },
  {
    id: 'other',
    label: 'Family member',
    relation: 'other',
    contextSummary: 'Post-surgery recovery tracking',
    contextTags: ['Recovery', 'Post-surgery'],
  },
];

/* ----------------------------------------------------------------------------
 * Hospitals — reuse existing detail ids
 * Valid existing: aurora-medical-center, beacon-heart-institute,
 * luma-children-hospital, northside-health-pavilion, crescent-wellness-campus
 * ------------------------------------------------------------------------- */

export const hospitalRecommendations: HospitalRecommendation[] = [
  {
    id: 'hosp-aurora',
    detailSlug: 'aurora-medical-center',
    name: 'Aurora Medical Center',
    rating: 4.8,
    reviewCount: 412,
    specialties: ['Cardiology', 'Emergency Medicine', 'Internal Medicine'],
    distanceKm: 2.4,
    estimatedTravelTimeMin: 8,
    isOpen: true,
    hasEmergency: true,
    address: '1200 Harbor Avenue',
    city: 'Seattle, WA',
    route: buildRoute('Aurora Medical Center', '1200 Harbor Avenue, Seattle, WA', 2.4, 8, { kind: 'hospital', id: 'aurora-medical-center' }),
  },
  {
    id: 'hosp-beacon',
    detailSlug: 'beacon-heart-institute',
    name: 'Beacon Heart Institute',
    rating: 4.9,
    reviewCount: 298,
    specialties: ['Cardiology', 'Cardiac Surgery', 'Critical Care'],
    distanceKm: 4.1,
    estimatedTravelTimeMin: 13,
    isOpen: true,
    hasEmergency: true,
    address: '2500 Bay Street',
    city: 'San Francisco, CA',
    route: buildRoute('Beacon Heart Institute', '2500 Bay Street, San Francisco, CA', 4.1, 13, { kind: 'hospital', id: 'beacon-heart-institute' }),
  },
  {
    id: 'hosp-luma',
    detailSlug: 'luma-children-hospital',
    name: "Luma Children's Hospital",
    rating: 4.7,
    reviewCount: 521,
    specialties: ['Pediatrics', 'Neonatal Care', 'Pediatric Surgery'],
    distanceKm: 3.0,
    estimatedTravelTimeMin: 10,
    isOpen: true,
    hasEmergency: true,
    address: '18 Maple Avenue',
    city: 'Toronto, ON',
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, { kind: 'hospital', id: 'luma-children-hospital' }),
  },
  {
    id: 'hosp-northside',
    detailSlug: 'northside-health-pavilion',
    name: 'Northside Health Pavilion',
    rating: 4.6,
    reviewCount: 187,
    specialties: ['Orthopedics', 'Physiotherapy', 'Sports Medicine'],
    distanceKm: 5.2,
    estimatedTravelTimeMin: 16,
    isOpen: true,
    hasEmergency: false,
    address: '55 Camden Road',
    city: 'London, UK',
    route: buildRoute('Northside Health Pavilion', '55 Camden Road, London, UK', 5.2, 16, { kind: 'hospital', id: 'northside-health-pavilion' }),
  },
  {
    id: 'hosp-crescent',
    detailSlug: 'crescent-wellness-campus',
    name: 'Crescent Wellness Campus',
    rating: 4.5,
    reviewCount: 143,
    specialties: ['Mental Health', 'Rehabilitation', 'Preventive Care'],
    distanceKm: 6.8,
    estimatedTravelTimeMin: 21,
    isOpen: true,
    hasEmergency: false,
    address: '400 Lakeside Drive',
    city: 'Chicago, IL',
    route: buildRoute('Crescent Wellness Campus', '400 Lakeside Drive, Chicago, IL', 6.8, 21, { kind: 'hospital', id: 'crescent-wellness-campus' }),
  },
];

/* ----------------------------------------------------------------------------
 * Doctors — reuse existing detail ids
 * Valid existing: anjali-desai, sophia-miller, louise-grant
 * ------------------------------------------------------------------------- */

export const doctorRecommendations: DoctorRecommendation[] = [
  {
    id: 'doc-anjali',
    detailSlug: 'anjali-desai',
    fullName: 'Dr. Anjali Desai',
    specialty: 'Pediatrics',
    hospitalName: "Luma Children's Hospital",
    hospitalDetailSlug: 'luma-children-hospital',
    rating: 4.9,
    reviewCount: 134,
    yearsOfExperience: 15,
    languages: ['English', 'Hindi', 'Telugu'],
    availabilityStatus: 'available',
    nextAvailableSlot: 'Today · 10:30 AM',
    consultationFee: '$170',
    acceptsNewPatients: true,
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, { kind: 'doctor', id: 'anjali-desai' }),
  },
  {
    id: 'doc-sophia',
    detailSlug: 'sophia-miller',
    fullName: 'Dr. Sophia Miller',
    specialty: 'Neonatal Care',
    hospitalName: "Luma Children's Hospital",
    hospitalDetailSlug: 'luma-children-hospital',
    rating: 4.8,
    reviewCount: 92,
    yearsOfExperience: 12,
    languages: ['English', 'French'],
    availabilityStatus: 'busy',
    nextAvailableSlot: 'Tomorrow · 2:00 PM',
    consultationFee: '$160',
    acceptsNewPatients: true,
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, { kind: 'doctor', id: 'sophia-miller' }),
  },
  {
    id: 'doc-louise',
    detailSlug: 'louise-grant',
    fullName: 'Dr. Louise Grant',
    specialty: 'Orthopedics',
    hospitalName: 'Northside Health Pavilion',
    hospitalDetailSlug: 'northside-health-pavilion',
    rating: 4.7,
    reviewCount: 76,
    yearsOfExperience: 18,
    languages: ['English'],
    availabilityStatus: 'limited',
    nextAvailableSlot: 'Fri · 11:00 AM',
    consultationFee: '$185',
    acceptsNewPatients: true,
    route: buildRoute('Northside Health Pavilion', '55 Camden Road, London, UK', 5.2, 16, { kind: 'doctor', id: 'louise-grant' }),
  },
  {
    id: 'doc-maya',
    detailSlug: 'anjali-desai',
    fullName: 'Dr. Maya Patel',
    specialty: 'Cardiology',
    hospitalName: 'Aurora Medical Center',
    hospitalDetailSlug: 'aurora-medical-center',
    rating: 4.9,
    reviewCount: 176,
    yearsOfExperience: 14,
    languages: ['English', 'Hindi', 'Spanish'],
    availabilityStatus: 'available',
    nextAvailableSlot: 'Today · 4:15 PM',
    consultationFee: '$210',
    acceptsNewPatients: true,
    route: buildRoute('Aurora Medical Center', '1200 Harbor Avenue, Seattle, WA', 2.4, 8, { kind: 'doctor', id: 'anjali-desai' }),
  },
];

/* ----------------------------------------------------------------------------
 * Pharmacies — mock only
 * ------------------------------------------------------------------------- */

export const pharmacyRecommendations: PharmacyRecommendation[] = [
  {
    id: 'pharm-1',
    name: 'Greenline Pharmacy',
    distanceKm: 1.1,
    estimatedTravelTimeMin: 4,
    isOpen: true,
    availabilityPlaceholder: 'Stock confirmation available on request',
    estimatedPrice: '$12.40',
    address: '8 Market Street',
    route: buildRoute('Greenline Pharmacy', '8 Market Street', 1.1, 4),
  },
  {
    id: 'pharm-2',
    name: 'CarePoint 24×7 Pharmacy',
    distanceKm: 2.7,
    estimatedTravelTimeMin: 9,
    isOpen: true,
    availabilityPlaceholder: 'Stock confirmation available on request',
    estimatedPrice: '$13.10',
    address: '77 Crescent Road',
    route: buildRoute('CarePoint 24×7 Pharmacy', '77 Crescent Road', 2.7, 9),
  },
  {
    id: 'pharm-3',
    name: 'Sunrise Apothecary',
    distanceKm: 3.9,
    estimatedTravelTimeMin: 12,
    isOpen: false,
    availabilityPlaceholder: 'Opens 8:00 AM — stock confirmation available later',
    estimatedPrice: '$11.85',
    address: '12 Lakeside Drive',
    route: buildRoute('Sunrise Apothecary', '12 Lakeside Drive', 3.9, 12),
  },
];

/* ----------------------------------------------------------------------------
 * Labs — mock only
 * ------------------------------------------------------------------------- */

export const labRecommendations: LabRecommendation[] = [
  {
    id: 'lab-1',
    name: 'Precision Diagnostics Lab',
    testsOffered: ['Complete Blood Count', 'Lipid Profile', 'HbA1c', 'Thyroid Panel'],
    distanceKm: 1.8,
    estimatedTravelTimeMin: 6,
    isOpen: true,
    homeCollectionAvailable: true,
    address: '210 Diagnostic Plaza',
    route: buildRoute('Precision Diagnostics Lab', '210 Diagnostic Plaza', 1.8, 6),
  },
  {
    id: 'lab-2',
    name: 'Meridian Imaging & Labs',
    testsOffered: ['MRI', 'CT Scan', 'Ultrasound', 'X-Ray'],
    distanceKm: 3.4,
    estimatedTravelTimeMin: 11,
    isOpen: true,
    homeCollectionAvailable: false,
    address: '920 Health Avenue',
    route: buildRoute('Meridian Imaging & Labs', '920 Health Avenue', 3.4, 11),
  },
  {
    id: 'lab-3',
    name: 'VitalPath Home Testing',
    testsOffered: ['Blood Sugar', 'Vitamin Panel', 'Liver Function', 'Kidney Function'],
    distanceKm: 0,
    estimatedTravelTimeMin: 0,
    isOpen: true,
    homeCollectionAvailable: true,
    address: 'Home collection across the city',
    route: buildRoute('VitalPath Home Testing', 'Home collection across the city', 0, 0),
  },
];

/* ----------------------------------------------------------------------------
 * Medicines — safety-first, no dosage changes
 * ------------------------------------------------------------------------- */

export const medicineResults: Record<string, MedicineResult> = {
  metformin: {
    id: 'med-metformin',
    name: 'Metformin',
    commonPurpose: 'Commonly used to help manage blood sugar levels in type 2 diabetes.',
    importantSafetyInfo:
      'Take only as prescribed by your doctor. Do not change your dose without medical advice. Seek urgent care if you experience unusual tiredness, severe nausea, or trouble breathing.',
    prescriptionRequired: true,
    interactionWarningPlaceholder:
      'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
    pharmacyDiscoveryAction: pharmacyRecommendations[0],
  },
  paracetamol: {
    id: 'med-paracetamol',
    name: 'Paracetamol (Acetaminophen)',
    commonPurpose: 'Used for temporary relief of mild pain and fever.',
    importantSafetyInfo:
      'Do not exceed the recommended daily limit. Avoid combining with other paracetamol-containing products. Consult a doctor if symptoms persist beyond 3 days.',
    prescriptionRequired: false,
    interactionWarningPlaceholder:
      'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
    pharmacyDiscoveryAction: pharmacyRecommendations[1],
  },
  amoxicillin: {
    id: 'med-amoxicillin',
    name: 'Amoxicillin',
    commonPurpose: 'An antibiotic used to treat a range of bacterial infections.',
    importantSafetyInfo:
      'Take the full course exactly as prescribed. Do not stop early even if you feel better. Seek urgent care for rash, swelling, or difficulty breathing.',
    prescriptionRequired: true,
    interactionWarningPlaceholder:
      'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
    pharmacyDiscoveryAction: pharmacyRecommendations[2],
  },
};

/* ----------------------------------------------------------------------------
 * Recovery seed — mock, clearly labelled
 * ------------------------------------------------------------------------- */

export const recoverySeed: RecoveryStatus = {
  conditionLabel: 'Post-consultation recovery tracking',
  currentTrend: 'same',
  lastCheckInAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  streakDays: 4,
  checkIns: [
    { id: 'rec-1', trend: 'better', note: 'Feeling more energetic today.', recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
    { id: 'rec-2', trend: 'same', note: 'Symptoms stable.', recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString() },
  ],
  followUpReminderPlaceholder: 'Follow-up reminder is a placeholder — connect your calendar to enable real reminders.',
  isMockTracking: true,
};

/* ----------------------------------------------------------------------------
 * Vaccination reminder data (mock)
 * ------------------------------------------------------------------------- */

export interface VaccinationSchedule {
  id: string;
  name: string;
  ageLabel: string;
  status: 'due' | 'upcoming' | 'completed';
  recommendedDate: string;
  notes: string;
}

export const vaccinationSchedules: VaccinationSchedule[] = [
  { id: 'vacc-mmr', name: 'MMR (Measles, Mumps, Rubella)', ageLabel: '12–15 months', status: 'due', recommendedDate: 'Next 2 weeks', notes: 'Routine childhood vaccine.' },
  { id: 'vacc-flu', name: 'Seasonal Influenza', ageLabel: 'Annual', status: 'upcoming', recommendedDate: 'Oct–Nov', notes: 'Recommended annually before flu season.' },
  { id: 'vacc-dtap', name: 'DTaP booster', ageLabel: '4–6 years', status: 'completed', recommendedDate: 'Completed', notes: 'On schedule.' },
];

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

export const buildRouteFromHospital = (h: HospitalRecommendation): RouteRecommendation =>
  buildRoute(h.name, `${h.address}, ${h.city}`, h.distanceKm, h.estimatedTravelTimeMin, { kind: 'hospital', id: h.detailSlug });

export const findHospitalBySpecialty = (specialty: string): HospitalRecommendation[] => {
  const term = specialty.toLowerCase();
  const matched = hospitalRecommendations.filter((h) => h.specialties.some((s) => s.toLowerCase().includes(term)));
  return matched.length > 0 ? matched : hospitalRecommendations.slice(0, 2);
};

export const findDoctorBySpecialty = (specialty: string): DoctorRecommendation[] => {
  const term = specialty.toLowerCase();
  const matched = doctorRecommendations.filter((d) => d.specialty.toLowerCase().includes(term));
  return matched.length > 0 ? matched : doctorRecommendations.slice(0, 2);
};

export const findMedicine = (text: string): MedicineResult | null => {
  const t = text.toLowerCase();
  if (t.includes('metformin')) return medicineResults.metformin;
  if (t.includes('paracetamol') || t.includes('acetaminophen')) return medicineResults.paracetamol;
  if (t.includes('amoxicillin')) return medicineResults.amoxicillin;
  return null;
};

/* ----------------------------------------------------------------------------
 * Facility coordinates — for distance/ETA recomputation from a patient location.
 * Separate map so the existing recommendation shapes stay unchanged; the
 * discovery service overlays real distance/ETA only when a patient location is
 * available (Step 12).
 * ------------------------------------------------------------------------- */

export const hospitalCoordinates: Record<string, { lat: number; lng: number }> = {
  'aurora-medical-center': { lat: 47.6062, lng: -122.3321 },
  'beacon-heart-institute': { lat: 37.7749, lng: -122.4194 },
  'luma-children-hospital': { lat: 43.6532, lng: -79.3832 },
  'northside-health-pavilion': { lat: 51.5074, lng: -0.1278 },
  'crescent-wellness-campus': { lat: 41.8781, lng: -87.6298 },
};

export const pharmacyCoordinates: Record<string, { lat: number; lng: number }> = {
  'pharm-1': { lat: 17.385, lng: 78.4867 },
  'pharm-2': { lat: 17.4399, lng: 78.4982 },
  'pharm-3': { lat: 17.4483, lng: 78.3742 },
};

export const labCoordinates: Record<string, { lat: number; lng: number }> = {
  'lab-1': { lat: 17.4102, lng: 78.4563 },
  'lab-2': { lat: 17.4399, lng: 78.4982 },
  // lab-3 is a home-collection service — no fixed coordinates.
};

/** Default reference point (Hyderabad) used when no patient location is set. */
export const DEFAULT_REFERENCE_POINT: { lat: number; lng: number } = { lat: 17.385, lng: 78.4867 };

export const newCheckIn = (trend: RecoveryTrend, note?: string) => ({
  id: `rec-${Math.random().toString(36).slice(2, 9)}`,
  trend,
  note,
  recordedAt: new Date().toISOString(),
});

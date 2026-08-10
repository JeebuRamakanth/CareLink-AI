/**
 * Mock data for the CareLink-AI agent intelligence layer.
 *
 * IMPORTANT: these are demo fixtures, NOT live data. Hospital/doctor entries reuse
 * the REAL slug ids from the existing detail-page data so agent cards can deep-link
 * to /hospitals/:hospitalId and /doctors/:doctorId without duplicating pages.
 *
 * Pharmacies / labs / medicines are pure mock (no existing routes) and carry an
 * explicit "availability placeholder" rather than claiming real-time stock.
 */

import type {
  DoctorRecommendation,
  HospitalRecommendation,
  LabRecommendation,
  MedicineResult,
  PatientProfile,
  PharmacyRecommendation,
  RecoveryStatus,
  RouteResult,
} from './agentTypes';

const buildRoute = (
  destinationName: string,
  destinationAddress: string,
  distanceKm: number,
  travelMin: number,
  deepLink?: RouteResult['deepLink']
): RouteResult => ({
  destinationName,
  destinationAddress,
  distanceKm,
  estimatedTravelTimeMin: travelMin,
  transportMode: 'driving',
  deepLink,
});

/* ----------------------------------------------------------------------------
 * Step 13 — Family profiles
 * ------------------------------------------------------------------------- */

export const agentPatientProfiles: PatientProfile[] = [
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
 * Step 5 — Hospital recommendations (reuse existing detail slugs)
 *
 * Valid existing hospital detail slugs: aurora-medical-center, beacon-heart-institute,
 * luma-children-hospital, northside-health-pavilion, crescent-wellness-campus.
 * ------------------------------------------------------------------------- */

export const agentHospitalRecommendations: HospitalRecommendation[] = [
  {
    id: 'agent-hosp-aurora',
    detailSlug: 'aurora-medical-center',
    name: 'Aurora Medical Center',
    rating: 4.8,
    reviewCount: 412,
    specialties: ['Cardiology', 'Emergency Medicine', 'Internal Medicine'],
    distanceKm: 2.4,
    estimatedTravelTimeMin: 8,
    isOpen: true,
    hasEmergency: true,
    hasIcu: true,
    is24x7: true,
    address: '1200 Harbor Avenue',
    city: 'Seattle, WA',
    route: buildRoute('Aurora Medical Center', '1200 Harbor Avenue, Seattle, WA', 2.4, 8, {
      kind: 'hospital',
      id: 'aurora-medical-center',
    }),
  },
  {
    id: 'agent-hosp-beacon',
    detailSlug: 'beacon-heart-institute',
    name: 'Beacon Heart Institute',
    rating: 4.9,
    reviewCount: 298,
    specialties: ['Cardiology', 'Cardiac Surgery', 'Critical Care'],
    distanceKm: 4.1,
    estimatedTravelTimeMin: 13,
    isOpen: true,
    hasEmergency: true,
    hasIcu: true,
    is24x7: true,
    address: '2500 Bay Street',
    city: 'San Francisco, CA',
    route: buildRoute('Beacon Heart Institute', '2500 Bay Street, San Francisco, CA', 4.1, 13, {
      kind: 'hospital',
      id: 'beacon-heart-institute',
    }),
  },
  {
    id: 'agent-hosp-luma',
    detailSlug: 'luma-children-hospital',
    name: "Luma Children's Hospital",
    rating: 4.7,
    reviewCount: 521,
    specialties: ['Pediatrics', 'Neonatal Care', 'Pediatric Surgery'],
    distanceKm: 3.0,
    estimatedTravelTimeMin: 10,
    isOpen: true,
    hasEmergency: true,
    hasIcu: true,
    is24x7: false,
    address: '18 Maple Avenue',
    city: 'Toronto, ON',
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, {
      kind: 'hospital',
      id: 'luma-children-hospital',
    }),
  },
  {
    id: 'agent-hosp-northside',
    detailSlug: 'northside-health-pavilion',
    name: 'Northside Health Pavilion',
    rating: 4.6,
    reviewCount: 187,
    specialties: ['Orthopedics', 'Physiotherapy', 'Sports Medicine'],
    distanceKm: 5.2,
    estimatedTravelTimeMin: 16,
    isOpen: true,
    hasEmergency: false,
    hasIcu: false,
    is24x7: false,
    address: '55 Camden Road',
    city: 'London, UK',
    route: buildRoute('Northside Health Pavilion', '55 Camden Road, London, UK', 5.2, 16, {
      kind: 'hospital',
      id: 'northside-health-pavilion',
    }),
  },
  {
    id: 'agent-hosp-crescent',
    detailSlug: 'crescent-wellness-campus',
    name: 'Crescent Wellness Campus',
    rating: 4.5,
    reviewCount: 143,
    specialties: ['Mental Health', 'Rehabilitation', 'Preventive Care'],
    distanceKm: 6.8,
    estimatedTravelTimeMin: 21,
    isOpen: true,
    hasEmergency: false,
    hasIcu: false,
    is24x7: false,
    address: '400 Lakeside Drive',
    city: 'Chicago, IL',
    route: buildRoute('Crescent Wellness Campus', '400 Lakeside Drive, Chicago, IL', 6.8, 21, {
      kind: 'hospital',
      id: 'crescent-wellness-campus',
    }),
  },
];

/* ----------------------------------------------------------------------------
 * Step 6 — Doctor recommendations (reuse existing doctor detail slugs)
 *
 * Valid existing doctor detail slugs: anjali-desai, sophia-miller, louise-grant.
 * Plus mock-only entries for specialties without existing profiles.
 * ------------------------------------------------------------------------- */

export const agentDoctorRecommendations: DoctorRecommendation[] = [
  {
    id: 'agent-doc-anjali',
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
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, {
      kind: 'doctor',
      id: 'anjali-desai',
    }),
  },
  {
    id: 'agent-doc-sophia',
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
    route: buildRoute("Luma Children's Hospital", '18 Maple Avenue, Toronto, ON', 3.0, 10, {
      kind: 'doctor',
      id: 'sophia-miller',
    }),
  },
  {
    id: 'agent-doc-louise',
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
    route: buildRoute('Northside Health Pavilion', '55 Camden Road, London, UK', 5.2, 16, {
      kind: 'doctor',
      id: 'louise-grant',
    }),
  },
  {
    id: 'agent-doc-maya-mock',
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
    route: buildRoute('Aurora Medical Center', '1200 Harbor Avenue, Seattle, WA', 2.4, 8, {
      kind: 'doctor',
      id: 'anjali-desai',
    }),
  },
];

/* ----------------------------------------------------------------------------
 * Step 7 — Pharmacy recommendations (mock only; availability placeholder)
 * ------------------------------------------------------------------------- */

export const agentPharmacyRecommendations: PharmacyRecommendation[] = [
  {
    id: 'agent-pharm-1',
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
    id: 'agent-pharm-2',
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
    id: 'agent-pharm-3',
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
 * Step 7 — Lab / diagnostic centers (mock only)
 * ------------------------------------------------------------------------- */

export const agentLabRecommendations: LabRecommendation[] = [
  {
    id: 'agent-lab-1',
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
    id: 'agent-lab-2',
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
    id: 'agent-lab-3',
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
 * Step 10 — Medicine results (mock; safety-first, no dosage changes)
 * ------------------------------------------------------------------------- */

export const agentMedicineResults: Record<string, MedicineResult> = {
  metformin: {
    id: 'med-metformin',
    name: 'Metformin',
    commonPurpose: 'Commonly used to help manage blood sugar levels in type 2 diabetes.',
    importantSafetyInfo:
      'Take only as prescribed by your doctor. Do not change your dose without medical advice. Seek urgent care if you experience unusual tiredness, severe nausea, or trouble breathing.',
    prescriptionRequired: true,
    interactionWarningPlaceholder:
      'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
    pharmacyDiscoveryAction: agentPharmacyRecommendations[0],
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
    pharmacyDiscoveryAction: agentPharmacyRecommendations[1],
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
    pharmacyDiscoveryAction: agentPharmacyRecommendations[2],
  },
};

/* ----------------------------------------------------------------------------
 * Step 15 — Recovery status seed (mock, clearly labelled)
 * ------------------------------------------------------------------------- */

export const agentRecoverySeed: RecoveryStatus = {
  conditionLabel: 'Post-consultation recovery tracking',
  currentTrend: 'same',
  lastCheckInAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  streakDays: 4,
  checkIns: [
    {
      id: 'rec-1',
      trend: 'better',
      note: 'Feeling more energetic today.',
      recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    },
    {
      id: 'rec-2',
      trend: 'same',
      note: 'Symptoms stable.',
      recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    },
  ],
  followUpReminderPlaceholder:
    'Follow-up reminder is a placeholder — connect your calendar to enable real reminders.',
  isMockTracking: true,
};

/* ----------------------------------------------------------------------------
 * Helpers for building routes on the fly
 * ------------------------------------------------------------------------- */

export const buildRouteFromHospital = (hospital: HospitalRecommendation): RouteResult =>
  buildRoute(hospital.name, `${hospital.address}, ${hospital.city}`, hospital.distanceKm, hospital.estimatedTravelTimeMin, {
    kind: 'hospital',
    id: hospital.detailSlug,
  });

export const findHospitalBySpecialty = (specialty: string): HospitalRecommendation[] => {
  const term = specialty.toLowerCase();
  const matched = agentHospitalRecommendations.filter((h) =>
    h.specialties.some((s) => s.toLowerCase().includes(term))
  );
  return matched.length > 0 ? matched : agentHospitalRecommendations.slice(0, 2);
};

export const findDoctorBySpecialty = (specialty: string): DoctorRecommendation[] => {
  const term = specialty.toLowerCase();
  const matched = agentDoctorRecommendations.filter((d) => d.specialty.toLowerCase().includes(term));
  return matched.length > 0 ? matched : agentDoctorRecommendations.slice(0, 2);
};

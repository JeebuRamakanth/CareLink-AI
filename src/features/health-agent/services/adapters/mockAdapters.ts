/**
 * Mock adapter implementations.
 *
 * Every adapter is an in-memory stand-in for a real service. They read from the
 * mock datasets and simulate a little latency so the UI can exercise its
 * thinking/processing states. Swapping in a real backend means implementing the
 * matching interface in `interfaces.ts` — nothing here changes in the UI.
 */

import type {
  AgentAdapters,
} from './interfaces';
import type {
  AgentIntent,
  AgentLanguage,
  ConfidenceLevel,
  DocumentAnalysis,
  EmergencyAssessment,
  HealthDocument,
  HospitalRecommendation,
  IntentClassification,
  LabRecommendation,
  MedicalReport,
  MedicalReportValue,
  MedicineInput,
  MedicineResult,
  PatientContext,
  PharmacyRecommendation,
  DoctorRecommendation,
  RecoveryStatus,
  RecoveryTrend,
  RouteRecommendation,
} from '../../types';
import {
  findMedicine,
  hospitalRecommendations,
  labRecommendations,
  pharmacyRecommendations,
  doctorRecommendations,
  recoverySeed,
  newCheckIn,
} from '../../data/mockData';
import {
  extractLocationHint,
  filterDoctorsBySpecialty,
  filterHospitalsBySpecialty,
  getDoctorRecommendations,
  getHospitalRecommendations,
  searchDoctorsInList,
  searchHospitalsInList,
  type RecommendationOrigin,
} from '../directoryRecommendations';
import { buildMapsDirectionsUrl, buildMapsPlaceUrl } from '../../../../lib';
import { emergencyContacts, EMERGENCY_DISCLAIMER } from '../../../documents/services/clinical/emergencyConfig';
import { assessRedFlags } from '../ai/redFlags';
import { detectLanguage as detectInputLanguage } from '../ai/languageDetector';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * `emergency` is intentionally EMPTY: the emergency intent is decided by the
 * context-aware `assessRedFlags()` above, which understands negation and
 * educational framing. Keeping a keyword list here would reintroduce the
 * bypass that misrouted questions like "what are the symptoms of a heart
 * attack?" to the emergency path.
 */
const EMERGENCY_PATTERNS: string[] = [];

const INTENT_PATTERNS: Record<AgentIntent, string[]> = {
  report: ['report', 'reports', 'explain this', 'explain my', 'blood report', 'lab report', 'upload report', 'analyze report', 'medical report', 'pdf', 'document'],
  appointment: ['appointment', 'appointments', 'book a doctor', 'book doctor', 'reschedule', 'cancel appointment', 'see my appointments', 'my appointments', 'book appointment'],
  route: ['directions', 'route to', 'how do i get', 'how to reach', 'distance', 'travel time', 'get directions'],
  pharmacy: ['pharmacy', 'pharmacies', 'medicine near', 'chemist', 'drug store', 'where can i get this medicine', 'where can i buy'],
  lab: ['lab', 'laboratory', 'diagnostic', 'diagnostics', 'blood test', 'scan', 'mri', 'ct scan', 'ultrasound', 'x-ray', 'imaging'],
  blood: ['blood bank', 'blood banks', 'blood centre', 'blood center', 'blood centres', 'blood centers', 'donate blood', 'blood donation', 'platelets', 'plasma', 'transfusion'],
  medicine: ['medicine', 'medicines', 'tablet', 'tablets', 'pill', 'pills', 'drug', 'prescription', 'metformin', 'paracetamol', 'amoxicillin', 'capsule', 'syrup', 'enti', 'ee tablet'],
  doctor: ['doctor', 'doctors', 'specialist', 'physician', 'cardiologist', 'neurologist', 'pediatrician', 'dermatologist', 'orthopedic'],
  hospital: ['hospital', 'hospitals', 'medical center', 'emergency room', 'er near', 'clinic near'],
  disease: ['disease', 'condition', 'diabetes', 'asthma', 'hypertension', 'migraine', 'arthritis', 'thyroid', 'covid'],
  symptom: ['symptom', 'symptoms', 'fever', 'cough', 'headache', 'pain', 'nausea', 'dizzy', 'dizziness', 'fatigue', 'tired', 'sore throat', 'rash', 'vomiting', 'diarrhea', 'fever and'],
  vaccination: ['vaccination', 'vaccine', 'immunization', 'vaccination schedule'],
  'child-care': ['child', 'kid', 'baby', 'pediatric', 'newborn'],
  'elder-care': ['elder', 'elderly', 'senior', 'old age', 'parent care'],
  'mental-health': ['mental', 'anxiety', 'depress', 'stress', 'panic', 'therapy', 'counsel'],
  family: ['family', 'mother', 'father', 'spouse', 'switch profile'],
  location: ['near me', 'nearby', 'close to', 'around me', 'my area'],
  recovery: ['recovery', 'recovering', 'how am i doing', 'recovery tracker', 'feeling better', 'feeling worse', 'same as'],
  emergency: EMERGENCY_PATTERNS,
  general: [],
};

const SPECIALTY_HINTS: { keywords: string[]; specialty: string }[] = [
  { keywords: ['heart', 'chest', 'cardiac', 'cardio'], specialty: 'Cardiology' },
  { keywords: ['brain', 'stroke', 'neuro', 'seizure'], specialty: 'Neurology' },
  { keywords: ['child', 'kid', 'baby', 'pediatric'], specialty: 'Pediatrics' },
  { keywords: ['bone', 'joint', 'knee', 'spine', 'orthopedic'], specialty: 'Orthopedics' },
  { keywords: ['pregnan', 'matern', 'gynec', 'women'], specialty: 'OB-GYN' },
  { keywords: ['skin', 'dermat', 'rash'], specialty: 'Dermatology' },
  { keywords: ['mental', 'anxiety', 'depress', 'stress'], specialty: 'Mental Health' },
  { keywords: ['eye', 'vision', 'ophthalm'], specialty: 'Ophthalmology' },
  { keywords: ['diabetes', 'sugar', 'glucose'], specialty: 'Endocrinology' },
];

const normalize = (input: string): string => input.toLowerCase().trim();
const hasAny = (text: string, patterns: string[]): boolean => patterns.some((p) => text.includes(p));

/** Patient origin (for real distance) derived from the runtime patient context. */
const originFromContext = (context: PatientContext): RecommendationOrigin | null => {
  const loc = context?.location ?? context?.navigation?.location;
  if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    return { lat: loc.lat, lng: loc.lng, label: loc.label };
  }
  return null;
};

const extractEntities = (text: string): string[] => {
  const entities: string[] = [];
  for (const hint of SPECIALTY_HINTS) {
    if (hasAny(text, hint.keywords) && !entities.includes(hint.specialty)) entities.push(hint.specialty);
  }
  for (const med of ['metformin', 'paracetamol', 'amoxicillin', 'aspirin', 'insulin']) {
    if (text.includes(med) && !entities.includes(med)) entities.push(med);
  }
  return entities;
};

/**
 * Language hint for the input.
 *
 * Delegates to the shared multilingual detector so the legacy classifier, the
 * orchestrator and the AI engine can never disagree about the user's language.
 * Returns the detected language, or null when nothing non-English was found.
 */
const detectLanguage = (rawInput: string): AgentLanguage | undefined => {
  const detection = detectInputLanguage(rawInput);
  if (detection.language === 'en' && detection.confidence === 'low') return undefined;
  return detection.language === 'en' && !detection.transliterated ? undefined : detection.language;
};

/* ----------------------------------------------------------------------------
 * Mock AI provider
 * ------------------------------------------------------------------------- */

export const mockAIProvider: AgentAdapters['ai'] = {
  async classify(input) {
    await wait(80);
    const text = normalize(input);
    if (!text) return { intent: 'general', confidence: 'low', entities: [], rawInput: input, detectedLanguage: detectLanguage(input) };

    // Emergency classification delegates to the SAME context-aware red-flag
    // assessor the deterministic safety floor uses. There is deliberately NO
    // separate English keyword shortcut here: a shortcut would bypass the
    // negation/educational context checks and misroute a question such as
    // "what are the symptoms of a heart attack?" to the emergency path.
    const redFlags = assessRedFlags(input);
    if (redFlags.isEmergency) {
      return { intent: 'emergency', confidence: 'high', entities: extractEntities(text), rawInput: input, detectedLanguage: detectLanguage(input) };
    }
    // A present (non-negated, non-educational) report of a red-flag symptom —
    // including Telugu/Hindi/Kannada/Tamil script and transliteration — is also
    // the emergency intent.
    if (redFlags.matches.length > 0 && redFlags.basis === 'present-report') {
      return { intent: 'emergency', confidence: 'high', entities: extractEntities(text), rawInput: input, detectedLanguage: detectLanguage(input) };
    }

    // Order matters: a more specific intent must be tested before a broader one
    // ('report' catches "blood report" before 'blood'; 'blood' catches
    // "blood bank" before 'lab'/'location' can claim it).
    const order: AgentIntent[] = ['report', 'blood', 'appointment', 'route', 'pharmacy', 'lab', 'medicine', 'vaccination', 'child-care', 'elder-care', 'mental-health', 'family', 'recovery', 'doctor', 'hospital', 'disease', 'symptom', 'location'];
    for (const intent of order) {
      if (hasAny(text, INTENT_PATTERNS[intent])) {
        const confidence: ConfidenceLevel = 'medium';
        return { intent, confidence, entities: extractEntities(text), rawInput: input, detectedLanguage: detectLanguage(input) };
      }
    }
    const entities = extractEntities(text);
    if (entities.length > 0) return { intent: 'symptom', confidence: 'medium', entities, rawInput: input, detectedLanguage: detectLanguage(input) };
    return { intent: 'general', confidence: 'low', entities: [], rawInput: input, detectedLanguage: detectLanguage(input) };
  },
};

/* ----------------------------------------------------------------------------
 * Search adapters.
 *
 * These now read the SAME hospital/doctor directory the UI pages use (Supabase
 * registry when configured, otherwise the sourced Machilipatnam directory) via
 * `directoryRecommendations`. The agent therefore never surfaces a private,
 * disconnected demo set — every card carries a real stable id that resolves on
 * `/hospitals/:id` and `/doctors/:id`. The mock fallback list is retained ONLY
 * as a last resort if the directory itself returns nothing.
 * ------------------------------------------------------------------------- */

export const mockHospitalSearch: AgentAdapters['hospitals'] = {
  async search(query, context) {
    await wait(60);
    const all = await getHospitalRecommendations(originFromContext(context));
    const specialty = extractEntities(normalize(query)).find((e) => /^[A-Z]/.test(e));
    const locationHint = extractLocationHint(query);
    let pool = specialty ? filterHospitalsBySpecialty(all, specialty) : all;
    if (locationHint) {
      const byLocation = searchHospitalsInList(pool, locationHint);
      // Only narrow by location when it actually matches records.
      if (byLocation.length > 0) pool = byLocation;
    }
    if (pool.length > 0) return pool.slice(0, 5);
    return hospitalRecommendations.slice(0, 3);
  },
  async bySpecialty(specialty) {
    await wait(60);
    const all = await getHospitalRecommendations();
    const matched = filterHospitalsBySpecialty(all, specialty);
    return matched.length > 0 ? matched : hospitalRecommendations.slice(0, 2);
  },
};

export const mockDoctorSearch: AgentAdapters['doctors'] = {
  async search(query) {
    await wait(60);
    const all = await getDoctorRecommendations();
    const specialty = extractEntities(normalize(query)).find((e) => /^[A-Z]/.test(e));
    let pool = specialty ? filterDoctorsBySpecialty(all, specialty) : all;
    const q = query.trim().toLowerCase();
    if (pool.length === 0 && q) pool = searchDoctorsInList(all, q);
    if (pool.length > 0) return pool.slice(0, 5);
    return doctorRecommendations.slice(0, 3);
  },
  async bySpecialty(specialty) {
    await wait(60);
    const all = await getDoctorRecommendations();
    const matched = filterDoctorsBySpecialty(all, specialty);
    return matched.length > 0 ? matched : doctorRecommendations.slice(0, 2);
  },
};

export const mockPharmacySearch: AgentAdapters['pharmacies'] = {
  async search(_medicineName) {
    await wait(120);
    return pharmacyRecommendations;
  },
};

export const mockLabSearch: AgentAdapters['labs'] = {
  async search() {
    await wait(120);
    return labRecommendations;
  },
};

/* ----------------------------------------------------------------------------
 * Mock maps adapter
 * ------------------------------------------------------------------------- */

export const mockMapsRouting: AgentAdapters['maps'] = {
  async routeTo(destinationId, kind) {
    await wait(100);
    const pool = kind === 'hospital' ? hospitalRecommendations : kind === 'doctor' ? doctorRecommendations : [];
    const item = pool.find((x) => ('detailSlug' in x ? x.detailSlug === destinationId : false));
    if (item && 'route' in item && item.route) return item.route as RouteRecommendation;
    return hospitalRecommendations[0]?.route ?? null;
  },
};

/* ----------------------------------------------------------------------------
 * Mock maps/directions/geocoding — uses static mock distances, never live data
 * ------------------------------------------------------------------------- */

export const mockMapsProvider: AgentAdapters['mapsProvider'] = {
  name: 'Mock Maps',
  directionsUrl: (params) => buildMapsDirectionsUrl(params),
  placeUrl: (query) => buildMapsPlaceUrl(query),
};

export const mockDirectionsProvider: AgentAdapters['directions'] = {
  available: false,
  async route(_origin, _destination) {
    await wait(120);
    // Never fabricate live distance/ETA — return null so callers show mock data
    // from the dataset instead of invented numbers.
    return null;
  },
};

export const mockGeocodingProvider: AgentAdapters['geocoding'] = {
  available: false,
  async geocode(_address) {
    await wait(100);
    return null;
  },
  async reverseGeocode(_coords) {
    await wait(100);
    return null;
  },
};

/* ----------------------------------------------------------------------------
 * Mock storage adapter — local blob URLs, never uploads to a real service
 * ------------------------------------------------------------------------- */

export const mockStorageProvider: AgentAdapters['storage'] = {
  name: 'Local Storage (demo)',
  available: false,
  async upload(file) {
    await wait(180);
    const url = typeof URL !== 'undefined' && file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    return {
      url,
      previewUrl: url || undefined,
      providerMetadata: { mock: 'true', fileName: file.name },
      source: 'mock',
    };
  },
};

/* ----------------------------------------------------------------------------
 * Mock appointment adapter — returns existing route URLs
 * ------------------------------------------------------------------------- */

const APT_BASE = '/appointments';

export const mockAppointmentService: AgentAdapters['appointments'] = {
  viewAppointmentsUrl: () => APT_BASE,
  bookUrl: (doctorDetailSlug, hospitalDetailSlug) => {
    const params = new URLSearchParams();
    if (doctorDetailSlug) params.set('doc', doctorDetailSlug);
    if (hospitalDetailSlug) params.set('hosp', hospitalDetailSlug);
    const qs = params.toString();
    return qs ? `${APT_BASE}?${qs}` : APT_BASE;
  },
  rescheduleUrl: (appointmentId) => (appointmentId ? `${APT_BASE}?reschedule=${appointmentId}` : `${APT_BASE}?reschedule`),
  cancelUrl: (appointmentId) => (appointmentId ? `${APT_BASE}?cancel=${appointmentId}` : `${APT_BASE}?cancel`),
};

/* ----------------------------------------------------------------------------
 * Mock document analysis
 * ------------------------------------------------------------------------- */

export const mockDocumentAnalysis: AgentAdapters['documents'] = {
  async analyze(document) {
    await wait(200);
    const name = document.fileName.toLowerCase();
    let category: DocumentAnalysis['category'] = 'general-document';
    if (document.kind === 'image') category = name.includes('med') || name.includes('tablet') || name.includes('pill') ? 'medicine-image' : 'imaging';
    else if (name.includes('prescription')) category = 'prescription';
    else if (name.includes('discharge')) category = 'discharge-summary';
    else if (document.kind === 'pdf' || name.includes('report') || name.includes('lab')) category = 'lab-report';

    const findings: Record<DocumentAnalysis['category'], string[]> = {
      'lab-report': ['HbA1c 6.8%', 'Fasting glucose 132 mg/dL', 'Lipid panel borderline'],
      prescription: ['Prescribed medication listed', 'Dosage instructions present', 'Follow-up advised'],
      'medicine-image': ['Round white tablet detected', 'Imprint partially visible', 'Confirm with pharmacist'],
      'discharge-summary': ['Discharge medications listed', 'Follow-up appointment advised', 'Activity restrictions noted'],
      imaging: ['Imaging study detected', 'Radiologist review recommended', 'Compare with prior studies if available'],
      'general-document': ['Document received', 'Structured extraction pending real backend'],
    };

    const analysis: DocumentAnalysis = {
      category,
      extractedTextPlaceholder: 'Extracted text will be populated by a real OCR/NLP layer in a future step.',
      keyFindings: findings[category],
      isMock: true,
      provenance: {
        sourceDocumentId: document.id,
        processedAt: new Date().toISOString(),
        provider: 'mock',
      },
    };
    return analysis;
  },
};

/* ----------------------------------------------------------------------------
 * Mock medicine recognition
 * ------------------------------------------------------------------------- */

export const mockMedicineRecognition: AgentAdapters['medicines'] = {
  async recognize(input) {
    await wait(150);
    if (input.text) {
      const found = findMedicine(input.text);
      if (found) {
        // Demo catalog match: a NAME was found in a tiny exact-match list. This is
        // NOT a verification, so the confidence is deliberately low and the result
        // is flagged uncertain — the caller must present it as unverified.
        return { ...found, recognitionConfidence: 0.35, uncertain: true, source: 'mock' as const };
      }
    }
    return null;
  },
};

/* ----------------------------------------------------------------------------
 * Mock recovery service
 * ------------------------------------------------------------------------- */

export const mockRecoveryService: AgentAdapters['recovery'] = {
  async getStatus() {
    await wait(80);
    return recoverySeed;
  },
  async checkIn(trend, note) {
    await wait(80);
    const checkIns = [newCheckIn(trend, note), ...recoverySeed.checkIns];
    return { ...recoverySeed, currentTrend: trend, lastCheckInAt: new Date().toISOString(), streakDays: recoverySeed.streakDays + 1, checkIns };
  },
};

/* ----------------------------------------------------------------------------
 * Mock emergency service
 * ------------------------------------------------------------------------- */

export const mockEmergencyService: AgentAdapters['emergency'] = {
  async assess(_input, context) {
    await wait(100);
    // Emergency facilities come from the SAME directory the UI uses, filtered to
    // records that genuinely carry an emergency capability — never a private
    // demo set. Distances are real (computed from the patient's location) or
    // explicitly unavailable; the caller re-ranks so the nearest suitable
    // facility wins over a higher-rated non-emergency clinic.
    const origin = originFromContext(context);
    const all = await getHospitalRecommendations(origin);
    const emergencyHospitals = all
      .filter((h) => h.hasEmergency)
      .sort((a, b) => (a.distanceAvailable ? a.distanceKm : Number.POSITIVE_INFINITY) - (b.distanceAvailable ? b.distanceKm : Number.POSITIVE_INFINITY));
    const pool = emergencyHospitals.length > 0 ? emergencyHospitals : all.slice(0, 3);
    const facilities = pool.map((facility) => ({
      id: facility.id,
      detailSlug: facility.detailSlug,
      name: facility.name,
      distanceKm: facility.distanceKm,
      estimatedTravelTimeMin: facility.estimatedTravelTimeMin,
      address: [facility.address, facility.city].filter(Boolean).join(', '),
      route: facility.route,
    }));
    const assessment: EmergencyAssessment = {
      severity: 'emergency',
      indicatorLabel: 'EMERGENCY',
      immediateGuidance: [
        'If this is life-threatening, call your local emergency number now.',
        'Do not drive yourself if you are alone — ask someone nearby or call for an ambulance.',
        'Stay calm, sit or lie down in a safe position, and keep your phone nearby.',
      ],
      recommendedNextAction: 'Head to the nearest emergency facility or call emergency services immediately.',
      nearbyFacilities: facilities,
      contacts: emergencyContacts().map((c) => ({ label: c.label, phone: c.phone, href: c.href })),
      disclaimer: EMERGENCY_DISCLAIMER,
    };
    return assessment;
  },
};

/* ----------------------------------------------------------------------------
 * Default adapter registry — mock implementations wired together.
 * ------------------------------------------------------------------------- */

export const mockAdapters: AgentAdapters = {
  ai: mockAIProvider,
  hospitals: mockHospitalSearch,
  doctors: mockDoctorSearch,
  pharmacies: mockPharmacySearch,
  labs: mockLabSearch,
  maps: mockMapsRouting,
  mapsProvider: mockMapsProvider,
  directions: mockDirectionsProvider,
  geocoding: mockGeocodingProvider,
  storage: mockStorageProvider,
  appointments: mockAppointmentService,
  documents: mockDocumentAnalysis,
  medicines: mockMedicineRecognition,
  recovery: mockRecoveryService,
  emergency: mockEmergencyService,
};

export type {
  AgentIntent,
  IntentClassification,
  PatientContext,
  HospitalRecommendation,
  DoctorRecommendation,
  PharmacyRecommendation,
  LabRecommendation,
  MedicineResult,
  MedicineInput,
  MedicalReport,
  MedicalReportValue,
  RecoveryStatus,
  RecoveryTrend,
  EmergencyAssessment,
  HealthDocument,
  DocumentAnalysis,
  RouteRecommendation,
};

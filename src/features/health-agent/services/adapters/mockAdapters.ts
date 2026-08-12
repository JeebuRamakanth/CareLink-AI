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
  buildRouteFromHospital,
  findDoctorBySpecialty,
  findHospitalBySpecialty,
  findMedicine,
  hospitalRecommendations,
  labRecommendations,
  pharmacyRecommendations,
  doctorRecommendations,
  recoverySeed,
  newCheckIn,
} from '../../data/mockData';
import { buildMapsDirectionsUrl, buildMapsPlaceUrl } from '../../../../lib';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const EMERGENCY_PATTERNS = [
  'severe chest pain', 'chest pain', "can't breathe", 'cannot breathe', 'difficulty breathing',
  'stroke', 'unconscious', 'not breathing', 'severe bleeding', 'heavy bleeding', 'suicidal',
  'suicide', 'overdose', 'severe allergic', 'anaphylaxis', 'seizure', 'fitting', 'heart attack',
  'cardiac arrest', 'choking', 'severe burn', 'lost consciousness', 'fainted', 'fainting',
  'passed out', 'severe head injury', 'emergency',
];

const INTENT_PATTERNS: Record<AgentIntent, string[]> = {
  report: ['report', 'reports', 'explain this', 'explain my', 'blood report', 'lab report', 'upload report', 'analyze report', 'medical report', 'pdf', 'document'],
  appointment: ['appointment', 'appointments', 'book a doctor', 'book doctor', 'reschedule', 'cancel appointment', 'see my appointments', 'my appointments', 'book appointment'],
  route: ['directions', 'route to', 'how do i get', 'how to reach', 'distance', 'travel time', 'get directions'],
  pharmacy: ['pharmacy', 'pharmacies', 'medicine near', 'chemist', 'drug store', 'where can i get this medicine', 'where can i buy'],
  lab: ['lab', 'laboratory', 'diagnostic', 'diagnostics', 'blood test', 'scan', 'mri', 'ct scan', 'ultrasound', 'x-ray', 'imaging'],
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

const detectLanguage = (rawInput: string): AgentLanguage | undefined => {
  const text = normalize(rawInput);
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  const hinglish = ['kya', 'kaise', 'mera', 'meri', 'muje', 'mujhe', 'hai', 'dard', 'bimari', 'ilaaj', 'naaku', 'undi'];
  if (hinglish.some((w) => text.includes(w))) return text.includes('naaku') || text.includes('undi') ? 'te' : 'hi';
  return undefined;
};

/* ----------------------------------------------------------------------------
 * Mock AI provider
 * ------------------------------------------------------------------------- */

export const mockAIProvider: AgentAdapters['ai'] = {
  async classify(input) {
    await wait(80);
    const text = normalize(input);
    if (!text) return { intent: 'general', confidence: 'low', entities: [], rawInput: input, detectedLanguage: detectLanguage(input) };

    if (hasAny(text, EMERGENCY_PATTERNS)) {
      return { intent: 'emergency', confidence: 'high', entities: extractEntities(text), rawInput: input, detectedLanguage: detectLanguage(input) };
    }

    const order: AgentIntent[] = ['report', 'appointment', 'route', 'pharmacy', 'lab', 'medicine', 'vaccination', 'child-care', 'elder-care', 'mental-health', 'family', 'recovery', 'doctor', 'hospital', 'disease', 'symptom', 'location'];
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
 * Mock search adapters
 * ------------------------------------------------------------------------- */

export const mockHospitalSearch: AgentAdapters['hospitals'] = {
  async search(query) {
    await wait(120);
    const specialty = extractEntities(normalize(query)).find((e) => /^[A-Z]/.test(e));
    return specialty ? findHospitalBySpecialty(specialty) : hospitalRecommendations.slice(0, 3);
  },
  async bySpecialty(specialty) {
    await wait(100);
    return findHospitalBySpecialty(specialty);
  },
};

export const mockDoctorSearch: AgentAdapters['doctors'] = {
  async search(query) {
    await wait(120);
    const specialty = extractEntities(normalize(query)).find((e) => /^[A-Z]/.test(e));
    return specialty ? findDoctorBySpecialty(specialty) : doctorRecommendations.slice(0, 3);
  },
  async bySpecialty(specialty) {
    await wait(100);
    return findDoctorBySpecialty(specialty);
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
      if (found) return found;
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
  async assess(_input) {
    await wait(100);
    const facility = hospitalRecommendations[0];
    const assessment: EmergencyAssessment = {
      severity: 'emergency',
      indicatorLabel: 'EMERGENCY',
      immediateGuidance: [
        'If this is life-threatening, call your local emergency number now.',
        'Do not drive yourself if you are alone — ask someone nearby or call for an ambulance.',
        'Stay calm, sit or lie down in a safe position, and keep your phone nearby.',
      ],
      recommendedNextAction: 'Head to the nearest emergency facility or call emergency services immediately.',
      nearbyFacilities: [
        {
          id: facility.id,
          detailSlug: facility.detailSlug,
          name: facility.name,
          distanceKm: facility.distanceKm,
          estimatedTravelTimeMin: facility.estimatedTravelTimeMin,
          address: `${facility.address}, ${facility.city}`,
          route: buildRouteFromHospital(facility),
        },
      ],
      contacts: [
        { label: 'Emergency services', phone: '911', href: 'tel:911' },
        { label: 'Local emergency helpline', phone: '112', href: 'tel:112' },
      ],
      disclaimer: 'If this is a life-threatening emergency, call your local emergency number immediately. This guidance does not replace emergency services.',
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

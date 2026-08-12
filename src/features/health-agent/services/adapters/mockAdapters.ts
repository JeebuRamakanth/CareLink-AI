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
  DocumentAnalysisCategory,
  DocumentAnalysisResult,
  DocumentAttachment,
  DocumentSafetyAssessment,
  ExtractedMedicalValue,
  EmergencyAssessment,
  HealthDocument,
  HealthDocumentKind,
  HospitalRecommendation,
  IntentClassification,
  LabRecommendation,
  MedicalReport,
  MedicalReportValue,
  MedicineInput,
  MedicineRecognitionResult,
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
  async upload(file, options) {
    // Simulate progress reporting for a few frames so the UI exercises its
    // progress bar even in demo mode.
    const total = file.size;
    for (let p = 25; p < 90; p += 25) {
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (options?.onProgress) options.onProgress({ progress: p });
      // small await between ticks; keep below the abort check cadence
      await new Promise<void>((r) => setTimeout(r, Math.min(60, total > 0 ? 40 : 20)));
    }
    const url = typeof URL !== 'undefined' && file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    if (options?.onProgress) options.onProgress({ progress: 100 });
    return {
      url,
      previewUrl: url || undefined,
      providerMetadata: { mock: 'true', fileName: file.name },
      storageRef: { bucket: 'local', path: `local/${file.name}` },
      source: 'mock',
    };
  },
  async signedUrl() {
    return null;
  },
  async delete() {
    return true;
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

/**
 * Non-diagnostic safety assessment over extracted values (Step 11 §safety).
 * Never claims a diagnosis — only flags values outside reference ranges and
 * routes to a clinician. Emergency indicators escalate to urgent-care guidance.
 */
function assessMockSafety(category: DocumentAnalysisCategory, attentionValues: ExtractedMedicalValue[]): DocumentSafetyAssessment {
  const hasCritical = attentionValues.some((v) => v.abnormalFlag === 'critical-high' || v.abnormalFlag === 'critical-low');
  const hasAbnormal = attentionValues.length > 0;
  const hasEmergencyIndicator = hasCritical;
  const concerns: string[] = attentionValues.map(
    (v) => `${v.testName} (${v.value}${v.unit ? ` ${v.unit}` : ''}) sits outside the listed reference range${v.referenceRange ? ` of ${v.referenceRange}` : ''}.`,
  );
  const summary = hasCritical
    ? 'One or more values are marked critical. This can have multiple causes — seek prompt professional evaluation.'
    : hasAbnormal
      ? 'Your report contains values outside the listed reference range. This can have multiple causes. Consider discussing it with a qualified clinician.'
      : category === 'medicine-image'
        ? 'The uploaded image could not be reliably identified. Do not act on an unverified identification.'
        : 'No values requiring attention were flagged in this mock extraction.';
  const recommendedActions: string[] = hasCritical
    ? ['Seek urgent medical attention or contact emergency services if you feel unwell.', 'Share this report with a clinician immediately.']
    : hasAbnormal
      ? ['Share these results with your doctor to build a management plan.', 'Do not start, stop, or change medication without professional advice.']
      : ['Keep this document for your records and review with your care team as needed.'];
  return {
    tier: hasCritical ? 'emergency' : hasAbnormal ? 'triage' : 'educational',
    summary,
    concerns,
    recommendedActions,
    hasEmergencyIndicator,
    disclaimer: 'This is a mock, non-diagnostic assessment. CareLink has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
    isMock: true,
  };
}

const MOCK_LAB_VALUES: ExtractedMedicalValue[] = [
  { id: 'lv1', testName: 'Fasting Blood Sugar', value: '132', unit: 'mg/dL', referenceRange: '70–99', abnormalFlag: 'high', collectionDate: undefined, extractedFromDocument: false },
  { id: 'lv2', testName: 'HbA1c', value: '6.8', unit: '%', referenceRange: '< 5.7%', abnormalFlag: 'high', extractedFromDocument: false },
  { id: 'lv3', testName: 'Total Cholesterol', value: '212', unit: 'mg/dL', referenceRange: '< 200', abnormalFlag: 'high', extractedFromDocument: false },
  { id: 'lv4', testName: 'LDL Cholesterol', value: '138', unit: 'mg/dL', referenceRange: '< 100', abnormalFlag: 'high', extractedFromDocument: false },
  { id: 'lv5', testName: 'Hemoglobin', value: '14.2', unit: 'g/dL', referenceRange: '13.5–17.5', abnormalFlag: 'normal', extractedFromDocument: false },
  { id: 'lv6', testName: 'WBC Count', value: '6.8', unit: '×10³/μL', referenceRange: '4.0–11.0', abnormalFlag: 'normal', extractedFromDocument: false },
  { id: 'lv7', testName: 'Platelet Count', value: '250', unit: '×10³/μL', referenceRange: '150–400', abnormalFlag: 'normal', extractedFromDocument: false },
];

function classifyDocument(document: { fileName: string; kind: HealthDocumentKind; mime?: string }): DocumentAnalysisCategory {
  const name = document.fileName.toLowerCase();
  if (document.kind === 'image') return name.includes('med') || name.includes('tablet') || name.includes('pill') ? 'medicine-image' : 'imaging';
  if (name.includes('prescription')) return 'prescription';
  if (name.includes('discharge')) return 'discharge-summary';
  if (document.kind === 'pdf' || name.includes('report') || name.includes('lab')) return 'lab-report';
  return 'general-document';
}

const FINDINGS_BY_CATEGORY: Record<DocumentAnalysisCategory, string[]> = {
  'lab-report': ['Fasting glucose and HbA1c above typical range', 'Cholesterol panel borderline-elevated', 'Hemoglobin, WBC, platelets within typical range'],
  prescription: ['Prescribed medication listed', 'Dosage instructions present', 'Follow-up advised'],
  'medicine-image': ['Round white tablet detected', 'Imprint partially visible', 'Confirm with pharmacist'],
  'discharge-summary': ['Discharge medications listed', 'Follow-up appointment advised', 'Activity restrictions noted'],
  imaging: ['Imaging study detected', 'Radiologist review recommended', 'Compare with prior studies if available'],
  'general-document': ['Document received', 'Structured extraction pending real backend'],
};

export const mockDocumentAnalysis: AgentAdapters['documents'] = {
  async analyze(document) {
    await wait(200);
    const category = classifyDocument(document);
    const analysis: DocumentAnalysis = {
      category,
      extractedTextPlaceholder: 'Extracted text will be populated by a real OCR/NLP layer in a future step.',
      keyFindings: FINDINGS_BY_CATEGORY[category],
      isMock: true,
    };
    return analysis;
  },
  async analyzeDocument(document) {
    await wait(260);
    const category = classifyDocument(document);
    const isLab = category === 'lab-report';
    const isMed = category === 'medicine-image';
    const result: DocumentAnalysisResult = {
      category,
      extractedTextPlaceholder: 'Extracted text will be populated by a real OCR/NLP layer in a future step. These values are illustrative demo data.',
      keyFindings: FINDINGS_BY_CATEGORY[category],
      labResult: isLab
        ? {
            reportTitle: document.fileName ? `Lab report — ${document.fileName}` : 'Lab report summary',
            sourceFileName: document.fileName,
            values: MOCK_LAB_VALUES,
            valuesRequiringAttention: MOCK_LAB_VALUES.filter((v) => v.abnormalFlag !== 'normal'),
            notes: 'Mock extraction. No real OCR has been performed on this document.',
          }
        : undefined,
      medicine: isMed
        ? {
            id: 'med-mock-1',
            name: 'Unconfirmed tablet',
            dosageForm: 'tablet',
            manufacturerPlaceholder: 'Manufacturer unavailable until a verified source is connected',
            recognitionConfidence: 'low',
            confidenceScore: 0.32,
            commonPurpose: 'Unable to confirm the medicine from the image. Do not act on this identification.',
            warningsPlaceholder: ['Do not ingest based on an unverified identification', 'Confirm with a pharmacist using the physical packaging'],
            prescriptionRequired: undefined,
            isMock: true,
          }
        : undefined,
      safety: assessMockSafety(category, isLab ? MOCK_LAB_VALUES.filter((v) => v.abnormalFlag !== 'normal') : []),
      isMock: true,
    };
    return result;
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
  async recognizeMedicine(input) {
    await wait(180);
    const found = input.text ? findMedicine(input.text) : null;
    if (found) {
      return {
        id: found.id,
        name: found.name,
        dosageForm: 'tablet',
        manufacturerPlaceholder: 'Manufacturer unavailable until a verified source is connected',
        recognitionConfidence: 'medium',
        confidenceScore: 0.55,
        commonPurpose: found.commonPurpose,
        warningsPlaceholder: [found.importantSafetyInfo],
        prescriptionRequired: found.prescriptionRequired,
        isMock: true,
      };
    }
    return {
      id: 'med-photo-mock',
      name: 'Unconfirmed medicine',
      dosageForm: 'unknown',
      manufacturerPlaceholder: 'Unavailable until a verified source is connected',
      recognitionConfidence: 'low',
      confidenceScore: 0.2,
      commonPurpose: 'Unable to confirm the medicine from the image. Do not act on this identification.',
      warningsPlaceholder: ['Do not ingest based on an unverified identification', 'Confirm with a pharmacist using the physical packaging'],
      isMock: true,
    };
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
  MedicineRecognitionResult,
  MedicineInput,
  MedicalReport,
  MedicalReportValue,
  RecoveryStatus,
  RecoveryTrend,
  EmergencyAssessment,
  HealthDocument,
  DocumentAttachment,
  DocumentAnalysis,
  DocumentAnalysisResult,
  DocumentSafetyAssessment,
  ExtractedMedicalValue,
  RouteRecommendation,
};

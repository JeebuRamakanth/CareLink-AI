/**
 * AgentOrchestrator — the core of the Health Command Center.
 *
 * Receives a typed request (text + documents + patient context + language) and
 * returns a single typed AgentResult by composing the adapter interfaces.
 *
 * The orchestrator owns the *shape* of the response; adapters own the *data*.
 * This is the only place intent → adapter wiring lives, so swapping any adapter
 * (mock → real API) never touches the UI.
 *
 * SAFETY: the orchestrator never emits a diagnosis or prescription. Emergency
 * intents short-circuit to an EmergencyAssessment and a high-urgency result.
 */

import type {
  AgentAction,
  AgentIntent,
  AgentLanguage,
  AgentOrchestratorRequest,
  AgentOrchestratorResponse,
  AgentResult,
  HealthDocument,
  MedicalReport,
  MedicalReportValue,
  RankingContext,
  UrgencyLevel,
  InformationTier,
} from '../types';
import type { AgentAdapters } from './adapters/interfaces';
import { mockAdapters } from './adapters/mockAdapters';
import { adapters as resolvedAdapters, isAnyProviderReal } from './adapters/registry';
import { rankHospitals, rankDoctors, rankPharmacies, rankLabs } from '../utils/ranking';
import { DISCLOSURES } from '../utils/safety';
import {
  buildRouteFromHospital,
  hospitalRecommendations,
  doctorRecommendations,
  labRecommendations,
  recoverySeed,
  vaccinationSchedules,
} from '../data/mockData';

const DISCLAIMER_MEDICAL = DISCLOSURES.medical;
const DISCLAIMER_EMERGENCY = DISCLOSURES.emergency;

const ROUTES = {
  agent: '/agent',
  hospitals: '/hospitals',
  doctors: '/doctors',
  appointments: '/appointments',
} as const;

const pickSpecialty = (entities: string[]): string | undefined => entities.find((e) => /^[A-Z]/.test(e));

/** Build the ranking context used by all search-result builders. */
function buildRankingContext(
  language: AgentOrchestratorRequest['language'],
  patientContext: AgentOrchestratorRequest['patientContext'],
  entities: string[],
): RankingContext {
  const specialty = pickSpecialty(entities);
  return {
    patientLocation: patientContext.location,
    requestedSpecialty: specialty,
    requestedTreatment: patientContext.navigation?.requestedTreatment ?? specialty,
    urgency: 'routine',
    language,
  };
}

/** Attach demo-data metadata to a result based on the active provider set. */
function withProvenance(result: AgentResult): AgentResult {
  const isDemo = !isAnyProviderReal();
  return {
    ...result,
    dataSource: isDemo ? 'mock' : 'real',
    isDemoData: isDemo,
    sources: isDemo ? ['CareLink demo data (no provider configured)'] : result.sources,
  };
}

const emptyResult = (intent: AgentIntent, overrides: Partial<AgentResult> = {}): AgentResult => ({
  id: `res-${Math.random().toString(36).slice(2, 9)}`,
  intent,
  summary: '',
  explanation: '',
  urgency: 'routine',
  meta: { confidence: 'low', urgency: 'routine', tier: 'educational' },
  recommendedNextSteps: [],
  hospitals: [],
  doctors: [],
  pharmacies: [],
  labs: [],
  medicines: [],
  routes: [],
  appointments: [],
  warnings: [],
  sources: ['CareLink mock intelligence'],
  followUpQuestions: [],
  actions: [],
  suggestedReplies: [],
  ...overrides,
});

/* ----------------------------------------------------------------------------
 * Per-intent builders
 * ------------------------------------------------------------------------- */

function buildSymptomResult(entities: string[]): AgentResult {
  const specialty = pickSpecialty(entities) ?? 'relevant';
  const specialtyLabel = `${specialty} specialist`;
  return emptyResult('symptom', {
    summary: 'Understanding your symptoms',
    explanation: 'A calm, navigational summary of what you described and a safe next step. This is not a diagnosis.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: [`Book a consultation with a ${specialtyLabel}, or visit a hospital if symptoms worsen.`],
    doctors: doctorRecommendations.filter((d) => d.specialty.toLowerCase().includes(specialty.toLowerCase())).slice(0, 2),
    sources: ['CareLink mock intelligence'],
    followUpQuestions: ['When did the symptoms start?', 'How severe are they on a scale of 1–10?', 'Any known triggers?'],
    actions: [
      { type: 'find-doctor', label: `Find a ${specialtyLabel}`, href: `${ROUTES.doctors}?q=${encodeURIComponent(specialty)}`, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.agent, icon: 'open-command-center' },
    ],
    suggestedReplies: [`Find a ${specialtyLabel}`, 'Find a hospital near me', 'What should I do next?'],
  });
}

function buildDiseaseResult(entities: string[], rawInput: string): AgentResult {
  const term = rawInput.toLowerCase();
  let diseaseName = entities.find((e) => /^[A-Z]/.test(e)) ?? 'this condition';
  if (term.includes('diabetes')) diseaseName = 'Type 2 Diabetes';
  else if (term.includes('asthma')) diseaseName = 'Asthma';
  else if (term.includes('hypertension')) diseaseName = 'Hypertension';
  else if (term.includes('migraine')) diseaseName = 'Migraine';

  return emptyResult('disease', {
    summary: `${diseaseName} — care navigation`,
    explanation: 'A brief, trustworthy overview to help you navigate care. Always confirm specifics with your doctor.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL, sources: ['Mock knowledge base'] },
    recommendedNextSteps: ['Connect with a specialist to build or review your management plan.'],
    hospitals: hospitalRecommendations.slice(0, 2).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['Mock knowledge base'],
    followUpQuestions: ['Are you currently on any treatment?', 'When was your last check-up?'],
    actions: [
      { type: 'find-doctor', label: 'Find a specialist', href: ROUTES.doctors, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.agent, icon: 'open-command-center' },
    ],
    suggestedReplies: ['Find a specialist', 'Find a hospital', 'What should I do next?'],
  });
}

async function buildHospitalResult(entities: string[], adapters: AgentAdapters, patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): Promise<AgentResult> {
  const specialty = pickSpecialty(entities);
  const hospitals = specialty ? await adapters.hospitals.bySpecialty(specialty) : hospitalRecommendations.slice(0, 3);
  const ctx = buildRankingContext(language, patientContext, entities);
  const ranked = rankHospitals(hospitals.map((h) => ({ ...h, route: buildRouteFromHospital(h) })), ctx);
  return withProvenance(emptyResult('hospital', {
    summary: specialty ? `Hospitals for ${specialty}` : 'Hospitals near you',
    explanation: 'Hospitals from the CareLink network. Tap a card to view the full hospital profile.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'next-action', disclaimer: 'Availability is indicative — confirm directly with the hospital.' },
    recommendedNextSteps: ['Compare profiles and pick the closest facility that matches your needs.'],
    hospitals: ranked,
    sources: ['CareLink hospital network'],
    actions: [
      { type: 'find-hospital', label: 'Browse all hospitals', href: ROUTES.hospitals, icon: 'find-hospital' },
      ...(ranked[0] ? [{ type: 'view-hospital' as const, label: `View ${ranked[0].name}`, href: `${ROUTES.hospitals}/${ranked[0].detailSlug}`, icon: 'view-hospital' as const }] : []),
    ],
    suggestedReplies: ['Find a doctor', 'Get directions', 'Book an appointment'],
  }));
}

async function buildDoctorResult(entities: string[], adapters: AgentAdapters, patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): Promise<AgentResult> {
  const specialty = pickSpecialty(entities);
  const doctors = specialty ? await adapters.doctors.bySpecialty(specialty) : doctorRecommendations.slice(0, 3);
  const ctx = buildRankingContext(language, patientContext, entities);
  const ranked = rankDoctors(doctors, ctx);
  return withProvenance(emptyResult('doctor', {
    summary: specialty ? `${specialty} specialists` : 'Doctors for your needs',
    explanation: 'Verified specialists from the CareLink network. Tap a card to view the doctor profile.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'next-action', disclaimer: 'Slot availability is indicative — confirm during booking.' },
    recommendedNextSteps: ['Review profiles and book a consultation.'],
    doctors: ranked,
    sources: ['CareLink doctor network'],
    actions: [
      { type: 'view-appointments', label: 'Book an appointment', href: ROUTES.appointments, icon: 'book-appointment' },
      ...(ranked[0] ? [{ type: 'view-doctor' as const, label: `View ${ranked[0].fullName}`, href: `${ROUTES.doctors}/${ranked[0].detailSlug}`, icon: 'view-doctor' as const }] : []),
    ],
    suggestedReplies: ['Find a hospital', 'Book an appointment', 'What should I do next?'],
  }));
}

async function buildPharmacyResult(adapters: AgentAdapters, patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage, rawInput: string): Promise<AgentResult> {
  const ctx = buildRankingContext(language, patientContext, []);
  const pharmacies = await adapters.pharmacies.search(rawInput, patientContext);
  const ranked = rankPharmacies(pharmacies, ctx);
  return withProvenance(emptyResult('pharmacy', {
    summary: 'Pharmacies near you',
    explanation: 'Nearby pharmacies from the CareLink network.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Stock availability shown is a placeholder — confirm directly with the pharmacy before visiting.' },
    recommendedNextSteps: ['Call ahead to confirm the medicine is in stock before you travel.'],
    pharmacies: ranked,
    sources: ['CareLink pharmacy network'],
    suggestedReplies: ['Find a hospital', 'Upload a prescription', 'Find a doctor'],
  }));
}

function buildLabResult(patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): AgentResult {
  const ctx = buildRankingContext(language, patientContext, []);
  const ranked = rankLabs(labRecommendations, ctx);
  return withProvenance(emptyResult('lab', {
    summary: 'Diagnostic & lab centers',
    explanation: 'Diagnostic and lab centers from the CareLink network. Home collection is indicated where available.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Test availability is indicative — confirm directly with the lab.' },
    recommendedNextSteps: ['Choose a lab and call to confirm test availability.'],
    labs: ranked,
    sources: ['CareLink lab network'],
    suggestedReplies: ['Upload a lab report', 'Find a doctor', 'What should I do next?'],
  }));
}

async function buildMedicineResult(rawInput: string, adapters: AgentAdapters): Promise<AgentResult> {
  const medicine = await adapters.medicines.recognize({ text: rawInput });
  const med = medicine ?? (await adapters.medicines.recognize({ text: 'paracetamol' }))!;
  return emptyResult('medicine', {
    summary: `Medicine info — ${med.name}`,
    explanation: 'General medicine information for navigation only. This is not a prescription or dosage recommendation.',
    urgency: 'routine',
    meta: {
      confidence: 'medium', urgency: 'routine', tier: 'educational',
      disclaimer: 'Never change your dosage or stop a prescribed medicine without consulting your doctor. Confirm interactions with a pharmacist using your full medication list.',
    },
    recommendedNextSteps: [med.prescriptionRequired ? 'This medicine needs a prescription — consult your doctor.' : 'Available over the counter; follow label directions.'],
    medicines: [med],
    pharmacies: med.pharmacyDiscoveryAction ? [med.pharmacyDiscoveryAction] : [],
    sources: ['CareLink medicine knowledge (mock)'],
    actions: [
      { type: 'find-pharmacy', label: 'Find a pharmacy', href: ROUTES.agent, icon: 'find-pharmacy' },
      { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.agent, icon: 'upload-prescription' },
    ],
    suggestedReplies: ['Find a pharmacy', 'Upload a prescription', 'What should I do next?'],
  });
}

function buildReportResult(documents: HealthDocument[]): AgentResult {
  const sourceFile = documents.find((d) => d.kind === 'pdf' || d.kind === 'document')?.fileName;
  const ATTENTION: MedicalReportValue[] = [
    { label: 'Fasting Blood Sugar', value: '132 mg/dL', range: '70–99', status: 'abnormal' },
    { label: 'HbA1c', value: '6.8%', range: '< 5.7%', status: 'attention' },
    { label: 'Total Cholesterol', value: '212 mg/dL', range: '< 200', status: 'attention' },
    { label: 'LDL Cholesterol', value: '138 mg/dL', range: '< 100', status: 'abnormal' },
  ];
  const NORMAL: MedicalReportValue[] = [
    { label: 'Hemoglobin', value: '14.2 g/dL', range: '13.5–17.5', status: 'normal' },
    { label: 'WBC Count', value: '6.8 ×10³/μL', range: '4.0–11.0', status: 'normal' },
    { label: 'Platelet Count', value: '250 ×10³/μL', range: '150–400', status: 'normal' },
  ];
  const report: MedicalReport = {
    id: 'report-mock-1',
    reportTitle: sourceFile ? `Lab report — ${sourceFile}` : 'Lab report summary',
    sourceFileName: sourceFile,
    summary: 'Mock interpretation of your uploaded report. A few values sit outside the typical range and are worth discussing with your doctor.',
    importantObservations: [
      'Fasting blood sugar and HbA1c are higher than the typical range — relevant for diabetes management.',
      'Cholesterol panel shows borderline-elevated values worth reviewing.',
      'Hemoglobin, WBC, and platelets are within typical ranges.',
    ],
    valuesRequiringAttention: ATTENTION,
    normalValues: NORMAL,
    trendComparisonPlaceholder: 'Trend comparison will be available once multiple reports are tracked over time.',
    questionsToAskYourDoctor: [
      'What do my elevated blood sugar and HbA1c values indicate for me?',
      'Should I adjust my diet, activity, or medication?',
      'When should I retest, and what targets should I aim for?',
    ],
    recommendedNextAction: 'Share these results with your doctor or an endocrinologist to build a management plan.',
    isMockInterpretation: true,
  };
  return emptyResult('report', {
    summary: 'Medical report — mock analysis',
    explanation: 'This is a clearly-labelled mock interpretation. No real medical interpretation has been performed yet. Always confirm with your doctor.',
    urgency: 'attention',
    meta: {
      confidence: 'low', urgency: 'attention', tier: 'professional',
      disclaimer: 'Mock interpretation only. CareLink has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
    },
    recommendedNextSteps: [report.recommendedNextAction],
    medicalReport: report,
    sources: ['CareLink mock report analysis'],
    actions: [
      { type: 'find-doctor', label: 'Find an endocrinologist', href: `${ROUTES.doctors}?q=Endocrinology`, icon: 'find-doctor' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.agent, icon: 'open-command-center' },
    ],
    suggestedReplies: ['Find an endocrinologist', 'What should I do next?', 'Find a hospital'],
  });
}

function buildAppointmentResult(adapters: AgentAdapters, kind: 'view' | 'book' | 'reschedule' | 'cancel' = 'view'): AgentResult {
  const actions: AgentAction[] = [
    { type: 'view-appointments', label: 'View appointments', href: adapters.appointments.viewAppointmentsUrl(), icon: 'view-appointments' },
  ];
  if (kind === 'book') actions.push({ type: 'book-appointment', label: 'Book an appointment', href: adapters.appointments.bookUrl(), icon: 'book-appointment' });
  return emptyResult('appointment', {
    summary: 'Your appointments',
    explanation: 'Manage your upcoming and past appointments in one place.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'next-action' },
    recommendedNextSteps: ['Open your appointments dashboard to view, reschedule, or cancel upcoming visits.'],
    appointments: [{ kind, label: 'View my appointments', description: 'Open your appointments dashboard to view, reschedule, or cancel upcoming visits.' }],
    sources: ['Existing CareLink appointments system'],
    actions,
    suggestedReplies: ['Find a doctor', 'Book an appointment', 'Find a hospital'],
  });
}

function buildRouteResult(): AgentResult {
  const hospital = hospitalRecommendations[0];
  return emptyResult('route', {
    summary: `Directions to ${hospital.name}`,
    explanation: 'Route summary with distance and estimated travel time. Connect a maps provider later for live navigation.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Travel time is an estimate and may vary with traffic.' },
    recommendedNextSteps: [`Head to ${hospital.name} (~${hospital.estimatedTravelTimeMin} min).`],
    routes: [buildRouteFromHospital(hospital)],
    hospitals: [{ ...hospital, route: buildRouteFromHospital(hospital) }],
    sources: ['CareLink routing (mock)'],
    actions: [{ type: 'view-hospital', label: 'View hospital', href: `${ROUTES.hospitals}/${hospital.detailSlug}`, icon: 'view-hospital' }],
    suggestedReplies: ['View hospital', 'Find a doctor', 'Book an appointment'],
  });
}

function buildRecoveryResult(): AgentResult {
  return emptyResult('recovery', {
    summary: 'AI Recovery Tracker',
    explanation: 'A gentle daily check-in to track how you feel. This is self-reported wellness tracking, not clinical monitoring.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'educational', disclaimer: 'Recovery tracking is self-reported and mock only. It does not replace clinical monitoring by your care team.' },
    recommendedNextSteps: ['Check in daily to build your recovery streak.'],
    recovery: recoverySeed,
    sources: ['CareLink recovery tracking (mock)'],
    suggestedReplies: ['😊 Better', '😐 Same', '😞 Worse', 'What should I do next?'],
  });
}

function buildVaccinationResult(): AgentResult {
  const due = vaccinationSchedules.find((v) => v.status === 'due');
  return emptyResult('vaccination', {
    summary: 'Vaccination reminders & tracking',
    explanation: 'Track upcoming and completed vaccinations. Always confirm the exact schedule with your pediatrician or physician.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'next-action', disclaimer: 'Vaccination schedules are illustrative — confirm with your healthcare provider.' },
    recommendedNextSteps: [due ? `${due.name} is due — schedule with your provider.` : 'Review your vaccination schedule with your provider.'],
    warnings: ['Vaccination data shown is a placeholder until a real immunization record backend is connected.'],
    sources: ['CareLink vaccination tracking (mock)'],
    actions: [{ type: 'find-doctor', label: 'Find a pediatrician', href: `${ROUTES.doctors}?q=Pediatrics`, icon: 'find-doctor' }],
    suggestedReplies: ['Find a pediatrician', 'Find a hospital', 'What should I do next?'],
  });
}

function buildChildCareResult(): AgentResult {
  return emptyResult('child-care', {
    summary: 'Child-care guidance',
    explanation: 'Navigational guidance for common child-care questions — symptoms, vaccinations, and finding pediatric care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['For anything concerning, contact your pediatrician promptly.'],
    doctors: doctorRecommendations.filter((d) => d.specialty === 'Pediatrics').slice(0, 2),
    hospitals: hospitalRecommendations.filter((h) => h.specialties.includes('Pediatrics')).slice(0, 2).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    suggestedReplies: ['Find a pediatrician', 'Vaccination schedule', 'Find a hospital'],
  });
}

function buildElderCareResult(): AgentResult {
  return emptyResult('elder-care', {
    summary: 'Elder-care guidance',
    explanation: 'Navigational guidance for elder-care — chronic conditions, medications, and finding geriatric-friendly care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['Coordinate chronic-condition care with a primary physician.'],
    doctors: doctorRecommendations.slice(0, 2),
    hospitals: hospitalRecommendations.slice(0, 2).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    suggestedReplies: ['Find a doctor', 'Find a hospital', 'My medicines'],
  });
}

function buildMentalHealthResult(): AgentResult {
  return emptyResult('mental-health', {
    summary: 'Mental-health navigation',
    explanation: 'Supportive, navigational guidance for mental health. This is not a crisis line — for emergencies, call your local emergency number.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: 'If you are in crisis or considering self-harm, contact emergency services or a crisis helpline immediately.' },
    warnings: ['If you are in immediate danger, call your local emergency number now.'],
    recommendedNextSteps: ['Connect with a mental-health professional or counselor for support.'],
    hospitals: hospitalRecommendations.filter((h) => h.specialties.includes('Mental Health')).slice(0, 1).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    actions: [{ type: 'call-emergency', label: 'Crisis helpline', href: 'tel:988', icon: 'call-emergency' }],
    suggestedReplies: ['Find a counselor', 'Find a hospital', 'What should I do next?'],
  });
}

function buildFamilyResult(): AgentResult {
  return emptyResult('family', {
    summary: 'Family profile context',
    explanation: 'Switch between family members to keep context relevant — each profile carries its own conditions and history.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'educational' },
    recommendedNextSteps: ['Pick a family profile to tailor recommendations.'],
    sources: ['CareLink mock intelligence'],
    actions: [{ type: 'open-command-center', label: 'Open command center', href: ROUTES.agent, icon: 'open-command-center' }],
    suggestedReplies: ['Switch to Parent', 'Switch to Child', 'What should I do next?'],
  });
}

function buildLocationResult(): AgentResult {
  return emptyResult('location', {
    summary: 'Location-aware healthcare search',
    explanation: 'Results are sorted by proximity. Connect a real location/maps provider later for live distances.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Distances are mock placeholders until a maps provider is connected.' },
    recommendedNextSteps: ['Pick the closest facility and confirm availability before you travel.'],
    hospitals: hospitalRecommendations.slice(0, 3).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    suggestedReplies: ['Find a hospital', 'Find a doctor', 'Find a pharmacy'],
  });
}

function buildGeneralResult(): AgentResult {
  return emptyResult('general', {
    summary: 'Here to help you navigate care',
    explanation: 'I can help you find hospitals, doctors, pharmacies, labs, explain reports, track medicines, and guide next steps. Try a quick action or describe what you need.',
    urgency: 'routine',
    meta: { confidence: 'low', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['Describe a symptom, upload a report, or ask for nearby care.'],
    sources: ['CareLink mock intelligence'],
    actions: [
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'find-doctor', label: 'Find a doctor', href: ROUTES.doctors, icon: 'find-doctor' },
      { type: 'view-appointments', label: 'My appointments', href: ROUTES.appointments, icon: 'view-appointments' },
    ],
    suggestedReplies: ['I have severe chest pain', 'Find a cardiologist near me', 'Explain this blood report', 'Find hospitals for diabetes treatment'],
  });
}

async function buildEmergencyResult(adapters: AgentAdapters, input: string, patientContext: AgentOrchestratorRequest['patientContext']): Promise<AgentResult> {
  const assessment = await adapters.emergency.assess(input, patientContext);
  return emptyResult('emergency', {
    summary: 'This may need urgent attention',
    explanation: 'Based on what you described, this could be serious. Please treat this as urgent and consider immediate professional care.',
    urgency: 'emergency',
    meta: { confidence: 'high', urgency: 'emergency', tier: 'emergency', disclaimer: DISCLAIMER_EMERGENCY },
    recommendedNextSteps: [assessment.recommendedNextAction],
    emergency: assessment,
    hospitals: assessment.nearbyFacilities.map((f) => ({
      id: f.id, detailSlug: f.detailSlug ?? '', name: f.name, rating: 0, reviewCount: 0, specialties: [],
      distanceKm: f.distanceKm, estimatedTravelTimeMin: f.estimatedTravelTimeMin, isOpen: true, hasEmergency: true,
      address: f.address, city: '', route: f.route,
    })),
    routes: assessment.nearbyFacilities.map((f) => f.route).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    sources: ['CareLink emergency navigation (mock)'],
    actions: [
      { type: 'call-emergency', label: 'Call emergency services', href: 'tel:911', icon: 'call-emergency' },
      ...assessment.nearbyFacilities.flatMap((f) => f.detailSlug ? [{ type: 'view-hospital' as const, label: `View ${f.name}`, href: `${ROUTES.hospitals}/${f.detailSlug}`, icon: 'view-hospital' as const }] : []),
    ],
    suggestedReplies: ['Call emergency services', 'Find an emergency hospital', 'Get directions'],
  });
}

/* ----------------------------------------------------------------------------
 * Orchestrator — a function-based factory (no class syntax; `erasableSyntaxOnly`).
 * ------------------------------------------------------------------------- */

export interface AgentOrchestrator {
  handle(request: AgentOrchestratorRequest): Promise<AgentOrchestratorResponse>;
}

export function createAgentOrchestrator(adapters: AgentAdapters = resolvedAdapters): AgentOrchestrator {
  const handle = async (request: AgentOrchestratorRequest): Promise<AgentOrchestratorResponse> => {
    const classification = await adapters.ai.classify(request.text, request.patientContext);

    // Emergency short-circuits everything — always escalate (Step 9 §8).
    if (classification.intent === 'emergency') {
      const result = withProvenance(await buildEmergencyResult(adapters, request.text, request.patientContext));
      return { result, classification };
    }

    let result: AgentResult;
    switch (classification.intent) {
      case 'symptom':
        result = buildSymptomResult(classification.entities);
        break;
      case 'disease':
        result = buildDiseaseResult(classification.entities, request.text);
        break;
      case 'hospital':
        result = await buildHospitalResult(classification.entities, adapters, request.patientContext, request.language);
        break;
      case 'doctor':
        result = await buildDoctorResult(classification.entities, adapters, request.patientContext, request.language);
        break;
      case 'pharmacy':
        result = await buildPharmacyResult(adapters, request.patientContext, request.language, request.text);
        break;
      case 'lab':
        result = buildLabResult(request.patientContext, request.language);
        break;
      case 'medicine':
        result = await buildMedicineResult(request.text, adapters);
        break;
      case 'report':
        result = buildReportResult(request.documents);
        break;
      case 'appointment':
        result = buildAppointmentResult(adapters, 'view');
        break;
      case 'route':
        result = buildRouteResult();
        break;
      case 'recovery':
        result = buildRecoveryResult();
        break;
      case 'vaccination':
        result = buildVaccinationResult();
        break;
      case 'child-care':
        result = buildChildCareResult();
        break;
      case 'elder-care':
        result = buildElderCareResult();
        break;
      case 'mental-health':
        result = buildMentalHealthResult();
        break;
      case 'family':
        result = buildFamilyResult();
        break;
      case 'location':
        result = buildLocationResult();
        break;
      default:
        result = buildGeneralResult();
    }

    return { result: withProvenance(result), classification };
  };

  return { handle };
}

export { mockAdapters, buildAppointmentResult as buildAppointmentResultForKind };
export type { AgentAction, UrgencyLevel, InformationTier, MedicalReport, MedicalReportValue };

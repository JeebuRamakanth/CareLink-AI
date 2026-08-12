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
  ConversationContext,
  HealthDocument,
  MedicalReport,
  MedicalReportValue,
  RankingContext,
  PharmacyRecommendation,
>>>>>>> home-hero-ai-command-center
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
  pharmacyRecommendations,
  recoverySeed,
  vaccinationSchedules,
} from '../data/mockData';
import {
  accumulateContext,
  emptyContext,
  hospitalFocusTopic,
  resolveSpecialtyFromContext,
} from './contextManager';
import {
  rankDoctors,
  rankHospitals,
  rankLabs,
  rankPharmacies,
  type RankInput,
} from './recommendationRanking';

const DISCLAIMER_MEDICAL = DISCLOSURES.medical;
const DISCLAIMER_EMERGENCY = DISCLOSURES.emergency;

const ROUTES = {
  agent: '/agent',
  ai: '/ai',
  hospitals: '/hospitals',
  doctors: '/doctors',
  appointments: '/appointments',
} as const;

/**
 * Resolve the active specialty for the current turn: explicit entities win,
 * otherwise inherit from conversation context (diabetes → Endocrinology).
 */
const activeSpecialty = (
  entities: string[],
  context?: ConversationContext
): string | undefined => resolveSpecialtyFromContext(entities, context ?? emptyContext());

/** Build the ranking input shared by all recommendation builders. */
const rankInput = (
  urgency: UrgencyLevel,
  specialty: string | undefined,
  context?: ConversationContext
): RankInput => ({ context: context ?? emptyContext(), urgency, specialty });

/** Full pharmacy pool minus the medicine's own discovery pharmacy, for richer medicine results. */
const pharmacyNeighbors = (): PharmacyRecommendation[] => pharmacyRecommendations;

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

function buildSymptomResult(entities: string[], context?: ConversationContext): AgentResult {
  const specialty = activeSpecialty(entities, context) ?? 'relevant';
  const specialtyLabel = `${specialty} specialist`;
  const input = rankInput('attention', specialty, context);
  const doctors = rankDoctors(
    doctorRecommendations.filter((d) => d.specialty.toLowerCase().includes(specialty.toLowerCase())),
    input
  ).slice(0, 2);
  return emptyResult('symptom', {
    summary: 'Understanding your symptoms',
    explanation: 'A calm, navigational summary of what you described and a safe next step. This is not a diagnosis.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: [`Book a consultation with a ${specialtyLabel}, or visit a hospital if symptoms worsen.`],
    doctors,
    sources: ['CareLink mock intelligence'],
    followUpQuestions: ['When did the symptoms start?', 'How severe are they on a scale of 1–10?', 'Any known triggers?'],
    actions: [
      { type: 'find-doctor', label: `Find a ${specialtyLabel}`, href: `${ROUTES.doctors}?q=${encodeURIComponent(specialty)}`, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
    ],
    suggestedReplies: [`Find a ${specialtyLabel}`, 'Find a hospital near me', 'What should I do next?'],
  });
}

function buildDiseaseResult(entities: string[], rawInput: string, context?: ConversationContext): AgentResult {
  const term = rawInput.toLowerCase();
  let diseaseName = entities.find((e) => /^[A-Z]/.test(e)) ?? 'this condition';
  if (term.includes('diabetes')) diseaseName = 'Type 2 Diabetes';
  else if (term.includes('asthma')) diseaseName = 'Asthma';
  else if (term.includes('hypertension')) diseaseName = 'Hypertension';
  else if (term.includes('migraine')) diseaseName = 'Migraine';

  const specialty = activeSpecialty(entities, context) ?? 'Endocrinology';
  const input = rankInput('routine', specialty, context);
  const hospitals = rankHospitals(hospitalRecommendations, input).slice(0, 3).map((h) => ({ ...h, route: buildRouteFromHospital(h) }));

  return emptyResult('disease', {
    summary: `${diseaseName} — care navigation`,
    explanation: 'A brief, trustworthy overview to help you navigate care. Always confirm specifics with your doctor.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL, sources: ['Mock knowledge base'] },
    recommendedNextSteps: ['Connect with a specialist to build or review your management plan.'],
    hospitals,
    sources: ['Mock knowledge base'],
    followUpQuestions: ['Are you currently on any treatment?', 'When was your last check-up?'],
    actions: [
      { type: 'find-doctor', label: 'Find a specialist', href: `${ROUTES.doctors}?q=${encodeURIComponent(specialty)}`, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
    ],
    suggestedReplies: ['Find a specialist', 'Find a hospital', 'What should I do next?'],
  });
}

<<<<<<< HEAD
async function buildHospitalResult(entities: string[], adapters: AgentAdapters, patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): Promise<AgentResult> {
  const specialty = pickSpecialty(entities);
  const hospitals = specialty ? await adapters.hospitals.bySpecialty(specialty) : hospitalRecommendations.slice(0, 3);
  const ctx = buildRankingContext(language, patientContext, entities);
  const ranked = rankHospitals(hospitals.map((h) => ({ ...h, route: buildRouteFromHospital(h) })), ctx);
  return withProvenance(emptyResult('hospital', {
=======
async function buildHospitalResult(entities: string[], adapters: AgentAdapters, context?: ConversationContext): Promise<AgentResult> {
  const specialty = activeSpecialty(entities, context);
  const focus = hospitalFocusTopic(context ?? emptyContext());
  const input = rankInput('routine', specialty, context);
  const raw = specialty ? await adapters.hospitals.bySpecialty(specialty) : hospitalRecommendations.slice(0, 4);
  const hospitals = rankHospitals(raw, input).slice(0, 4).map((h) => ({ ...h, route: buildRouteFromHospital(h) }));
  // Pre-filter relevant doctors on the hospital page when a condition/specialty context exists.
  const hospitalHref = (slug: string) => focus ? `${ROUTES.hospitals}/${slug}?focus=${encodeURIComponent(focus)}` : `${ROUTES.hospitals}/${slug}`;
  return emptyResult('hospital', {
>>>>>>> home-hero-ai-command-center
    summary: specialty ? `Hospitals for ${specialty}` : 'Hospitals near you',
    explanation: 'Hospitals from the CareLink network, ranked by distance, rating, relevance and availability. Tap a card to view the full hospital profile.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'next-action', disclaimer: 'Availability is indicative — confirm directly with the hospital.' },
    recommendedNextSteps: ['Compare profiles and pick the closest facility that matches your needs.'],
<<<<<<< HEAD
    hospitals: ranked,
    sources: ['CareLink hospital network'],
    actions: [
      { type: 'find-hospital', label: 'Browse all hospitals', href: ROUTES.hospitals, icon: 'find-hospital' },
      ...(ranked[0] ? [{ type: 'view-hospital' as const, label: `View ${ranked[0].name}`, href: `${ROUTES.hospitals}/${ranked[0].detailSlug}`, icon: 'view-hospital' as const }] : []),
=======
    hospitals,
    sources: ['CareLink hospital network (mock)'],
    actions: [
      { type: 'view-hospital', label: 'View relevant doctors', href: hospitalHref(hospitals[0]?.detailSlug ?? ''), icon: 'view-doctor' },
      { type: 'find-hospital', label: 'Browse all hospitals', href: ROUTES.hospitals, icon: 'find-hospital' },
>>>>>>> home-hero-ai-command-center
    ],
    suggestedReplies: ['Find a doctor', 'Get directions', 'Book an appointment'],
  }));
}

<<<<<<< HEAD
async function buildDoctorResult(entities: string[], adapters: AgentAdapters, patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): Promise<AgentResult> {
  const specialty = pickSpecialty(entities);
  const doctors = specialty ? await adapters.doctors.bySpecialty(specialty) : doctorRecommendations.slice(0, 3);
  const ctx = buildRankingContext(language, patientContext, entities);
  const ranked = rankDoctors(doctors, ctx);
  return withProvenance(emptyResult('doctor', {
=======
async function buildDoctorResult(entities: string[], adapters: AgentAdapters, context?: ConversationContext): Promise<AgentResult> {
  const specialty = activeSpecialty(entities, context);
  const input = rankInput('routine', specialty, context);
  const raw = specialty ? await adapters.doctors.bySpecialty(specialty) : doctorRecommendations.slice(0, 4);
  const doctors = rankDoctors(raw, input).slice(0, 4);
  return emptyResult('doctor', {
>>>>>>> home-hero-ai-command-center
    summary: specialty ? `${specialty} specialists` : 'Doctors for your needs',
    explanation: 'Verified specialists from the CareLink network, ranked by relevance, availability, rating and distance. Tap a card to view the doctor profile.',
    urgency: 'routine',
    meta: { confidence: 'high', urgency: 'routine', tier: 'next-action', disclaimer: 'Slot availability is indicative — confirm during booking.' },
    recommendedNextSteps: ['Review profiles and book a consultation.'],
<<<<<<< HEAD
    doctors: ranked,
    sources: ['CareLink doctor network'],
    actions: [
      { type: 'view-appointments', label: 'Book an appointment', href: ROUTES.appointments, icon: 'book-appointment' },
      ...(ranked[0] ? [{ type: 'view-doctor' as const, label: `View ${ranked[0].fullName}`, href: `${ROUTES.doctors}/${ranked[0].detailSlug}`, icon: 'view-doctor' as const }] : []),
    ],
=======
    doctors,
    sources: ['CareLink doctor network (mock)'],
    actions: [{ type: 'book-appointment', label: 'Book an appointment', href: ROUTES.appointments, icon: 'book-appointment' }],
>>>>>>> home-hero-ai-command-center
    suggestedReplies: ['Find a hospital', 'Book an appointment', 'What should I do next?'],
  }));
}

<<<<<<< HEAD
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
=======
async function buildPharmacyResult(adapters: AgentAdapters, context?: ConversationContext, medicine?: string): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  input.specialty = medicine;
  const pharmacies = rankPharmacies(
    await adapters.pharmacies.search(medicine ?? '', { activeProfileId: 'self', profile: { id: 'self', label: 'Self', relation: 'self', contextSummary: '', contextTags: [] } }),
    input
  ).slice(0, 4);
  return emptyResult('pharmacy', {
    summary: medicine ? `Pharmacies for ${medicine}` : 'Pharmacies near you',
    explanation: 'Nearby pharmacies from the CareLink network, ranked by distance, open status and estimated cost.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Stock availability shown is a placeholder — confirm directly with the pharmacy before visiting.' },
    recommendedNextSteps: ['Call ahead to confirm the medicine is in stock before you travel.'],
    pharmacies,
    sources: ['CareLink pharmacy network (mock)'],
>>>>>>> home-hero-ai-command-center
    suggestedReplies: ['Find a hospital', 'Upload a prescription', 'Find a doctor'],
  }));
}

<<<<<<< HEAD
function buildLabResult(patientContext: AgentOrchestratorRequest['patientContext'], language: AgentLanguage): AgentResult {
  const ctx = buildRankingContext(language, patientContext, []);
  const ranked = rankLabs(labRecommendations, ctx);
  return withProvenance(emptyResult('lab', {
=======
function buildLabResult(context?: ConversationContext): AgentResult {
  const input = rankInput('routine', undefined, context);
  const labs = rankLabs(labRecommendations, input).slice(0, 4);
  return emptyResult('lab', {
>>>>>>> home-hero-ai-command-center
    summary: 'Diagnostic & lab centers',
    explanation: 'Diagnostic and lab centers from the CareLink network, ranked by distance, home collection and relevance. Home collection is indicated where available.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Test availability is indicative — confirm directly with the lab.' },
    recommendedNextSteps: ['Choose a lab and call to confirm test availability.'],
<<<<<<< HEAD
    labs: ranked,
    sources: ['CareLink lab network'],
=======
    labs,
    sources: ['CareLink lab network (mock)'],
>>>>>>> home-hero-ai-command-center
    suggestedReplies: ['Upload a lab report', 'Find a doctor', 'What should I do next?'],
  }));
}

async function buildMedicineResult(rawInput: string, adapters: AgentAdapters, context?: ConversationContext): Promise<AgentResult> {
  const medicine = await adapters.medicines.recognize({ text: rawInput });
  const med = medicine ?? (await adapters.medicines.recognize({ text: 'paracetamol' }))!;
  const pharmacies = med.pharmacyDiscoveryAction ? rankPharmacies([med.pharmacyDiscoveryAction, ...pharmacyNeighbors()], rankInput('routine', med.name, context)).slice(0, 3) : [];
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
    pharmacies,
    sources: ['CareLink medicine knowledge (mock)'],
    actions: [
      { type: 'find-pharmacy', label: 'Find a pharmacy', href: ROUTES.ai, icon: 'find-pharmacy' },
      { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.ai, icon: 'upload-prescription' },
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
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
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

function buildRouteResult(context?: ConversationContext): AgentResult {
  const input = rankInput('routine', undefined, context);
  const ranked = rankHospitals(hospitalRecommendations, input);
  const hospital = ranked[0];
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

function buildChildCareResult(context?: ConversationContext): AgentResult {
  const input = rankInput('routine', 'Pediatrics', context);
  return emptyResult('child-care', {
    summary: 'Child-care guidance',
    explanation: 'Navigational guidance for common child-care questions — symptoms, vaccinations, and finding pediatric care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['For anything concerning, contact your pediatrician promptly.'],
    doctors: rankDoctors(doctorRecommendations.filter((d) => d.specialty === 'Pediatrics'), input).slice(0, 2),
    hospitals: rankHospitals(hospitalRecommendations.filter((h) => h.specialties.includes('Pediatrics')), input).slice(0, 2).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    suggestedReplies: ['Find a pediatrician', 'Vaccination schedule', 'Find a hospital'],
  });
}

function buildElderCareResult(context?: ConversationContext): AgentResult {
  const input = rankInput('routine', undefined, context);
  return emptyResult('elder-care', {
    summary: 'Elder-care guidance',
    explanation: 'Navigational guidance for elder-care — chronic conditions, medications, and finding geriatric-friendly care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['Coordinate chronic-condition care with a primary physician.'],
    doctors: rankDoctors(doctorRecommendations, input).slice(0, 2),
    hospitals: rankHospitals(hospitalRecommendations, input).slice(0, 2).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
    sources: ['CareLink mock intelligence'],
    suggestedReplies: ['Find a doctor', 'Find a hospital', 'My medicines'],
  });
}

function buildMentalHealthResult(context?: ConversationContext): AgentResult {
  const input = rankInput('attention', 'Mental Health', context);
  return emptyResult('mental-health', {
    summary: 'Mental-health navigation',
    explanation: 'Supportive, navigational guidance for mental health. This is not a crisis line — for emergencies, call your local emergency number.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: 'If you are in crisis or considering self-harm, contact emergency services or a crisis helpline immediately.' },
    warnings: ['If you are in immediate danger, call your local emergency number now.'],
    recommendedNextSteps: ['Connect with a mental-health professional or counselor for support.'],
    hospitals: rankHospitals(hospitalRecommendations.filter((h) => h.specialties.includes('Mental Health')), input).slice(0, 1).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
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
    actions: [{ type: 'open-command-center', label: 'Open command center', href: ROUTES.ai, icon: 'open-command-center' }],
    suggestedReplies: ['Switch to Parent', 'Switch to Child', 'What should I do next?'],
  });
}

function buildLocationResult(context?: ConversationContext): AgentResult {
  const input = rankInput('routine', undefined, context);
  return emptyResult('location', {
    summary: 'Location-aware healthcare search',
    explanation: 'Results are ranked by proximity, rating and availability. Connect a real location/maps provider later for live distances.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Distances are mock placeholders until a maps provider is connected.' },
    recommendedNextSteps: ['Pick the closest facility and confirm availability before you travel.'],
    hospitals: rankHospitals(hospitalRecommendations, input).slice(0, 3).map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
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

<<<<<<< HEAD
async function buildEmergencyResult(adapters: AgentAdapters, input: string, patientContext: AgentOrchestratorRequest['patientContext']): Promise<AgentResult> {
  const assessment = await adapters.emergency.assess(input, patientContext);
=======
async function buildEmergencyResult(adapters: AgentAdapters, input: string, context?: ConversationContext): Promise<AgentResult> {
  const assessment = await adapters.emergency.assess(input, { activeProfileId: 'self', profile: { id: 'self', label: 'Self', relation: 'self', contextSummary: '', contextTags: [] } });
  const input2 = rankInput('emergency', undefined, context);
  const facilities = rankHospitals(
    assessment.nearbyFacilities.map((f) => ({
      id: f.id, detailSlug: f.detailSlug ?? '', name: f.name, rating: 4.6, reviewCount: 0, specialties: [],
      distanceKm: f.distanceKm, estimatedTravelTimeMin: f.estimatedTravelTimeMin, isOpen: true, hasEmergency: true,
      address: f.address, city: '', route: f.route,
    })),
    input2
  );
>>>>>>> home-hero-ai-command-center
  return emptyResult('emergency', {
    summary: 'This may need urgent attention',
    explanation: 'Based on what you described, this could be serious. Please treat this as urgent and consider immediate professional care.',
    urgency: 'emergency',
    meta: { confidence: 'high', urgency: 'emergency', tier: 'emergency', disclaimer: DISCLAIMER_EMERGENCY },
    recommendedNextSteps: [assessment.recommendedNextAction],
    emergency: assessment,
    hospitals: facilities,
    routes: facilities.map((f) => f.route).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    sources: ['CareLink emergency navigation (mock)'],
    actions: [
      { type: 'call-emergency', label: 'Call emergency services', href: 'tel:911', icon: 'call-emergency' },
      ...facilities.flatMap((f) => f.detailSlug ? [{ type: 'view-hospital' as const, label: `View ${f.name}`, href: `${ROUTES.hospitals}/${f.detailSlug}`, icon: 'view-hospital' as const }] : []),
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
    const priorContext = request.conversationContext ?? emptyContext();
    const classification = await adapters.ai.classify(request.text, request.patientContext);

<<<<<<< HEAD
    // Emergency short-circuits everything — always escalate (Step 9 §8).
    if (classification.intent === 'emergency') {
      const result = withProvenance(await buildEmergencyResult(adapters, request.text, request.patientContext));
      return { result, classification };
=======
    // Emergency short-circuits everything — always escalate. Severity is never
    // "remembered away"; each emergency-pattern input is re-evaluated fresh.
    if (classification.intent === 'emergency') {
      const result = await buildEmergencyResult(adapters, request.text, priorContext);
      const context = accumulateContext(
        { ...priorContext },
        { id: 'u', role: 'user', content: request.text, createdAt: new Date().toISOString(), documents: request.documents, contextTags: [], patientProfileId: request.patientContext.activeProfileId },
        classification.intent
      );
      return { result, classification, context };
>>>>>>> home-hero-ai-command-center
    }

    let result: AgentResult;
    switch (classification.intent) {
      case 'symptom':
        result = buildSymptomResult(classification.entities, priorContext);
        break;
      case 'disease':
        result = buildDiseaseResult(classification.entities, request.text, priorContext);
        break;
      case 'hospital':
<<<<<<< HEAD
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
=======
        result = await buildHospitalResult(classification.entities, adapters, priorContext);
        break;
      case 'doctor':
        result = await buildDoctorResult(classification.entities, adapters, priorContext);
        break;
      case 'pharmacy':
        result = await buildPharmacyResult(adapters, priorContext, classification.entities.find((e) => /metformin|paracetamol|amoxicillin/i.test(e)));
        break;
      case 'lab':
        result = buildLabResult(priorContext);
>>>>>>> home-hero-ai-command-center
        break;
      case 'medicine':
        result = await buildMedicineResult(request.text, adapters, priorContext);
        break;
      case 'report':
        result = buildReportResult(request.documents);
        break;
      case 'appointment':
        result = buildAppointmentResult(adapters, 'view');
        break;
      case 'route':
        result = buildRouteResult(priorContext);
        break;
      case 'recovery':
        result = buildRecoveryResult();
        break;
      case 'vaccination':
        result = buildVaccinationResult();
        break;
      case 'child-care':
        result = buildChildCareResult(priorContext);
        break;
      case 'elder-care':
        result = buildElderCareResult(priorContext);
        break;
      case 'mental-health':
        result = buildMentalHealthResult(priorContext);
        break;
      case 'family':
        result = buildFamilyResult();
        break;
      case 'location':
        result = buildLocationResult(priorContext);
        break;
      default:
        result = buildGeneralResult();
    }

<<<<<<< HEAD
    return { result: withProvenance(result), classification };
=======
    const context = accumulateContext(
      { ...priorContext },
      { id: 'u', role: 'user', content: request.text, createdAt: new Date().toISOString(), documents: request.documents, contextTags: [], patientProfileId: request.patientContext.activeProfileId },
      classification.intent
    );

    return { result, classification, context };
>>>>>>> home-hero-ai-command-center
  };

  return { handle };
}

export { mockAdapters, buildAppointmentResult as buildAppointmentResultForKind };
export type { AgentAction, UrgencyLevel, InformationTier, MedicalReport, MedicalReportValue };

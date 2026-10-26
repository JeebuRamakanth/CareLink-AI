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
  BloodCentreRecommendation,
  AgentOrchestratorRequest,
  AgentOrchestratorResponse,
  AgentResult,
  ConversationContext,
  HealthDocument,
  MedicalReport,
  MedicalReportValue,
  MedicineResult,
  ReportFacilityRecommendation,

  UrgencyLevel,
  InformationTier,
} from '../types';
import type { AgentAdapters } from './adapters/interfaces';
import type { MedicineRecognitionResult } from '../../documents/types';
import type { EvidenceReference } from '../../documents/types';
import { mockAdapters } from './adapters/mockAdapters';
import { adapters as resolvedAdapters, isAnyProviderReal } from './adapters/registry';
import { DISCLOSURES } from '../utils/safety';
import {
  buildRouteFromHospital,
  labRecommendations,
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
import {
  localizePharmacies,
  localizeLabs,
  type PatientPoint,
} from './discoveryService';
import { runAITurn, type AIEngineResult } from './ai/aiEngine';
import { inputSafetyFloor } from './ai/safetyLayer';
import { detectLanguage, resolveResponseLanguage } from './ai/languageDetector';
import {
  localized,
  EMERGENCY_TITLE,
  EMERGENCY_GO_NOW,
  EMERGENCY_CALL_LABEL,
  EMERGENCY_OPERATOR_HINT,
  MEDICATION_CONSULT_NOTICE,
} from './ai/messages';
import { getBloodCentres } from '../../../services/bloodCentreService';
import { identifyMedicine } from '../../documents/services/medicineIdentificationService';
import { extractMedicineCandidates, looksLikeMedicineQuestion } from './medicineLookup';
import { buildMedicineCareInfo } from './medicineCareInfo';
import { matchFacilitiesForReport, type ReportFacilityDiscovery } from './treatmentFacilities';
import { primaryEmergencyContact } from '../../documents/services/clinical/emergencyConfig';
import { getPharmacyRecommendations, getLaboratoryRecommendations } from './pharmacyRecommendations';
import { haversineKm, estimateDriveMinutes } from '../../../lib/location';
import {
  filterDoctorsBySpecialty,
  filterHospitalsBySpecialty,
  getDoctorRecommendations,
  getHospitalRecommendations,
  type RecommendationOrigin,
} from './directoryRecommendations';
import type { AgentActionType, AIProvenance, SafetyLevel } from '../types';
import { ROUTES } from '../../../routes/routeConstants';

const DISCLAIMER_MEDICAL = DISCLOSURES.medical;
const DISCLAIMER_EMERGENCY = DISCLOSURES.emergency;

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

/**
 * Extract the patient location from the request (runtime only — never persisted,
 * never logged). Falls back to navigation context location, then null.
 */
const patientPoint = (request: AgentOrchestratorRequest): PatientPoint | null => {
  const loc = request.patientContext.location ?? request.patientContext.navigation?.location;
  if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    return { lat: loc.lat, lng: loc.lng, label: loc.label };
  }
  return null;
};

/** Whether the active turn produced real-provider data (drives REAL/MOCK badge). */
const dataSourceFor = (): 'real' | 'mock' => (isAnyProviderReal() ? 'real' : 'mock');

/**
 * Provenance of the RECORDS in a result, which is a different question from
 * whether an external provider is configured:
 *
 *   'live'              — served by a configured backend/provider
 *   'sourced_directory' — the bundled, source-attributed corridor directory
 *                         (real government/provider records, offline copy)
 *   'demo'              — illustrative sample data (labs/pharmacies today)
 *
 * The previous model labelled the sourced directory "Demo data" merely because
 * no provider key was configured, which misrepresented real records. A result
 * is only 'demo' when it actually contains sample data.
 */
const directoryProvenance = (): 'live' | 'sourced_directory' =>
  isAnyProviderReal() ? 'live' : 'sourced_directory';

export type ResultProvenance = 'live' | 'sourced_directory' | 'demo';

/** Resolve the record-level provenance of a built result for the UI badge. */
export function resultProvenance(result: Pick<AgentResult, 'dataSource' | 'isDemoData'>): ResultProvenance {
  if (result.isDemoData) return 'demo';
  return result.dataSource === 'real' ? 'live' : 'sourced_directory';
}

export { directoryProvenance };

/** Patient origin for real directory distances (null when no coordinates exist). */
const originOf = (patient?: PatientPoint | null): RecommendationOrigin | null =>
  patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
    ? { lat: patient.lat, lng: patient.lng, label: patient.label }
    : null;

/**
 * Directory hospital recommendations with real distance (when the patient
 * location is known) and an optional specialty filter. Falls back to the whole
 * directory when a specialty matches nothing, so the card never goes empty for a
 * term we simply do not have — the UI shows the honest "no verified records"
 * copy only when the directory itself is empty.
 */
const directoryHospitals = async (
  specialty: string | undefined,
  patient?: PatientPoint | null
) => {
  const all = await getHospitalRecommendations(originOf(patient));
  if (!specialty) return all;
  const matched = filterHospitalsBySpecialty(all, specialty);
  return matched.length > 0 ? matched : all;
};

/** Directory doctor recommendations, optionally filtered by specialty. */
const directoryDoctors = async (specialty: string | undefined) => {
  const all = await getDoctorRecommendations();
  if (!specialty) return all;
  const matched = filterDoctorsBySpecialty(all, specialty);
  return matched.length > 0 ? matched : all;
};

/* ----------------------------------------------------------------------------
 * AI engine integration (Step 13)
 * ------------------------------------------------------------------------- */

/**
 * Allowlisted action types the AI may SUGGEST (§13). Execution always happens
 * through CareLink services/routes — the AI can never execute anything itself.
 */
const ALLOWED_ACTIONS: AgentActionType[] = [
  'view-hospital', 'view-doctor', 'view-pharmacy', 'view-lab',
  'book-appointment', 'view-appointments', 'get-directions', 'call-facility',
  'call-emergency', 'find-pharmacy', 'find-doctor', 'find-hospital',
  'upload-report', 'upload-prescription', 'track-recovery', 'ask-follow-up',
  'open-command-center',
];

const URGENCY_RANK: Record<UrgencyLevel, number> = { routine: 0, attention: 1, urgent: 2, emergency: 3 };

const safetyToUrgency = (level: SafetyLevel): UrgencyLevel => {
  switch (level) {
    case 'emergency':
      return 'emergency';
    case 'urgent':
      return 'urgent';
    case 'possible-concern':
      return 'attention';
    default:
      return 'routine';
  }
};

/**
 * Merge a safety-checked structured AI response into the intent-built result.
 * The builders own data (recommendations, actions); the AI owns language
 * (summary/explanation/follow-ups). Safety level can only escalate urgency,
 * never de-escalate, and emergency short-circuit stays with the classifier.
 */
function mergeAIIntoResult(result: AgentResult, ai: AIEngineResult): AgentResult {
  const { response } = ai;
  const warnings = [...result.warnings, ...response.warnings];
  if (ai.injectionFlagged) {
    warnings.push('Instruction-like text in the input was treated as data, not commands.');
  }

  // A result that carries REAL analysed content (e.g. a medicine photograph read
  // by the vision backend, or lab values extracted from the user's report) must
  // NOT be relabelled a "CareLink demo response" merely because no AI language
  // provider is configured. The CONTENT is real; only the phrasing is unpolished.
  // In that case we keep the builder's own summary/explanation and provenance.
  const resultHasRealContent = result.isDemoData === false && result.dataSource === 'real';

  const provenanceMode: AIProvenance['mode'] =
    ai.mode === 'real' ? 'real' : ai.mode === 'unavailable' ? 'unavailable' : ai.mode === 'refused' ? 'refused' : 'mock';
  const sourceLabel =
    ai.mode === 'real'
      ? `CareLink AI (${response.source.provider})`
      : ai.mode === 'unavailable'
        ? 'CareLink AI temporarily unavailable'
        : ai.mode === 'refused'
          ? 'CareLink security policy'
          : 'CareLink demo response';

  // Mock AI language layer over a REAL analysis: keep the real content's own
  // wording and provenance — do not present it as a demo response.
  if (ai.mode === 'mock' && resultHasRealContent) {
    return { ...result, warnings, sources: result.sources };
  }

  // For unavailable/refused turns we keep the intent builder's navigational
  // data but surface the honest AI note (never a fabricated AI statement).
  if (ai.mode === 'unavailable' || ai.mode === 'refused') {
    return {
      ...result,
      summary: ai.mode === 'refused' ? 'I can’t do that.' : 'CareLink AI is temporarily unavailable.',
      explanation:
        ai.mode === 'refused'
          ? 'Role changes, secrets, and security settings are handled only by authorized system operators — not by the assistant.'
          : response.explanation,
      warnings,
      provenance: {
        mode: provenanceMode,
        provider: response.source.provider,
        fetchedAt: response.source.fetchedAt,
        verification: 'fallback',
      },
      sources: [sourceLabel, ...result.sources],
    };
  }

  const aiUrgency = safetyToUrgency(response.safetyLevel);
  // Escalate-only, and never let a non-emergency intent jump straight to
  // emergency urgency — the emergency short-circuit owns that path.
  const escalated: UrgencyLevel =
    URGENCY_RANK[aiUrgency] > URGENCY_RANK[result.urgency]
      ? aiUrgency === 'emergency'
        ? 'urgent'
        : aiUrgency
      : result.urgency;

  return {
    ...result,
    summary: response.summary || result.summary,
    explanation: response.explanation || result.explanation,
    urgency: escalated,
    meta: { ...result.meta, urgency: escalated },
    followUpQuestions: response.followUpQuestions.length > 0 ? response.followUpQuestions : result.followUpQuestions,
    suggestedReplies: response.followUpQuestions.length > 0 ? response.followUpQuestions : result.suggestedReplies,
    warnings,
    safetyLevel: response.safetyLevel,
    provenance: {
      mode: provenanceMode,
      provider: response.source.provider,
      fetchedAt: response.source.fetchedAt,
      verification: ai.mode === 'real' ? 'validated' : 'fallback',
    },
    sources: [sourceLabel, ...result.sources],
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
  bloodCentres: [],
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
  return emptyResult('symptom', {
    summary: 'Understanding your symptoms',
    explanation: 'A calm, navigational summary of what you described and a safe next step. This is not a diagnosis.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: [`Book a consultation with a ${specialtyLabel}, or visit a hospital if symptoms worsen.`],
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
    followUpQuestions: ['When did the symptoms start?', 'How severe are they on a scale of 1–10?', 'Any known triggers?'],
    actions: [
      { type: 'find-doctor', label: `Find a ${specialtyLabel}`, href: `${ROUTES.doctors}?q=${encodeURIComponent(specialty)}`, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
    ],
    suggestedReplies: [`Find a ${specialtyLabel}`, 'Find a hospital near me', 'What should I do next?'],
  });
}

/** Async symptom builder that also surfaces real directory doctors for the specialty. */
async function buildSymptomResultAsync(entities: string[], context?: ConversationContext): Promise<AgentResult> {
  const specialty = activeSpecialty(entities, context);
  const base = buildSymptomResult(entities, context);
  if (!specialty) return base;
  const doctors = (await directoryDoctors(specialty)).slice(0, 2);
  if (doctors.length === 0) return base;
  return { ...base, doctors: rankDoctors(doctors, rankInput('attention', specialty, context)).slice(0, 2) };
}

async function buildDiseaseResult(entities: string[], rawInput: string, context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const term = rawInput.toLowerCase();
  let diseaseName = entities.find((e) => /^[A-Z]/.test(e)) ?? 'this condition';
  if (term.includes('diabetes')) diseaseName = 'Type 2 Diabetes';
  else if (term.includes('asthma')) diseaseName = 'Asthma';
  else if (term.includes('hypertension')) diseaseName = 'Hypertension';
  else if (term.includes('migraine')) diseaseName = 'Migraine';

  const specialty = activeSpecialty(entities, context) ?? 'Endocrinology';
  const input = rankInput('routine', specialty, context);
  const ranked = rankHospitals(await directoryHospitals(specialty, patient), input).slice(0, 3);

  return emptyResult('disease', {
    summary: `${diseaseName} — care navigation`,
    explanation: 'A brief, trustworthy overview to help you navigate care. Always confirm specifics with your doctor.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['Connect with a specialist to build or review your management plan.'],
    hospitals: ranked,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
    followUpQuestions: ['Are you currently on any treatment?', 'When was your last check-up?'],
    actions: [
      { type: 'find-doctor', label: 'Find a specialist', href: `${ROUTES.doctors}?q=${encodeURIComponent(specialty)}`, icon: 'find-doctor' },
      { type: 'find-hospital', label: 'Find a hospital', href: ROUTES.hospitals, icon: 'find-hospital' },
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
    ],
    suggestedReplies: ['Find a specialist', 'Find a hospital', 'What should I do next?'],
  });
}

async function buildHospitalResult(entities: string[], _adapters: AgentAdapters, context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const specialty = activeSpecialty(entities, context);
  const focus = hospitalFocusTopic(context ?? emptyContext());
  const input = rankInput('routine', specialty, context);
  const hospitals = rankHospitals(await directoryHospitals(specialty, patient), input).slice(0, 4);
  // Pre-filter relevant doctors on the hospital page when a condition/specialty context exists.
  const hospitalHref = (slug: string) => focus ? `${ROUTES.hospitals}/${slug}?focus=${encodeURIComponent(focus)}` : `${ROUTES.hospitals}/${slug}`;
  return emptyResult('hospital', {
    summary: specialty ? `Hospitals for ${specialty}` : 'Hospitals in the CareLink directory',
    explanation: 'Hospitals from the CareLink directory, ranked by relevance, distance (when known) and available data. Tap a card to view the full hospital profile.',
    urgency: 'routine',
    meta: { confidence: hospitals.length > 0 ? 'high' : 'low', urgency: 'routine', tier: 'next-action', disclaimer: 'Availability is unlisted unless the provider publishes it — confirm directly with the hospital.' },
    recommendedNextSteps: ['Compare profiles and pick the facility that matches your needs.'],
    hospitals,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink hospital directory'],
    actions: [
      ...(hospitals[0]?.detailSlug ? [{ type: 'view-hospital' as const, label: 'View relevant doctors', href: hospitalHref(hospitals[0].detailSlug), icon: 'view-doctor' as const }] : []),
      { type: 'find-hospital', label: 'Browse all hospitals', href: ROUTES.hospitals, icon: 'find-hospital' },
    ],
    suggestedReplies: ['Find a doctor', 'Get directions', 'Book an appointment'],
  });
}

async function buildDoctorResult(entities: string[], _adapters: AgentAdapters, context?: ConversationContext, _patient?: PatientPoint | null): Promise<AgentResult> {
  const specialty = activeSpecialty(entities, context);
  const input = rankInput('routine', specialty, context);
  const doctors = rankDoctors(await directoryDoctors(specialty), input).slice(0, 4);
  return emptyResult('doctor', {
    summary: specialty ? `${specialty} specialists` : 'Doctors in the CareLink directory',
    explanation: 'Doctors from the CareLink directory, ranked by relevance and available data. Tap a card to view the doctor profile. Availability is unlisted until a provider publishes real slots.',
    urgency: 'routine',
    meta: { confidence: doctors.length > 0 ? 'high' : 'low', urgency: 'routine', tier: 'next-action', disclaimer: 'Availability is unlisted — confirm during booking.' },
    recommendedNextSteps: ['Review profiles and request a consultation.'],
    doctors,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink doctor directory'],
    actions: [{ type: 'book-appointment', label: 'Request an appointment', href: ROUTES.appointments, icon: 'book-appointment' }],
    suggestedReplies: ['Find a hospital', 'Book an appointment', 'What should I do next?'],
  });
}

async function buildPharmacyResult(adapters: AgentAdapters, context?: ConversationContext, medicine?: string, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  input.specialty = medicine;
  // REAL sourced pharmacy directory (corridor-wide), never the legacy fabricated
  // US demo set. The adapters path is retained only for a configured live
  // provider; the bundled directory is the truthful default.
  const realPharmacies = await getPharmacyRecommendations(
    patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
      ? { lat: patient.lat, lng: patient.lng }
      : null,
    6,
  );
  const usingReal = realPharmacies.length > 0;
  const source = usingReal
    ? realPharmacies
    : await adapters.pharmacies.search(medicine ?? '', { activeProfileId: 'self', profile: { id: 'self', label: 'Self', relation: 'self', contextSummary: '', contextTags: [] } });
  const ranked = rankPharmacies(source, input).slice(0, 4);
  const { results: pharmacies } = usingReal
    ? { results: ranked }
    : localizePharmacies(ranked, patient ?? null, !isAnyProviderReal());
  return emptyResult('pharmacy', {
    summary: medicine ? `Pharmacies for ${medicine}` : 'Pharmacies near you',
    explanation: usingReal
      ? 'Pharmacies from the sourced corridor directory, ranked by distance from your location. Medicine stock is not connected — confirm availability with the pharmacy.'
      : 'Nearby pharmacies from the CareLink network, ranked by distance, open status and estimated cost.',
    urgency: 'routine',
    meta: {
      confidence: pharmacies.length > 0 ? 'medium' : 'low',
      urgency: 'routine',
      tier: 'next-action',
      disclaimer: 'Medicine stock is not connected — confirm availability directly with the pharmacy before visiting.',
    },
    recommendedNextSteps: ['Call ahead to confirm the medicine is in stock before you travel.'],
    pharmacies,
    dataSource: dataSourceFor(),
    isDemoData: !usingReal && !isAnyProviderReal(),
    sources: [usingReal
      ? 'Sourced corridor pharmacy directory (OpenStreetMap, ODbL)'
      : (isAnyProviderReal() ? 'CareLink pharmacy network' : 'CareLink pharmacy network (mock)')],
    suggestedReplies: ['Find a hospital', 'Upload a prescription', 'Find a doctor'],
  });
}

async function buildLabResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  // REAL sourced laboratory directory. Falls back to the mock set only when the
  // sourced directory has no records at all (it never silently mixes the two).
  const realLabs = await getLaboratoryRecommendations(
    patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
      ? { lat: patient.lat, lng: patient.lng }
      : null,
    6,
  );
  const usingReal = realLabs.length > 0;
  const ranked = rankLabs(usingReal ? realLabs : labRecommendations, input).slice(0, 4);
  const { results: labs } = usingReal
    ? { results: ranked }
    : localizeLabs(ranked, patient ?? null, !isAnyProviderReal());
  return emptyResult('lab', {
    summary: 'Diagnostic & lab centers',
    explanation: usingReal
      ? 'Laboratories from the sourced corridor directory, ranked by distance. Test menus and home collection are shown only when the source published them.'
      : 'Diagnostic and lab centers from the CareLink network, ranked by distance, home collection and relevance. Home collection is indicated where available.',
    urgency: 'routine',
    meta: {
      confidence: labs.length > 0 ? 'medium' : 'low',
      urgency: 'routine',
      tier: 'next-action',
      disclaimer: 'Test availability is not published for every facility — confirm directly with the lab.',
    },
    recommendedNextSteps: ['Choose a lab and call to confirm test availability.'],
    labs,
    dataSource: dataSourceFor(),
    isDemoData: !usingReal && !isAnyProviderReal(),
    sources: [usingReal
      ? 'Sourced corridor laboratory directory (OpenStreetMap, ODbL)'
      : (isAnyProviderReal() ? 'CareLink lab network' : 'CareLink lab network (mock)')],
    suggestedReplies: ['Upload a lab report', 'Find a doctor', 'What should I do next?'],
  });
}

/**
 * Blood centres — REAL sourced records from the corridor directory. No stock
 * level is ever reported: `stockSource` is 'not_integrated' until an authorised
 * live service exists, so the user is told to confirm with the centre.
 */
async function buildBloodCentreResult(patient?: PatientPoint | null): Promise<AgentResult> {
  const centres = await getBloodCentres();
  const bloodCentres: BloodCentreRecommendation[] = centres.map((centre) => {
    const distanceKm = patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
      && typeof centre.latitude === 'number' && typeof centre.longitude === 'number'
      ? haversineKm({ lat: patient.lat, lng: patient.lng }, { lat: centre.latitude, lng: centre.longitude })
      : null;
    return {
      id: centre.id,
      name: centre.name,
      address: centre.address,
      locality: centre.locality,
      ...(centre.phone ? { phone: centre.phone } : {}),
      ...(centre.website ? { website: centre.website } : {}),
      ...(centre.ownership ? { ownership: centre.ownership } : {}),
      ...(centre.hospital_id ? { hospitalId: centre.hospital_id } : {}),
      stockSource: centre.stock_source ?? 'not_integrated',
      ...(distanceKm != null ? {
        route: {
          destinationName: centre.name,
          destinationAddress: centre.address,
          distanceKm,
          estimatedTravelTimeMin: estimateDriveMinutes(distanceKm) ?? 0,
          transportMode: 'driving' as const,
        },
      } : {}),
      rank: { score: 0, reasons: ['Sourced corridor blood centre'] },
      evidence: 'Directory listing — confirm current availability with the centre.',
      limitations: ['Live blood-group stock is not integrated.'],
    } as BloodCentreRecommendation;
  });

  return emptyResult('blood', {
    summary: 'Blood centres along the corridor',
    explanation: 'Sourced blood centres in the Machilipatnam–Vijayawada corridor with their published contact details. Live blood-group stock is not connected, so confirm current availability and donor eligibility directly with the centre.',
    urgency: 'routine',
    meta: {
      confidence: 'medium', urgency: 'routine', tier: 'next-action',
      disclaimer: 'Blood-group stock is not live. Confirm availability with the centre (or e-RaktKosh) before travelling.',
    },
    recommendedNextSteps: ['Call the blood centre to confirm the required group is available.', 'Check e-RaktKosh for the official national stock service.'],
    bloodCentres,
    dataSource: 'real',
    isDemoData: false,
    sources: ['Indian Red Cross Society blood centre directory', 'CareLink corridor directory'],
    suggestedReplies: ['Open the blood banks page', 'Find a hospital near me', 'Book an appointment'],
    actions: [
      { type: 'view-lab', label: 'Open blood banks page', href: ROUTES.bloodBanks, icon: 'view-lab' },
    ],
  });
}

/**
 * Resolve a medicine identity from free text, then VERIFY it against an
 * authoritative reference database.
 *
 * The adapter's demo catalog only knows a handful of names, so a real medicine
 * typed by the user ("atorvastatin", "pantoprazole") would otherwise produce no
 * medicine result at all. Candidate names are therefore extracted from the text
 * and each is offered to the authoritative lookup. A candidate is only ever
 * SHOWN when the lookup verifies it — otherwise the honest "not identified"
 * result is returned.
 */
async function resolveIdentifiedMedicine(
  rawInput: string,
  adapters: AgentAdapters,
  preRecognized?: { name: string | null } | null,
): Promise<MedicineRecognitionResult | null> {
  const recognized = preRecognized !== undefined ? preRecognized : await adapters.medicines.recognize({ text: rawInput });
  const direct = recognized?.name ? await identifyMedicine({ text: recognized.name }) : null;
  if (direct?.name) return direct;

  for (const candidate of extractMedicineCandidates(rawInput)) {
    const verified = await identifyMedicine({ text: candidate }).catch(() => null);
    if (verified?.name) return verified;
  }
  return null;
}

async function buildMedicineResult(
  rawInput: string,
  _adapters: AgentAdapters,
  context?: ConversationContext,
  patient?: PatientPoint | null,
  language: AgentLanguage = 'en',
  documents: HealthDocument[] = [],
  resolved?: MedicineRecognitionResult | null,
): Promise<AgentResult> {
  // Resolve the medicine NAME first (registry: real provider when configured,
  // honest low-confidence demo match otherwise), then verify that name against an
  // authoritative reference database. Passing the whole user sentence to a
  // reference lookup would risk matching an unrelated drug, so the name is
  // extracted before verification.
  const recognized = await _adapters.medicines.recognize({ text: rawInput });
  const identified = resolved ?? await resolveIdentifiedMedicine(rawInput, _adapters, recognized);
  const medicine: MedicineResult | null = identified?.name
    ? {
      id: `med-${identified.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
      name: identified.name,
      commonPurpose: identified.commonPurpose ?? 'Purpose not confirmed — verify with a pharmacist.',
      importantSafetyInfo: identified.safetyWarning ?? localized(MEDICATION_CONSULT_NOTICE, language),
      prescriptionRequired: identified.prescriptionRequired,
      interactionWarningPlaceholder: 'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
      strength: identified.strength ?? undefined,
      dosageForm: identified.dosageForm ?? undefined,
      manufacturer: identified.manufacturerPlaceholder ?? undefined,
      recognitionConfidence: identified.confidence / 100,
      uncertain: identified.isUncertain,
      source: identified.source === 'real' ? 'real' : 'mock',
      verified: identified.verified === true,
      uses: identified.uses,
      sideEffects: identified.sideEffects,
      seriousWarnings: identified.seriousWarnings,
      referenceDosage: identified.referenceDosage ?? null,
      uncertaintyReason: identified.uncertaintyReason ?? null,
      evidence: identified.evidence,
      unverified: identified.unverified,
    }
    : recognized
      ? { ...recognized, uncertain: true, source: 'mock' as const }
      : null;
  const identifiedEvidence: EvidenceReference[] = identified?.evidence ?? [];
  // §8.4 — the mandatory professional-consultation notice, in the user's language.
  const consultNotice = localized(MEDICATION_CONSULT_NOTICE, language);

  // A medicine PHOTOGRAPH attached to this turn was already analysed by the REAL
  // vision pipeline. Surface that read (and its verification level) instead of a
  // demo response, and never claim an identification that was not verified.
  const photoDoc = documents.find((d) => d.secureAnalysis?.category === 'medicine-image');
  const photo = photoDoc?.secureAnalysis;

  if (photo) {
    const level = photo.identificationLevel ?? 'unidentifiable';
    const read = photo.visionRead;
    const med = photo.medicine;
    const uncertain = level !== 'verified';
    const printed = read
      ? [read.brandName, read.strength, read.dosageForm].filter(Boolean).join(' ')
      : '';

    const summary = level === 'verified' && med?.name
      ? `Medicine photo — ${med.name}${med.strength ? ` ${med.strength}` : ''}`
      : level === 'possible'
        ? 'Medicine photo — possible match (unverified)'
        : 'Medicine photo — could not be identified';

    // Verified facts + the user's own prescription instruction for the medicine
    // read from the photo (when a prescription was attached alongside it).
    const careInfo = med ? buildMedicineCareInfo(med, documents) : null;
    const rx = careInfo?.prescriptionInstruction ?? null;

    return emptyResult('medicine', {
      summary,
      explanation: `${photo.summary}${rx ? ` Your attached prescription says: “${rx.asWritten}”.` : ''} ${consultNotice}`,
      urgency: 'routine',
      meta: {
        confidence: level === 'verified' ? 'medium' : 'low',
        urgency: 'routine',
        tier: level === 'verified' ? 'educational' : 'professional',
        disclaimer: consultNotice,
      },
      recommendedNextSteps: rx
        ? [`Follow the prescription exactly as written: “${rx.asWritten}”.`, 'Confirm this medicine and its dose with a pharmacist before use.']
        : level === 'verified'
          ? ['Confirm this medicine and its dose with a pharmacist before use.']
          : ['Photograph the front and back of the strip or box in good light, or type the printed name.', 'Ask a pharmacist to confirm the medicine before purchase or use.'],
      medicines: med ? [{
        id: `med-${photoDoc!.id}`,
        name: med.name ?? printed ?? 'Unidentified medicine',
        commonPurpose: med.commonPurpose ?? 'Purpose not confirmed — verify with a pharmacist.',
        importantSafetyInfo: med.safetyWarning ?? consultNotice,
        prescriptionRequired: med.prescriptionRequired,
        interactionWarningPlaceholder: 'Interaction checks require your full medication list — ask your doctor or pharmacist to review for interactions.',
        strength: med.strength ?? undefined,
        dosageForm: med.dosageForm ?? undefined,
        manufacturer: med.manufacturerPlaceholder ?? undefined,
        recognitionConfidence: med.confidence / 100,
        uncertain: med.isUncertain || uncertain,
        source: 'real',
        verified: med.verified === true,
        uses: med.uses,
        sideEffects: med.sideEffects,
        seriousWarnings: med.seriousWarnings,
        referenceDosage: med.referenceDosage ?? null,
        uncertaintyReason: med.uncertaintyReason ?? null,
        evidence: med.evidence,
        unverified: med.unverified,
      }] : [],
      medicineCareInfo: careInfo ?? undefined,
      warnings: uncertain
        ? [`Medicine identification is not confirmed (${level}). Verify the name and strength on the strip or with a pharmacist.`]
        : [],
      dataSource: 'real',
      isDemoData: false,
      sources: med?.evidence?.length ? med.evidence.map((e) => e.label) : ['Medicine photograph (vision analysis)'],
      actions: [
        { type: 'find-pharmacy', label: 'Find a pharmacy', href: ROUTES.pharmacies, icon: 'find-pharmacy' },
        { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.ai, icon: 'upload-prescription' },
      ],
      suggestedReplies: ['Find a pharmacy near me', 'Upload a prescription', 'What should I do next?'],
    });
  }

  // §9: never invent a medicine. When recognition fails or is uncertain, say
  // so plainly and route to verification instead of substituting a guess.
  if (!medicine) {
    return emptyResult('medicine', {
      summary: 'Medicine not confidently identified',
      explanation: `Medicine identification is uncertain. Please verify the name and strength with the label or a pharmacist before taking any action. ${consultNotice}`,
      urgency: 'routine',
      meta: {
        confidence: 'low', urgency: 'routine', tier: 'professional',
        disclaimer: consultNotice,
      },
      recommendedNextSteps: ['Check the exact name and strength printed on the strip/label.', 'Ask a pharmacist to confirm the medicine before purchase or use.'],
      warnings: ['Medicine identification is uncertain. Please verify the name and strength with the label/pharmacist.'],
      dataSource: dataSourceFor(),
      isDemoData: !isAnyProviderReal(),
      sources: [isAnyProviderReal() ? 'CareLink medicine knowledge' : 'Medicine name not verified'],
      actions: [
        { type: 'find-pharmacy', label: 'Ask a pharmacist', href: ROUTES.pharmacies, icon: 'find-pharmacy' },
        { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.ai, icon: 'upload-prescription' },
      ],
      suggestedReplies: ['Find a pharmacy near me', 'Upload a prescription'],
    });
  }

  const med = medicine;
  // REAL sourced pharmacy discovery for EVERY medicine (not only the three
  // legacy demo drugs that happened to carry a `pharmacyDiscoveryAction`).
  const rankedPharmacies = rankPharmacies(
    await getPharmacyRecommendations(
      patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
        ? { lat: patient.lat, lng: patient.lng }
        : null,
      6,
    ),
    rankInput('routine', med.name, context),
  ).slice(0, 3);
  const { results: pharmacies } = { results: rankedPharmacies };
  const uncertain = med.uncertain === true || (typeof med.recognitionConfidence === 'number' && med.recognitionConfidence < 0.6);
  const careInfo = buildMedicineCareInfo(identified!, documents);

  // The user's OWN prescription instruction (when attached) is shown verbatim and
  // clearly separated from general educational information. It is never turned
  // into advice and never used to change a dose.
  const rx = careInfo.prescriptionInstruction;
  const rxNote = rx
    ? ` Your attached prescription says: “${rx.asWritten}”${rx.page ? ` (page ${rx.page})` : ''}. This is reproduced exactly as written — confirm anything unclear with the prescriber.`
    : '';
  const nextSteps = rx
    ? [
        `Follow the prescription exactly as written: “${rx.asWritten}”.`,
        'Do not change the dose without asking your doctor or pharmacist.',
      ]
    : [med.prescriptionRequired ? 'This medicine needs a prescription — consult your doctor.' : 'Available over the counter; follow label directions.'];

  const warnings: string[] = [];
  if (uncertain) warnings.push('Medicine identification is uncertain. Please verify the name and strength with the label/pharmacist.');
  if (!careInfo.verified) warnings.push('No verified reference information is available for this medicine — nothing about its uses or side effects is shown rather than guessing.');
  if (rx && rx.needsConfirmation.length > 0) warnings.push(`Your prescription line could not be fully read (${rx.needsConfirmation.join(', ')}). Confirm those fields with the prescriber.`);

  return emptyResult('medicine', {
    summary: `Medicine info — ${med.name}`,
    explanation: `General medicine information for navigation only. This is not a prescription or dosage recommendation.${rxNote} ${consultNotice}`,
    urgency: 'routine',
    meta: {
      confidence: uncertain ? 'low' : 'medium', urgency: 'routine', tier: 'educational',
      disclaimer: consultNotice,
    },
    recommendedNextSteps: nextSteps,
    medicines: [med],
    medicineCareInfo: careInfo,
    pharmacies,
    warnings,
    dataSource: medicine.source === 'real' ? 'real' : dataSourceFor(),
    isDemoData: medicine.source !== 'real' && !isAnyProviderReal(),
    sources: identifiedEvidence.length > 0 ? identifiedEvidence.map((e) => e.label) : ['Medicine reference lookup unavailable'],
    actions: [
      { type: 'find-pharmacy', label: 'Find a pharmacy', href: ROUTES.pharmacies, icon: 'find-pharmacy' },
      { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.ai, icon: 'upload-prescription' },
    ],
    suggestedReplies: ['Find a pharmacy', 'Upload a prescription', 'What should I do next?'],
  });
}

/**
 * Prescription-aware result.
 *
 * Previously an attached prescription fell through the text classifier and
 * produced a generic "Understanding your report" answer — the extracted
 * medication schedule never reached the user. This builder reproduces the
 * prescription EXACTLY as written, resolves each named medicine against an
 * authoritative reference database (never a guess), and offers real pharmacy
 * discovery. It never creates, changes or reminds about a prescription.
 */
async function buildPrescriptionResult(
  documents: HealthDocument[],
  patient?: PatientPoint | null,
  language: AgentLanguage = 'en',
): Promise<AgentResult> {
  const consultNotice = localized(MEDICATION_CONSULT_NOTICE, language);
  const rxDoc = documents.find((d) => d.secureAnalysis?.prescription?.schedule?.length);
  const rx = rxDoc?.secureAnalysis?.prescription;

  if (!rx || (rx.schedule ?? []).length === 0) {
    return emptyResult('medicine', {
      summary: 'Prescription received — no medication lines could be read',
      explanation: `No medicine line could be read from the attached prescription, so nothing has been interpreted. Upload a clearer photo or PDF of the prescription. ${consultNotice}`,
      urgency: 'routine',
      meta: { confidence: 'low', urgency: 'routine', tier: 'professional', disclaimer: consultNotice },
      recommendedNextSteps: ['Upload a clearer copy of the prescription, or type the medicine names you want to check.'],
      dataSource: 'real',
      isDemoData: false,
      sources: ['CareLink document pipeline'],
      actions: [
        { type: 'upload-prescription', label: 'Upload a prescription', href: ROUTES.ai, icon: 'upload-prescription' },
        { type: 'find-doctor', label: 'Find a doctor', href: ROUTES.doctors, icon: 'find-doctor' },
      ],
      suggestedReplies: ['Upload a prescription', 'Find a doctor'],
    });
  }

  const schedule = rx.schedule ?? [];
  // Verify each named medicine against a real reference database. A name that
  // does not resolve is reported as unverified — never presented as a fact.
  const verified = await Promise.all(schedule.map(async (row) => {
    const identified = await identifyMedicine({ text: row.medicine }).catch(() => null);
    return {
      row,
      info: identified && identified.verified ? identified : null,
    };
  }));

  const verifiedNames = verified.filter((v) => v.info).map((v) => v.info!.genericName ?? v.info!.name ?? v.row.medicine);
  const unverifiedNames = verified.filter((v) => !v.info).map((v) => v.row.medicine);
  const anyNeedsConfirmation = schedule.some((r) => r.needsConfirmation.length > 0);

  const pharmacies = rankPharmacies(
    await getPharmacyRecommendations(
      patient && typeof patient.lat === 'number' && typeof patient.lng === 'number'
        ? { lat: patient.lat, lng: patient.lng }
        : null,
      6,
    ),
    rankInput('routine', undefined, undefined),
  ).slice(0, 3);

  const warnings: string[] = [];
  if (unverifiedNames.length > 0) {
    warnings.push(`These medicines could not be verified against a reference database: ${unverifiedNames.join(', ')}. Confirm the exact name and strength on the prescription with your pharmacist.`);
  }
  if (anyNeedsConfirmation) warnings.push('Some prescription fields could not be read clearly. Confirm those lines with the prescriber or pharmacist.');

  return emptyResult('medicine', {
    summary: `Your prescription — ${schedule.length} medicine line(s)`,
    explanation: `Your prescription has been read and is reproduced below exactly as written${rx.doctorName ? ` (prescribed by ${rx.doctorName})` : ''}${rx.date ? ` on ${rx.date}` : ''}. ${verifiedNames.length > 0 ? `Verified against a reference database: ${verifiedNames.join(', ')}. ` : ''}This is your own prescription, shown verbatim — CareLink does not create, change or remind you about a prescription. ${consultNotice}`,
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'professional', disclaimer: consultNotice },
    recommendedNextSteps: [
      'Follow each instruction exactly as written on the prescription.',
      'Ask your pharmacist to confirm any line that is unclear, and to check for interactions with your other medicines.',
    ],
    prescriptionSchedule: schedule.map((r) => ({
      medicine: r.medicine,
      strength: r.strength,
      form: r.form,
      instruction: r.instruction,
      frequency: r.frequency,
      timing: r.timing,
      duration: r.duration,
      schedule: r.schedule,
      needsConfirmation: r.needsConfirmation,
      page: r.page,
    })),
    pharmacies,
    warnings,
    dataSource: 'real',
    isDemoData: false,
    sources: ['Values read from your uploaded prescription', ...(verifiedNames.length > 0 ? ['RxNorm / openFDA medicine reference lookup'] : [])],
    actions: [
      { type: 'find-pharmacy', label: 'Find a pharmacy', href: ROUTES.pharmacies, icon: 'find-pharmacy' },
      { type: 'find-doctor', label: 'Find a doctor', href: ROUTES.doctors, icon: 'find-doctor' },
    ],
    suggestedReplies: ['Find a pharmacy', 'Find a doctor', 'What should I do next?'],
  });
}

/**
 * Build a report result from the REAL secure analysis of the attached documents.
 *
 * This previously returned a hardcoded "mock interpretation" (FBS 132, HbA1c
 * 6.8%, …) regardless of the uploaded file. It now reads the actual extracted
 * lab values produced by the documents pipeline, and states honestly when no
 * analysis is available yet — it never invents values.
 */
/**
 * Synchronous report construction. The facility discovery result is computed
 * asynchronously by the caller (it needs the directory) and passed in, so this
 * function stays pure and testable.
 */
function buildReportResultSync(documents: HealthDocument[], discovery: ReportFacilityDiscovery): AgentResult {
  const analysed = documents.filter((d) => d.secureAnalysis);
  const labDoc = analysed.find((d) => d.secureAnalysis?.labResult);
  const sourceFile = documents.find((d) => d.kind === 'pdf' || d.kind === 'document')?.fileName
    ?? documents[0]?.fileName;

  if (!labDoc?.secureAnalysis?.labResult) {
    const failed = documents.find((d) => d.pipelineError);
    return emptyResult('report', {
      summary: 'Report received — no lab values extracted yet',
      explanation: failed
        ? `The document could not be analysed (${failed.pipelineError}). No values have been interpreted. ${failed.errorMessage ?? ''}`.trim()
        : 'No laboratory values could be read from the attached document, so nothing has been interpreted. Upload a clearer copy of the report (a PDF or a well-lit photo of the value table).',
      urgency: 'routine',
      meta: {
        confidence: 'low', urgency: 'routine', tier: 'professional',
        disclaimer: 'No real analysis was produced. CareLink has not interpreted this document.',
      },
      recommendedNextSteps: ['Upload a clearer copy of the report, or type the values you want to discuss with your doctor.'],
      sources: ['CareLink document pipeline'],
      actions: [
        { type: 'find-doctor', label: 'Find a doctor', href: ROUTES.doctors, icon: 'find-doctor' },
        { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
      ],
      suggestedReplies: ['Find a doctor', 'Find a hospital', 'What should I do next?'],
    });
  }

  const analysis = labDoc.secureAnalysis;
  const lab = analysis.labResult!;
  const toReportValue = (v: typeof lab.values[number]): MedicalReportValue => ({
    label: v.testName,
    value: `${v.measuredValue}${v.unit ? ` ${v.unit}` : ''}`.trim(),
    range: v.referenceRange || undefined,
    status: v.critical ? 'abnormal' : v.status === 'abnormal' ? 'abnormal' : v.status === 'attention' ? 'attention' : 'normal',
  });

  const report: MedicalReport = {
    id: `report-${labDoc.id}`,
    reportTitle: `Lab report — ${sourceFile ?? 'uploaded document'}`,
    sourceFileName: sourceFile,
    summary: analysis.summary,
    importantObservations: analysis.importantObservations.slice(0, 10),
    valuesRequiringAttention: lab.valuesRequiringAttention.slice(0, 12).map(toReportValue),
    normalValues: lab.normalValues.slice(0, 12).map(toReportValue),
    trendComparisonPlaceholder: 'Trend comparison becomes available once several reports are analysed over time.',
    questionsToAskYourDoctor: [
      'Which of these values need attention, and what do they mean for me?',
      'Do any of these results change my current treatment?',
      'When should I retest?',
    ],
    recommendedNextAction: analysis.recommendedNextAction,
    isMockInterpretation: false,
  };

  const critical = lab.values.some((v) => v.critical);
  const hasAttention = lab.valuesRequiringAttention.length > 0;

  // --- Evidence-grounded facility discovery ---------------------------------
  // Facilities come from the caller-computed discovery result, which only
  // includes a facility when that facility INDEPENDENTLY publishes the matching
  // department. We never pad the list and never claim a treatment capability.
  const reportFacilities: ReportFacilityRecommendation[] = discovery.facilities.map((f) => ({
    specialty: f.specialty,
    area: discovery.specialties.find((s) => s.specialty === f.specialty)?.area ?? '',
    matchedDepartment: f.matchedDepartment,
    findings: f.findings.map((x) => ({
      testName: x.testName,
      measuredValue: x.measuredValue,
      referenceRange: x.referenceRange,
      basis: x.basis,
    })),
    whyRelevant: f.whyRelevant,
    facility: f.facility,
  }));

  const primarySpecialty = discovery.specialties[0];
  // A facility can be relevant for more than one specialty (e.g. it publishes
  // both Nephrology and Cardiology). De-duplicate so the SAME hospital is never
  // rendered twice — a duplicate React key would also break list identity.
  const seenFacilityIds = new Set<string>();
  const hospitals = discovery.facilities
    .filter((f) => {
      if (seenFacilityIds.has(f.facility.id)) return false;
      seenFacilityIds.add(f.facility.id);
      return true;
    })
    .map((f) => f.facility)
    .slice(0, 4);
  const seenDoctorIds = new Set<string>();
  const doctors = discovery.facilities
    .flatMap((f) => f.doctors)
    .filter((d) => {
      if (seenDoctorIds.has(d.id)) return false;
      seenDoctorIds.add(d.id);
      return true;
    })
    .slice(0, 3);

  // Honest notice when a finding needs a service but no facility publishes it.
  const reportFacilityNotice = discovery.nothingToActOn
    ? 'No value on this report is outside its reference range, so no clinical service is indicated from it. Keep it with your records and share it at your next routine visit.'
    : discovery.noPublishedMatch
      ? `Your report shows a value that is usually reviewed by ${discovery.specialties.map((s) => s.specialty).join(' or ')}. No facility in the CareLink directory publishes that service yet, so no facility is recommended rather than showing an unrelated one. Ask your current doctor for a referral.`
      : undefined;

  const nextSteps = [
    analysis.recommendedNextAction,
    ...(discovery.facilities.length > 0
      ? [`Confirm with a clinician: ${discovery.specialties.map((s) => s.specialty).join(', ')} is the service that usually manages the value(s) flagged on this report.`]
      : []),
  ];

  return emptyResult('report', {
    summary: `Medical report — ${lab.values.length} value(s) read`,
    explanation: analysis.summary,
    urgency: critical ? 'urgent' : hasAttention ? 'attention' : 'routine',
    meta: {
      confidence: 'medium',
      urgency: critical ? 'urgent' : hasAttention ? 'attention' : 'routine',
      tier: 'professional',
      disclaimer: 'Values were read from your uploaded document. This is navigational information, not a diagnosis — confirm with a licensed professional.',
    },
    recommendedNextSteps: nextSteps,
    medicalReport: report,
    hospitals,
    doctors,
    reportFacilities,
    reportFacilityNotice,
    dataSource: 'real',
    isDemoData: false,
    sources: analysis.evidence?.length ? analysis.evidence.map((e) => e.label) : ['Values read from your uploaded document'],
    actions: [
      ...(primarySpecialty
        ? [{ type: 'find-doctor' as const, label: `Find a ${primarySpecialty.specialty} specialist`, href: `${ROUTES.doctors}?q=${encodeURIComponent(primarySpecialty.specialty)}`, icon: 'find-doctor' as const }]
        : [{ type: 'find-doctor' as const, label: 'Find a relevant doctor', href: ROUTES.doctors, icon: 'find-doctor' as const }]),
      { type: 'open-command-center', label: 'What should I do next?', href: ROUTES.ai, icon: 'open-command-center' },
    ],
    suggestedReplies: primarySpecialty
      ? [`Find a ${primarySpecialty.specialty} specialist`, 'What should I do next?', 'Find a hospital']
      : ['Find a doctor', 'What should I do next?', 'Find a hospital'],
  });
}

/**
 * Report result WITH facility discovery. Reads the real directory, then maps the
 * report's abnormal findings onto facilities that publish the matching service.
 * Nothing is recommended when nothing publishes it.
 */
async function buildReportResultWithDiscovery(
  documents: HealthDocument[],
  patient?: PatientPoint | null,
): Promise<AgentResult> {
  const hasLabReport = documents.some((d) => d.secureAnalysis?.labResult);
  if (!hasLabReport) return buildReportResultSync(documents, { specialties: [], facilities: [], noPublishedMatch: false, nothingToActOn: true });
  const hospitals = await getHospitalRecommendations(originOf(patient));
  const discovery = matchFacilitiesForReport(documents, hospitals);
  return buildReportResultSync(documents, discovery);
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

async function buildRouteResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  const ranked = rankHospitals(await directoryHospitals(undefined, patient), input);
  const hospital = ranked[0];
  if (!hospital) {
    return emptyResult('route', {
      summary: 'No facility available to route to',
      explanation: 'The CareLink directory has no facility records loaded, so a route cannot be built.',
      urgency: 'routine',
      meta: { confidence: 'low', urgency: 'routine', tier: 'next-action' },
      actions: [{ type: 'find-hospital', label: 'Browse hospitals', href: ROUTES.hospitals, icon: 'find-hospital' }],
      suggestedReplies: ['Find a hospital', 'Find a doctor'],
    });
  }
  return emptyResult('route', {
    summary: `Directions to ${hospital.name}`,
    explanation: 'Route summary with distance and estimated travel time. Connect a maps provider later for live navigation.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: 'Travel time is an estimate and may vary with traffic.' },
    recommendedNextSteps: [`Head to ${hospital.name}${hospital.distanceAvailable ? ` (~${hospital.estimatedTravelTimeMin} min)` : ''}.`],
    routes: [hospital.route ?? buildRouteFromHospital(hospital)],
    hospitals: [hospital],
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
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

async function buildChildCareResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', 'Paediatrics', context);
  const doctors = rankDoctors(await directoryDoctors('Paediatrics'), input).slice(0, 2);
  const hospitals = rankHospitals(await directoryHospitals('Paediatrics', patient), input).slice(0, 2);
  return emptyResult('child-care', {
    summary: 'Child-care guidance',
    explanation: 'Navigational guidance for common child-care questions — symptoms, vaccinations, and finding pediatric care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['For anything concerning, contact your pediatrician promptly.'],
    doctors,
    hospitals,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
    suggestedReplies: ['Find a pediatrician', 'Vaccination schedule', 'Find a hospital'],
  });
}

async function buildElderCareResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  const doctors = rankDoctors(await directoryDoctors(undefined), input).slice(0, 2);
  const hospitals = rankHospitals(await directoryHospitals(undefined, patient), input).slice(0, 2);
  return emptyResult('elder-care', {
    summary: 'Elder-care guidance',
    explanation: 'Navigational guidance for elder-care — chronic conditions, medications, and finding geriatric-friendly care.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'educational', disclaimer: DISCLAIMER_MEDICAL },
    recommendedNextSteps: ['Coordinate chronic-condition care with a primary physician.'],
    doctors,
    hospitals,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
    suggestedReplies: ['Find a doctor', 'Find a hospital', 'My medicines'],
  });
}

async function buildMentalHealthResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('attention', 'Psychiatry', context);
  const hospitals = rankHospitals(await directoryHospitals('Psychiatry', patient), input).slice(0, 1);
  return emptyResult('mental-health', {
    summary: 'Mental-health navigation',
    explanation: 'Supportive, navigational guidance for mental health. This is not a crisis line — for emergencies, call your local emergency number.',
    urgency: 'attention',
    meta: { confidence: 'medium', urgency: 'attention', tier: 'triage', disclaimer: 'If you are in crisis or considering self-harm, contact emergency services or a crisis helpline immediately.' },
    warnings: ['If you are in immediate danger, call your local emergency number now.'],
    recommendedNextSteps: ['Connect with a mental-health professional or counselor for support.'],
    hospitals,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink directory'],
    actions: [{ type: 'call-emergency', label: `Crisis helpline ${primaryEmergencyContact('in').phone}`, href: primaryEmergencyContact('in').href, icon: 'call-emergency' }],
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

async function buildLocationResult(context?: ConversationContext, patient?: PatientPoint | null): Promise<AgentResult> {
  const input = rankInput('routine', undefined, context);
  const ranked = rankHospitals(await directoryHospitals(undefined, patient), input).slice(0, 3);
  return emptyResult('location', {
    summary: 'Location-aware healthcare search',
    explanation: patient
      ? 'Results are ranked by proximity to your location, plus available directory data.'
      : 'Results are ranked by available directory data. Share your location for real distances.',
    urgency: 'routine',
    meta: { confidence: 'medium', urgency: 'routine', tier: 'next-action', disclaimer: patient ? 'Distance is a straight-line estimate; travel time may vary with traffic.' : 'Distances are unavailable until you share your location or a maps provider is connected.' },
    recommendedNextSteps: ['Pick the closest facility and confirm availability before you travel.'],
    hospitals: ranked,
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: ['CareLink hospital directory'],
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

async function buildEmergencyResult(
  adapters: AgentAdapters,
  input: string,
  context?: ConversationContext,
  patient?: PatientPoint | null,
  language: AgentLanguage = 'en'
): Promise<AgentResult> {
  const assessment = await adapters.emergency.assess(input, { activeProfileId: 'self', profile: { id: 'self', label: 'Self', relation: 'self', contextSummary: '', contextTags: [] }, location: patient ? { label: patient.label ?? '', lat: patient.lat, lng: patient.lng } : undefined });
  const input2 = rankInput('emergency', undefined, context);
  const facilityHospitals = assessment.nearbyFacilities.map((f) => ({
    id: f.id, detailSlug: f.detailSlug ?? '', name: f.name, rating: 0, reviewCount: 0, specialties: [],
    distanceKm: f.distanceKm, estimatedTravelTimeMin: f.estimatedTravelTimeMin, isOpen: false, hasEmergency: true,
    address: f.address, city: '', route: f.route,
    distanceAvailable: Boolean(f.route), availabilityLabel: 'Availability unlisted',
  }));
  // Emergency relevance overrides normal ranking: nearest emergency-capable facility first.
  const facilities = rankHospitals(facilityHospitals, input2);
  const emergencyContact = primaryEmergencyContact('in');
  // Safety-critical emergency copy is DETERMINISTIC and localized — it never
  // depends on the AI provider being reachable (Phase 7 §7.2).
  return emptyResult('emergency', {
    summary: localized(EMERGENCY_TITLE, language),
    explanation: `${localized(EMERGENCY_GO_NOW, language)} ${localized(EMERGENCY_OPERATOR_HINT, language)}`,
    urgency: 'emergency',
    meta: { confidence: 'high', urgency: 'emergency', tier: 'emergency', disclaimer: DISCLAIMER_EMERGENCY },
    recommendedNextSteps: [assessment.recommendedNextAction],
    emergency: assessment,
    hospitals: facilities,
    routes: facilities.map((f) => f.route).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    dataSource: dataSourceFor(),
    isDemoData: false,
    sources: [isAnyProviderReal() ? 'CareLink emergency navigation' : 'CareLink emergency navigation (mock)'],
    actions: [
      { type: 'call-emergency', label: `${localized(EMERGENCY_CALL_LABEL, language)} (${emergencyContact.phone})`, href: emergencyContact.href, icon: 'call-emergency' },
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
    const patient = patientPoint(request);

    // A MEDICINE PHOTOGRAPH that was actually analysed by the vision pipeline is
    // authoritative about the turn: route to the medicine result directly instead
    // of relying on the text classifier (which only sees the literal string
    // "uploaded document"). This is what prevents an uploaded medicine photo from
    // producing a generic report/demo response.
    const analysedMedicinePhoto = request.documents.find(
      (d) => d.secureAnalysis?.category === 'medicine-image' && d.secureAnalysis?.identificationLevel
    );

    // A PRESCRIPTION that was actually read by the extraction pipeline is likewise
    // authoritative: the extracted medication schedule must reach the user, not a
    // generic report answer. Checked after the medicine photo so a photographed
    // medicine still wins when both are present.
    const analysedPrescription = !analysedMedicinePhoto
      && request.documents.some((d) => (d.secureAnalysis?.prescription?.schedule?.length ?? 0) > 0);

    // Phase 2 — detect the user's language BEFORE any branch, so the emergency
    // path is language-aware too and detection can never delay escalation.
    const detection = detectLanguage(request.text);
    const hasPriorTurns = (request.history?.length ?? 0) > 1;
    const responseLanguage = resolveResponseLanguage(detection, request.language, hasPriorTurns);

    // Emergency short-circuits everything — always escalate. Severity is never
    // "remembered away"; each emergency-pattern input is re-evaluated fresh.
    // The deterministic safety floor also forces emergency handling even if a
    // future real classifier misses the pattern.
    if (classification.intent === 'emergency' || inputSafetyFloor(request.text) === 'emergency') {
      const emergencyClassification = classification.intent === 'emergency'
        ? classification
        : { ...classification, intent: 'emergency' as const, confidence: 'high' as const };
      const result = await buildEmergencyResult(adapters, request.text, priorContext, patient, responseLanguage);
      result.safetyLevel = 'emergency';
      result.provenance = {
        mode: 'mock',
        provider: 'CareLink emergency navigation',
        fetchedAt: new Date().toISOString(),
        verification: 'validated',
      };
      const context = accumulateContext(
        { ...priorContext },
        { id: 'u', role: 'user', content: request.text, createdAt: new Date().toISOString(), documents: request.documents, contextTags: [], patientProfileId: request.patientContext.activeProfileId },
        'emergency'
      );
      return { result, classification: emergencyClassification, context, language: responseLanguage, detection };
    }

    let result: AgentResult;
    // An analysed medicine photograph wins over the text classifier: the photo is
    // the user's actual intent, and its analysis is real.
    if (analysedMedicinePhoto) {
      result = await buildMedicineResult(request.text, adapters, priorContext, patient, responseLanguage, request.documents);
    } else if (analysedPrescription) {
      result = await buildPrescriptionResult(request.documents, patient, responseLanguage);
    } else switch (classification.intent) {
      case 'symptom':
        result = await buildSymptomResultAsync(classification.entities, priorContext);
        break;
      case 'disease':
        result = await buildDiseaseResult(classification.entities, request.text, priorContext, patient);
        break;
      case 'hospital':
        result = await buildHospitalResult(classification.entities, adapters, priorContext, patient);
        break;
      case 'doctor':
        result = await buildDoctorResult(classification.entities, adapters, priorContext, patient);
        break;
      case 'pharmacy':
        result = await buildPharmacyResult(adapters, priorContext, classification.entities.find((e) => /metformin|paracetamol|amoxicillin/i.test(e)), patient);
        break;
      case 'lab':
        result = await buildLabResult(priorContext, patient);
        break;
      case 'blood':
        result = await buildBloodCentreResult(patient);
        break;
      case 'medicine':
        result = await buildMedicineResult(request.text, adapters, priorContext, patient, responseLanguage, request.documents);
        break;
      case 'report':
        result = await buildReportResultWithDiscovery(request.documents, patient);
        break;
      case 'appointment':
        result = buildAppointmentResult(adapters, 'view');
        break;
      case 'route':
        result = await buildRouteResult(priorContext, patient);
        break;
      case 'recovery':
        result = buildRecoveryResult();
        break;
      case 'vaccination':
        result = buildVaccinationResult();
        break;
      case 'child-care':
        result = await buildChildCareResult(priorContext, patient);
        break;
      case 'elder-care':
        result = await buildElderCareResult(priorContext, patient);
        break;
      case 'mental-health':
        result = await buildMentalHealthResult(priorContext, patient);
        break;
      case 'family':
        result = buildFamilyResult();
        break;
      case 'location':
        result = await buildLocationResult(priorContext, patient);
        break;
      default:
        // A typed medicine name that the keyword classifier did not recognise
        // ("tell me about atorvastatin") still deserves a verified answer rather
        // than a generic reply. The candidate must VERIFY against a reference
        // database or the general result stands — never a guess.
        const resolved = looksLikeMedicineQuestion(request.text)
          ? await resolveIdentifiedMedicine(request.text, adapters)
          : null;
        result = resolved
          ? await buildMedicineResult(request.text, adapters, priorContext, patient, responseLanguage, request.documents, resolved)
          : buildGeneralResult();
    }

    // Step 13: enrich with the structured AI engine (real gateway when
    // configured, clearly-labelled demo responder otherwise). The engine
    // validates the payload schema and enforces the medical safety layer
    // before anything reaches the UI. Failures degrade to the demo responder
    // — the conversation never breaks.
    const ai = await runAITurn({
      text: request.text,
      documents: request.documents,
      patientContext: request.patientContext,
      conversationContext: priorContext,
      history: request.history,
      language: request.language,
      allowedActions: ALLOWED_ACTIONS,
      classification,
    });
    result = mergeAIIntoResult(result, ai);

    const context = accumulateContext(
      { ...priorContext },
      { id: 'u', role: 'user', content: request.text, createdAt: new Date().toISOString(), documents: request.documents, contextTags: [], patientProfileId: request.patientContext.activeProfileId },
      classification.intent
    );

    return { result, classification, context, language: ai.responseLanguage, detection: ai.detection };
  };

  return { handle };
}

export { mockAdapters, buildAppointmentResult as buildAppointmentResultForKind };
export type { AgentAction, UrgencyLevel, InformationTier, MedicalReport, MedicalReportValue };

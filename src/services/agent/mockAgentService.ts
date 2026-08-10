/**
 * CareLink-AI Agent — mock agent service (Step 17).
 *
 * Given an intent classification + optional attachments, returns a structured
 * AgentResponse that result-card components render directly. No React here —
 * pure functions so logic is testable and backend-swappable.
 *
 * SAFETY: never returns a diagnosis or dosage change. Emergency intent returns
 * an EmergencyResponse payload that the UI escalates visually.
 */

import type {
  AgentAttachment,
  AgentIntent,
  AgentResponse,
  IntentClassification,
  MedicalReportResult,
  MedicalReportValue,
} from './agentTypes';
import {
  agentDoctorRecommendations,
  agentHospitalRecommendations,
  agentLabRecommendations,
  agentMedicineResults,
  agentPharmacyRecommendations,
  agentRecoverySeed,
  buildRouteFromHospital,
  findDoctorBySpecialty,
  findHospitalBySpecialty,
} from './mockData';

const DISCLAIMER_MEDICAL =
  'CareLink.AI provides navigational guidance, not a medical diagnosis. For diagnosis or treatment, consult a licensed healthcare professional.';
const DISCLAIMER_EMERGENCY =
  'If this is a life-threatening emergency, call your local emergency number immediately. This guidance does not replace emergency services.';

const pickFirstSpecialty = (entities: string[]): string | undefined => entities.find((e) => /^[A-Z]/.test(e));

/* ----------------------------------------------------------------------------
 * Per-intent response builders
 * ------------------------------------------------------------------------- */

function buildSymptomResponse(classification: IntentClassification): AgentResponse {
  const symptoms = classification.entities.length > 0 ? classification.entities : ['your symptoms'];
  const specialty = pickFirstSpecialty(classification.entities) ?? 'relevant';
  const specialtyLabel = `${specialty} specialist`;
  return {
    kind: 'symptom',
    title: 'Understanding your symptoms',
    explanation: 'Here is a calm, navigational summary of what you described and a safe next step. This is not a diagnosis.',
    meta: { confidence: 'medium', urgency: 'attention', disclaimer: DISCLAIMER_MEDICAL },
    suggestedReplies: [`Find a ${specialtyLabel}`, 'Find a hospital near me', 'What should I do next?'],
    data: {
      symptoms,
      possibleSpecialties: [specialtyLabel],
      guidance:
        'Based on what you described, the next safe step is to connect with an appropriate specialist. Track when symptoms started, severity, and any triggers before your visit.',
      recommendedNextAction: `Book a consultation with a ${specialtyLabel}, or visit a hospital if symptoms worsen.`,
      suggestedDoctorSpecialty: specialty,
    },
  };
}

function buildDiseaseResponse(classification: IntentClassification): AgentResponse {
  const term = classification.rawInput.toLowerCase();
  let diseaseName = classification.entities[0] ?? 'this condition';
  if (term.includes('diabetes')) diseaseName = 'Type 2 Diabetes';
  else if (term.includes('asthma')) diseaseName = 'Asthma';
  else if (term.includes('hypertension')) diseaseName = 'Hypertension';
  else if (term.includes('migraine')) diseaseName = 'Migraine';

  const specialties = pickFirstSpecialty(classification.entities) ? [pickFirstSpecialty(classification.entities)!] : ['Internal Medicine'];

  return {
    kind: 'disease',
    title: `${diseaseName} — care navigation`,
    explanation: 'A brief, trustworthy overview to help you navigate care. Always confirm specifics with your doctor.',
    meta: { confidence: 'medium', urgency: 'routine', disclaimer: DISCLAIMER_MEDICAL, sources: ['Mock knowledge base'] },
    suggestedReplies: ['Find a specialist', 'Find a hospital', 'What should I do next?'],
    data: {
      diseaseName,
      overview:
        'This is a general navigational overview, not clinical advice. Regular monitoring, prescribed medication adherence, and follow-ups with the right specialist support long-term management.',
      relevantSpecialties: specialties,
      careNavigation: [
        'Schedule a consultation with a relevant specialist.',
        'Keep a record of symptoms and readings to share during your visit.',
        'Ask about a personalized management plan and follow-up schedule.',
      ],
      recommendedNextAction: 'Connect with a specialist to build or review your management plan.',
    },
  };
}

function buildHospitalResponse(classification: IntentClassification): AgentResponse {
  const specialty = pickFirstSpecialty(classification.entities);
  const hospitals = specialty ? findHospitalBySpecialty(specialty) : agentHospitalRecommendations.slice(0, 3);
  return {
    kind: 'hospital',
    title: specialty ? `Hospitals for ${specialty}` : 'Hospitals near you',
    explanation: 'Hospitals from the CareLink network. Tap a card to view the full hospital profile.',
    meta: { confidence: 'high', urgency: 'routine', disclaimer: 'Availability is indicative — confirm directly with the hospital.' },
    suggestedReplies: ['Find a doctor', 'Get directions', 'Book an appointment'],
    data: hospitals.map((h) => ({ ...h, route: buildRouteFromHospital(h) })),
  };
}

function buildDoctorResponse(classification: IntentClassification): AgentResponse {
  const specialty = pickFirstSpecialty(classification.entities);
  const doctors = specialty ? findDoctorBySpecialty(specialty) : agentDoctorRecommendations.slice(0, 3);
  return {
    kind: 'doctor',
    title: specialty ? `${specialty} specialists` : 'Doctors for your needs',
    explanation: 'Verified specialists from the CareLink network. Tap a card to view the doctor profile.',
    meta: { confidence: 'high', urgency: 'routine', disclaimer: 'Slot availability is indicative — confirm during booking.' },
    suggestedReplies: ['Find a hospital', 'Book an appointment', 'What should I do next?'],
    data: doctors,
  };
}

function buildPharmacyResponse(): AgentResponse {
  return {
    kind: 'pharmacy',
    title: 'Pharmacies near you',
    explanation: 'Nearby pharmacies from the CareLink network.',
    meta: {
      confidence: 'medium',
      urgency: 'routine',
      disclaimer: 'Stock availability shown is a placeholder — confirm directly with the pharmacy before visiting.',
    },
    suggestedReplies: ['Find a hospital', 'Upload a prescription', 'Find a doctor'],
    data: agentPharmacyRecommendations,
  };
}

function buildLabResponse(): AgentResponse {
  return {
    kind: 'lab',
    title: 'Diagnostic & lab centers',
    explanation: 'Diagnostic and lab centers from the CareLink network. Home collection is indicated where available.',
    meta: { confidence: 'medium', urgency: 'routine', disclaimer: 'Test availability is indicative — confirm directly with the lab.' },
    suggestedReplies: ['Upload a lab report', 'Find a doctor', 'What should I do next?'],
    data: agentLabRecommendations,
  };
}

function buildMedicineResponse(classification: IntentClassification): AgentResponse {
  const text = classification.rawInput.toLowerCase();
  let key: keyof typeof agentMedicineResults | null = null;
  if (text.includes('metformin')) key = 'metformin';
  else if (text.includes('paracetamol') || text.includes('acetaminophen')) key = 'paracetamol';
  else if (text.includes('amoxicillin')) key = 'amoxicillin';

  const medicine = key ? agentMedicineResults[key] : agentMedicineResults.paracetamol;

  return {
    kind: 'medicine',
    title: `Medicine info — ${medicine.name}`,
    explanation: 'General medicine information for navigation only. This is not a prescription or dosage recommendation.',
    meta: {
      confidence: 'medium',
      urgency: 'routine',
      disclaimer:
        'Never change your dosage or stop a prescribed medicine without consulting your doctor. Confirm interactions with a pharmacist using your full medication list.',
    },
    suggestedReplies: ['Find a pharmacy', 'Upload a prescription', 'What should I do next?'],
    data: medicine,
  };
}

function buildAppointmentResponse(): AgentResponse {
  return {
    kind: 'appointment',
    title: 'Your appointments',
    explanation: 'Manage your upcoming and past appointments in one place.',
    meta: { confidence: 'high', urgency: 'routine' },
    suggestedReplies: ['Find a doctor', 'Book an appointment', 'Find a hospital'],
    data: {
      kind: 'view',
      label: 'View my appointments',
      description: 'Open your appointments dashboard to view, reschedule, or cancel upcoming visits.',
    },
  };
}

function buildRouteResponse(): AgentResponse {
  const hospital = agentHospitalRecommendations[0];
  return {
    kind: 'route',
    title: `Directions to ${hospital.name}`,
    explanation: 'Route summary with distance and estimated travel time. Connect a maps provider later for live navigation.',
    meta: { confidence: 'medium', urgency: 'routine', disclaimer: 'Travel time is an estimate and may vary with traffic.' },
    suggestedReplies: ['View hospital', 'Find a doctor', 'Book an appointment'],
    data: buildRouteFromHospital(hospital),
  };
}

function buildRecoveryResponse(): AgentResponse {
  return {
    kind: 'recovery',
    title: 'AI Recovery Tracker',
    explanation: 'A gentle daily check-in to track how you feel. This is self-reported wellness tracking, not clinical monitoring.',
    meta: {
      confidence: 'high',
      urgency: 'routine',
      disclaimer: 'Recovery tracking is self-reported and mock only. It does not replace clinical monitoring by your care team.',
    },
    suggestedReplies: ['😊 Better', '😐 Same', '😞 Worse', 'What should I do next?'],
    data: agentRecoverySeed,
  };
}

const REPORT_NORMAL: MedicalReportValue[] = [
  { label: 'Hemoglobin', value: '14.2 g/dL', range: '13.5–17.5', status: 'normal' },
  { label: 'WBC Count', value: '6.8 ×10³/μL', range: '4.0–11.0', status: 'normal' },
  { label: 'Platelet Count', value: '250 ×10³/μL', range: '150–400', status: 'normal' },
];

const REPORT_ATTENTION: MedicalReportValue[] = [
  { label: 'Fasting Blood Sugar', value: '132 mg/dL', range: '70–99', status: 'abnormal' },
  { label: 'HbA1c', value: '6.8%', range: '< 5.7%', status: 'attention' },
  { label: 'Total Cholesterol', value: '212 mg/dL', range: '< 200', status: 'attention' },
  { label: 'LDL Cholesterol', value: '138 mg/dL', range: '< 100', status: 'abnormal' },
];

function buildReportResponse(attachments: AgentAttachment[]): AgentResponse {
  const sourceFile = attachments.find((a) => a.kind === 'pdf' || a.kind === 'document')?.fileName;
  const report: MedicalReportResult = {
    id: 'report-mock-1',
    reportTitle: sourceFile ? `Lab report — ${sourceFile}` : 'Lab report summary',
    sourceFileName: sourceFile,
    summary:
      'Mock interpretation of your uploaded report. A few values sit outside the typical range and are worth discussing with your doctor.',
    importantObservations: [
      'Fasting blood sugar and HbA1c are higher than the typical range — relevant for diabetes management.',
      'Cholesterol panel shows borderline-elevated values worth reviewing.',
      'Hemoglobin, WBC, and platelets are within typical ranges.',
    ],
    valuesRequiringAttention: REPORT_ATTENTION,
    normalValues: REPORT_NORMAL,
    trendComparisonPlaceholder: 'Trend comparison will be available once multiple reports are tracked over time.',
    questionsToAskYourDoctor: [
      'What do my elevated blood sugar and HbA1c values indicate for me?',
      'Should I adjust my diet, activity, or medication?',
      'When should I retest, and what targets should I aim for?',
    ],
    recommendedNextAction: 'Share these results with your doctor or an endocrinologist to build a management plan.',
    isMockInterpretation: true,
  };

  return {
    kind: 'report',
    title: 'Medical report — mock analysis',
    explanation:
      'This is a clearly-labelled mock interpretation. No real medical interpretation has been performed yet. Always confirm with your doctor.',
    meta: {
      confidence: 'low',
      urgency: 'attention',
      disclaimer:
        'Mock interpretation only. CareLink.AI has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
    },
    suggestedReplies: ['Find an endocrinologist', 'What should I do next?', 'Find a hospital'],
    data: report,
  };
}

function buildEmergencyResponse(): AgentResponse {
  const facility = agentHospitalRecommendations[0];
  return {
    kind: 'emergency',
    title: 'This may need urgent attention',
    explanation:
      'Based on what you described, this could be serious. Please treat this as urgent and consider immediate professional care.',
    meta: { confidence: 'high', urgency: 'emergency', disclaimer: DISCLAIMER_EMERGENCY },
    suggestedReplies: ['Call emergency services', 'Find an emergency hospital', 'Get directions'],
    data: {
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
      disclaimer: DISCLAIMER_EMERGENCY,
    },
  };
}

function buildGeneralResponse(): AgentResponse {
  return {
    kind: 'text',
    title: 'Here to help you navigate care',
    explanation:
      'I can help you find hospitals, doctors, pharmacies, labs, explain reports, track medicines, and guide next steps. Try a quick action below or describe what you need.',
    meta: { confidence: 'low', urgency: 'routine', disclaimer: DISCLAIMER_MEDICAL },
    suggestedReplies: [
      'I have severe chest pain',
      'Find a cardiologist near me',
      'Explain this blood report',
      'Find hospitals for diabetes treatment',
    ],
  };
}

/* ----------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

const RESPONSE_BUILDERS: Record<
  AgentIntent,
  (classification: IntentClassification, attachments: AgentAttachment[]) => AgentResponse
> = {
  symptom: (c) => buildSymptomResponse(c),
  disease: (c) => buildDiseaseResponse(c),
  hospital: (c) => buildHospitalResponse(c),
  doctor: (c) => buildDoctorResponse(c),
  pharmacy: () => buildPharmacyResponse(),
  lab: () => buildLabResponse(),
  medicine: (c) => buildMedicineResponse(c),
  report: (_c, a) => buildReportResponse(a),
  appointment: () => buildAppointmentResponse(),
  emergency: () => buildEmergencyResponse(),
  route: () => buildRouteResponse(),
  recovery: () => buildRecoveryResponse(),
  general: () => buildGeneralResponse(),
};

export function buildResponseForIntent(
  classification: IntentClassification,
  attachments: AgentAttachment[]
): AgentResponse {
  const builder = RESPONSE_BUILDERS[classification.intent] ?? RESPONSE_BUILDERS.general;
  return builder(classification, attachments);
}

/** Quick actions map to a ready-made classification + response. */
export function buildResponseForQuickAction(actionId: string): AgentResponse {
  switch (actionId) {
    case 'find-hospital':
      return buildHospitalResponse({ intent: 'hospital', confidence: 'high', entities: [], rawInput: 'find hospital' });
    case 'find-doctor':
      return buildDoctorResponse({ intent: 'doctor', confidence: 'high', entities: [], rawInput: 'find doctor' });
    case 'find-pharmacy':
      return buildPharmacyResponse();
    case 'find-lab':
      return buildLabResponse();
    case 'upload-report':
      return {
        kind: 'text',
        title: 'Upload a medical report',
        explanation:
          'Upload a PDF, DOC, DOCX, or an image of your report. CareLink will run a mock analysis pipeline and present a clearly-labelled demo interpretation.',
        meta: { confidence: 'high', urgency: 'routine', disclaimer: 'Mock analysis only — no real medical interpretation yet.' },
        suggestedReplies: ['Find a doctor', 'Explain this blood report'],
      };
    case 'upload-prescription':
      return {
        kind: 'text',
        title: 'Upload a prescription',
        explanation:
          'Upload a prescription image or document. CareLink can help discover nearby pharmacies and track medicines safely.',
        meta: { confidence: 'high', urgency: 'routine', disclaimer: 'Mock analysis only. Never alter a prescription without your doctor.' },
        suggestedReplies: ['Find a pharmacy', 'Medicine info'],
      };
    case 'check-symptoms':
      return buildSymptomResponse({ intent: 'symptom', confidence: 'medium', entities: [], rawInput: 'check symptoms' });
    case 'my-appointments':
      return buildAppointmentResponse();
    case 'my-medicines':
      return buildMedicineResponse({ intent: 'medicine', confidence: 'medium', entities: ['paracetamol'], rawInput: 'paracetamol' });
    case 'recovery-tracker':
      return buildRecoveryResponse();
    default:
      return buildGeneralResponse();
  }
}

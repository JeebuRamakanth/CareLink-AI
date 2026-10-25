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
} from './agentTypes';
import {
  agentMedicineResults,
  agentRecoverySeed,
} from './mockData';
import {
  buildDirectoryRoute,
  findDirectoryDoctorsBySpecialty,
  findDirectoryHospitalsBySpecialty,
  getDirectoryDoctors,
  getDirectoryHospitals,
  getDirectoryLabs,
  getDirectoryPharmacies,
} from './directoryBridge';
import { emergencyContacts } from '../../features/documents/services/clinical/emergencyConfig';

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
  const matched = specialty ? findDirectoryHospitalsBySpecialty(specialty) : [];
  // Never substitute unrelated records: an unmatched specialty shows the
  // honest "no records" state rather than a fabricated fallback.
  const hospitals = matched.length > 0 ? matched : specialty ? [] : getDirectoryHospitals().slice(0, 4);
  return {
    kind: 'hospital',
    title: specialty ? `Hospitals for ${specialty}` : 'Hospitals in the CareLink directory',
    explanation:
      hospitals.length > 0
        ? 'Hospitals from the CareLink directory. Tap a card to view the full hospital profile.'
        : 'No directory hospitals match that search yet.',
    meta: { confidence: hospitals.length > 0 ? 'high' : 'low', urgency: 'routine', disclaimer: 'Availability is unlisted unless the provider publishes it — confirm directly with the hospital.' },
    suggestedReplies: ['Find a doctor', 'Get directions', 'Book an appointment'],
    data: hospitals.map((h) => ({ ...h, route: h.route ?? buildDirectoryRoute(h) })),
  };
}

function buildDoctorResponse(classification: IntentClassification): AgentResponse {
  const specialty = pickFirstSpecialty(classification.entities);
  const matched = specialty ? findDirectoryDoctorsBySpecialty(specialty) : [];
  const doctors = matched.length > 0 ? matched : specialty ? [] : getDirectoryDoctors().slice(0, 4);
  return {
    kind: 'doctor',
    title: specialty ? `${specialty} specialists` : 'Doctors in the CareLink directory',
    explanation:
      doctors.length > 0
        ? 'Doctors from the CareLink directory. Tap a card to view the doctor profile.'
        : 'No directory doctors match that search yet.',
    meta: { confidence: doctors.length > 0 ? 'high' : 'low', urgency: 'routine', disclaimer: 'Availability is unlisted — confirm during booking.' },
    suggestedReplies: ['Find a hospital', 'Book an appointment', 'What should I do next?'],
    data: doctors,
  };
}

function buildPharmacyResponse(): AgentResponse {
  // REAL sourced corridor pharmacy directory. The cache is primed by AgentContext
  // before every message; an unprimed cache yields an EMPTY list (honest loading
  // state), never the legacy fabricated US demo pharmacies.
  const pharmacies = getDirectoryPharmacies();
  return {
    kind: 'pharmacy',
    title: 'Pharmacies near you',
    explanation: pharmacies.length > 0
      ? 'Pharmacies from the sourced corridor directory. Medicine stock is not connected — confirm availability with the pharmacy.'
      : 'The sourced pharmacy directory is still loading. Try again in a moment.',
    meta: {
      confidence: pharmacies.length > 0 ? 'medium' : 'low',
      urgency: 'routine',
      disclaimer: 'Medicine stock is not connected — confirm availability directly with the pharmacy before visiting.',
    },
    suggestedReplies: ['Find a hospital', 'Upload a prescription', 'Find a doctor'],
    data: pharmacies,
  };
}

function buildLabResponse(): AgentResponse {
  const labs = getDirectoryLabs();
  return {
    kind: 'lab',
    title: 'Diagnostic & lab centers',
    explanation: labs.length > 0
      ? 'Laboratories from the sourced corridor directory. Test menus and home collection are shown only when the source published them.'
      : 'The sourced laboratory directory is still loading. Try again in a moment.',
    meta: {
      confidence: labs.length > 0 ? 'medium' : 'low',
      urgency: 'routine',
      disclaimer: 'Test availability is not published for every facility — confirm directly with the lab.',
    },
    suggestedReplies: ['Upload a lab report', 'Find a doctor', 'What should I do next?'],
    data: labs,
  };
}

function buildMedicineResponse(classification: IntentClassification): AgentResponse {
  const text = classification.rawInput.toLowerCase();
  let key: keyof typeof agentMedicineResults | null = null;
  if (text.includes('metformin')) key = 'metformin';
  else if (text.includes('paracetamol') || text.includes('acetaminophen')) key = 'paracetamol';
  else if (text.includes('amoxicillin')) key = 'amoxicillin';

  // NEVER substitute a medicine the user did not name. Without a recognised name
  // there is nothing to show — say so and route to verification.
  if (!key) {
    return {
      kind: 'text',
      title: 'Medicine not confidently identified',
      explanation:
        'No specific medicine was recognised in your message. Type the exact name and strength printed on the pack, or attach a photo of the packaging so it can be read. This is not a confirmed identification.',
      meta: {
        confidence: 'low',
        urgency: 'routine',
        disclaimer:
          'Verify the medicine name and strength with a pharmacist before use. Never change a prescribed medicine without your doctor.',
      },
      suggestedReplies: ['Find a pharmacy', 'Upload a prescription', 'What should I do next?'],
    };
  }

  const medicine = agentMedicineResults[key];

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
  const hospital = getDirectoryHospitals()[0];
  if (!hospital) {
    return {
      kind: 'text',
      title: 'No facility available to route to',
      explanation: 'The CareLink directory has no facility records loaded, so a route cannot be built.',
      meta: { confidence: 'low', urgency: 'routine' },
      suggestedReplies: ['Find a hospital', 'Find a doctor'],
    };
  }
  return {
    kind: 'route',
    title: `Directions to ${hospital.name}`,
    explanation: 'Route summary. Connect a maps provider for live distance and travel time.',
    meta: { confidence: 'medium', urgency: 'routine', disclaimer: 'Travel time is an estimate and may vary with traffic.' },
    suggestedReplies: ['View hospital', 'Find a doctor', 'Book an appointment'],
    data: hospital.route ?? buildDirectoryRoute(hospital)!,
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

function buildReportResponse(attachments: AgentAttachment[]): AgentResponse {
  const attached = attachments.length > 0;

  // This legacy surface has NO real extraction pipeline: it must never present
  // hardcoded lab values as the user's report. It points the user at the secure
  // analysis (which does read the file) instead of inventing an interpretation.
  return {
    kind: 'text',
    title: attached ? 'Report attached — run the secure analysis' : 'Medical report analysis',
    explanation: attached
      ? 'A document was attached. Open "Secure document analysis" below (or the Documents page) to read the actual values from your file. This command center does not fabricate a report interpretation.'
      : 'Attach your lab or blood report in the composer, or open the Documents page, to have the real values read from your file. CareLink will not invent report values.',
    meta: {
      confidence: 'low',
      urgency: 'routine',
      disclaimer:
        'No report interpretation is produced here. Real analysis reads your uploaded document; confirm all findings with a licensed professional.',
    },
    suggestedReplies: ['Find a doctor', 'What should I do next?', 'Find a hospital'],
  };
}

function buildEmergencyResponse(): AgentResponse {
  // Prefer the real directory's emergency-capable facilities; never a fabricated
  // demo hospital. When none exist, the emergency payload still escalates with
  // contacts and no invented facility.
  const emergencyFacilities = getDirectoryHospitals().filter((h) => h.hasEmergency).slice(0, 3);
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
      nearbyFacilities: emergencyFacilities.map((facility) => ({
        id: facility.id,
        detailSlug: facility.detailSlug,
        name: facility.name,
        distanceKm: facility.distanceKm,
        estimatedTravelTimeMin: facility.estimatedTravelTimeMin,
        address: `${facility.address}, ${facility.city}`,
        route: facility.route ?? buildDirectoryRoute(facility),
      })),
      contacts: emergencyContacts().map((c) => ({ label: c.label, phone: c.phone, href: c.href })),
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
      // "My Medicines" is a navigation action, not a drug lookup. It must NOT
      // resolve to a specific medicine the user never mentioned — that would be
      // an invented identity. Point to the real prescription/medicine analysis.
      return {
        kind: 'text',
        title: 'Your medicines',
        explanation:
          'Attach a prescription or a photo of your medicine packaging in the composer — the secure analysis reads the printed names and strengths. Type a specific medicine name to look it up. CareLink does not invent a medicine you did not mention.',
        meta: {
          confidence: 'high',
          urgency: 'routine',
          disclaimer: 'Confirm every medicine and dose with your doctor or pharmacist.',
        },
        suggestedReplies: ['Upload a prescription', 'Find a pharmacy', 'What should I do next?'],
      };
    case 'recovery-tracker':
      return buildRecoveryResponse();
    default:
      return buildGeneralResponse();
  }
}

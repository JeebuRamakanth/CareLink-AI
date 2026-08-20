/**
 * Mock AI responder (Step 13 §26).
 *
 * Produces a schema-valid AIChatResponse WITHOUT any real AI backend so the
 * full structured pipeline (validation → safety layer → orchestrator merge)
 * is exercised end-to-end in demo mode. Every payload is truth-tagged
 * `mode: 'mock'` and the UI labels it "CareLink demo response".
 *
 * It reuses the deterministic heuristic classifier so intent behaviour stays
 * identical between the classic path and the structured path.
 */

import type { AgentIntent, SafetyLevel } from '../../types';
import type { AIChatResponse } from './aiTypes';
import type { AIEngineInput } from './aiEngine';
import { mockAIProvider } from '../adapters/mockAdapters';
import { inputSafetyFloor } from './safetyLayer';

const safetyForIntent = (intent: AgentIntent, input: string): SafetyLevel => {
  const floor = inputSafetyFloor(input);
  if (floor) return floor;
  switch (intent) {
    case 'emergency':
      return 'emergency';
    case 'symptom':
    case 'mental-health':
      return 'possible-concern';
    case 'report':
    case 'medicine':
      return 'professional-care';
    default:
      return 'educational';
  }
};

const urgencyFor = (level: SafetyLevel): AIChatResponse['urgency'] => {
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

interface IntentCopy {
  summary: string;
  explanation: string;
  nextActions: string[];
  followUps: string[];
}

const COPY: Record<AgentIntent, IntentCopy> = {
  symptom: {
    summary: 'Understanding your symptoms',
    explanation:
      'I heard what you described. I can’t diagnose it, but I can help you understand what it might mean and find the right care. Symptoms like these can have many causes — a clinician can evaluate them properly.',
    nextActions: ['Note when the symptoms started and how severe they are.', 'Consult a relevant specialist if they persist or worsen.'],
    followUps: ['When did the symptoms start?', 'How severe are they on a scale of 1–10?', 'Any known triggers?'],
  },
  disease: {
    summary: 'Care navigation for this condition',
    explanation:
      'Here is a safe overview to help you navigate care for this condition. This is educational information, not a diagnosis — always confirm specifics with your doctor.',
    nextActions: ['Connect with a specialist to build or review your management plan.'],
    followUps: ['Are you currently on any treatment?', 'When was your last check-up?'],
  },
  hospital: {
    summary: 'Hospitals matched to your need',
    explanation: 'These hospitals are ranked using your context, distance and ratings. Pick one to see relevant doctors, directions and booking options.',
    nextActions: ['Open a hospital card to see relevant doctors and directions.'],
    followUps: ['Which hospital should I go to?', 'Show me relevant doctors there'],
  },
  doctor: {
    summary: 'Doctors matched to your need',
    explanation: 'These specialists match your context. You can view a profile, check availability and book an appointment.',
    nextActions: ['Open a doctor profile to check availability and book.'],
    followUps: ['Which doctor should I see?', 'Book an appointment'],
  },
  pharmacy: {
    summary: 'Pharmacies near you',
    explanation: 'These pharmacies are ranked by distance and availability placeholders. Confirm stock by phone before you travel.',
    nextActions: ['Call the pharmacy to confirm stock before travelling.'],
    followUps: ['Nearest pharmacy for this medicine'],
  },
  medicine: {
    summary: 'About this medicine',
    explanation:
      'Here is educational information about this medicine. Never start, stop or change a dose based on this — your doctor and pharmacist are the right source for that.',
    nextActions: ['Verify the name and strength on the label or with a pharmacist.'],
    followUps: ['Find a pharmacy for this medicine', 'What is this medicine for?'],
  },
  lab: {
    summary: 'Labs and diagnostics near you',
    explanation: 'These labs offer relevant tests, ranked by distance and services. Some offer home collection.',
    nextActions: ['Pick a lab and book a test slot.'],
    followUps: ['Book a blood test near me'],
  },
  report: {
    summary: 'Understanding your report',
    explanation:
      'I can help explain report values in plain language. Values I show as extracted come from your document; my explanation is educational and not a diagnosis.',
    nextActions: ['Discuss out-of-range values with a qualified clinician.'],
    followUps: ['What does this value mean?', 'Which doctor should I consult?'],
  },
  appointment: {
    summary: 'Your appointments',
    explanation: 'You can view, book, reschedule or cancel appointments from the appointments page.',
    nextActions: ['Open appointments to manage your bookings.'],
    followUps: ['Book a doctor near me'],
  },
  emergency: {
    summary: 'This may need urgent attention',
    explanation:
      'Based on what you described, this could be serious. Please treat it as urgent and seek immediate professional care.',
    nextActions: ['Call your local emergency number now if this is life-threatening.'],
    followUps: [],
  },
  route: {
    summary: 'Directions and travel',
    explanation: 'I can open directions to the facility you choose. Travel time is an estimate and may vary with traffic.',
    nextActions: ['Pick a facility and open directions.'],
    followUps: ['Get directions to the nearest hospital'],
  },
  recovery: {
    summary: 'Recovery check-in',
    explanation: 'How are you feeling today? Your check-ins help track recovery trends over time.',
    nextActions: ['Log how you feel: better, same, or worse.'],
    followUps: ['How am I doing this week?'],
  },
  vaccination: {
    summary: 'Vaccination guidance',
    explanation: 'Here are the upcoming vaccination reminders. Confirm schedules with your clinician.',
    nextActions: ['Review the vaccination schedule with your clinician.'],
    followUps: ['Which vaccines are due next?'],
  },
  'child-care': {
    summary: 'Child care navigation',
    explanation: 'For a child profile I prioritize pediatric context — pediatricians, child-friendly facilities and vaccination reminders.',
    nextActions: ['Look for a pediatrician or child-care facility.'],
    followUps: ['Find a pediatrician near me'],
  },
  'elder-care': {
    summary: 'Elder care navigation',
    explanation: 'For an elder profile I keep guidance simple and prioritize nearby, accessible care options.',
    nextActions: ['Prefer nearby facilities and confirm accessibility.'],
    followUps: ['Find a geriatric specialist'],
  },
  'mental-health': {
    summary: 'Mental health support navigation',
    explanation:
      'Reaching out is a strong step. I can help you find mental-health professionals. If you ever feel at risk of harming yourself, contact emergency services immediately.',
    nextActions: ['Consider speaking with a mental-health professional.'],
    followUps: ['Find a therapist near me'],
  },
  family: {
    summary: 'Family profiles',
    explanation: 'You can switch between family profiles so guidance and documents stay scoped to the right person.',
    nextActions: ['Pick the profile you want to ask about.'],
    followUps: ['Switch to my child’s profile'],
  },
  location: {
    summary: 'Care near you',
    explanation: 'I use your location only to rank nearby care. Share a location for distance-aware results.',
    nextActions: ['Share your location for distance-aware ranking.'],
    followUps: ['Hospitals near me', 'Pharmacies near me'],
  },
  general: {
    summary: 'Here to help you navigate care',
    explanation:
      'I can help you find hospitals, doctors, pharmacies and labs, explain reports, identify medicines, and guide next steps. Describe a symptom or try a quick action.',
    nextActions: ['Describe a symptom, upload a report, or ask for nearby care.'],
    followUps: ['Find a hospital near me', 'Explain my blood report'],
  },
};

const LANGUAGE_PREFIX: Record<string, string> = {
  te: 'Meeru telugulo adigaru — I’ll keep it simple. ',
  hi: 'Aapne Hinglish mein poocha — I’ll keep it simple. ',
};

/**
 * Build a demo AIChatResponse for one turn. `reason` records why the real
 * gateway was not used (unconfigured/rate-limited/malformed…).
 *
 * Intent comes from the orchestrator's own classifier (input.classification)
 * so the structured path and the classic path never disagree; the keyword
 * fallback below only fires when no classification was provided.
 */
export function mockAIRespond(input: AIEngineInput, reason?: string): AIChatResponse {
  void reason;

  let intent: AgentIntent;
  if (input.classification) {
    intent = input.classification.intent;
  } else {
    const text = input.text.toLowerCase();
    intent = 'general';
    const floor = inputSafetyFloor(input.text);
    if (floor === 'emergency') intent = 'emergency';
    else if (/report|pdf|document|blood report|lab report/.test(text)) intent = 'report';
    else if (/appointment|book|reschedule/.test(text)) intent = 'appointment';
    else if (/pharmacy|chemist|drug store/.test(text)) intent = 'pharmacy';
    else if (/\blab|blood test|scan|mri|x-ray|diagnostic/.test(text)) intent = 'lab';
    else if (/tablet|pill|medicine|capsule|syrup|metformin|paracetamol|amoxicillin|enti/.test(text)) intent = 'medicine';
    else if (/doctor|specialist|cardiologist|pediatrician|dermatologist/.test(text)) intent = 'doctor';
    else if (/hospital|clinic|medical center|kavali/.test(text)) intent = 'hospital';
    else if (/diabetes|asthma|hypertension|migraine|thyroid|arthritis/.test(text)) intent = 'disease';
    else if (/fever|cough|headache|pain|nausea|dizzy|vomit|undi|dard/.test(text)) intent = 'symptom';
    else if (/near me|nearby|closest|around me/.test(text)) intent = 'location';
  }

  const copy = COPY[intent];
  const safetyLevel = safetyForIntent(intent, input.text);
  const langPrefix = LANGUAGE_PREFIX[input.language] ?? '';

  return {
    summary: copy.summary,
    intent,
    confidence: intent === 'general' ? 'low' : 'medium',
    urgency: urgencyFor(safetyLevel),
    safetyLevel,
    explanation: `${langPrefix}${copy.explanation}`,
    nextActions: copy.nextActions,
    followUpQuestions: copy.followUps,
    warnings: [],
    entities: input.classification?.entities ?? [],
    language: input.language,
    source: { provider: 'CareLink demo intelligence', mode: 'mock', fetchedAt: new Date().toISOString() },
  };
}

export { mockAIProvider };

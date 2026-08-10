/**
 * CareLink-AI Agent — mock intent router (Step 17).
 *
 * Classifies free-form healthcare-navigation text into a demo intent. This is a
 * keyword/pattern heuristic for UI demonstration only — NOT a clinical model.
 *
 * Safety: emergency keywords short-circuit to the `emergency` intent so the UI can
 * escalate to safe call-to-action rendering instead of burying guidance in chat.
 */

import type { AgentIntent, ConfidenceLevel, IntentClassification } from './agentTypes';

const EMERGENCY_PATTERNS = [
  'severe chest pain',
  'chest pain',
  'can\'t breathe',
  'cannot breathe',
  'difficulty breathing',
  'stroke',
  'unconscious',
  'not breathing',
  'severe bleeding',
  'heavy bleeding',
  'suicidal',
  'suicide',
  'overdose',
  'severe allergic',
  'anaphylaxis',
  'seizure',
  'fitting',
  'heart attack',
  'cardiac arrest',
  'choking',
  'severe burn',
  'lost consciousness',
  'fainted',
  'fainting',
  'passed out',
  'severe head injury',
  'emergency',
];

const INTENT_PATTERNS: Record<Exclude<AgentIntent, 'general' | 'emergency'>, string[]> = {
  symptom: [
    'symptom',
    'symptoms',
    'fever',
    'cough',
    'headache',
    'pain',
    'nausea',
    'dizzy',
    'dizziness',
    'fatigue',
    'tired',
    'sore throat',
    'rash',
    'vomiting',
    'diarrhea',
  ],
  disease: ['disease', 'condition', 'diabetes', 'asthma', 'hypertension', 'migraine', 'arthritis', 'thyroid', 'covid'],
  hospital: ['hospital', 'hospitals', 'medical center', 'emergency room', 'er near', 'clinic near'],
  doctor: ['doctor', 'doctors', 'specialist', 'physician', 'cardiologist', 'neurologist', 'pediatrician', 'dermatologist', 'orthopedic'],
  pharmacy: ['pharmacy', 'pharmacies', 'medicine near', 'chemist', 'drug store', 'where can i get this medicine', 'where can i buy'],
  lab: ['lab', 'laboratory', 'diagnostic', 'diagnostics', 'blood test', 'blood report', 'scan', 'mri', 'ct scan', 'ultrasound', 'x-ray', 'imaging'],
  medicine: ['medicine', 'medicines', 'tablet', 'tablets', 'pill', 'pills', 'drug', 'prescription', 'metformin', 'paracetamol', 'amoxicillin', 'capsule', 'syrup'],
  report: ['report', 'reports', 'explain this', 'explain my', 'blood report', 'lab report', 'upload report', 'analyze report', 'medical report', 'pdf', 'document'],
  appointment: ['appointment', 'appointments', 'book a doctor', 'book doctor', 'reschedule', 'cancel appointment', 'see my appointments', 'my appointments', 'book appointment'],
  route: ['directions', 'route to', 'how do i get', 'how to reach', 'distance', 'travel time', 'get directions'],
  recovery: ['recovery', 'recovering', 'how am i doing', 'recovery tracker', 'feeling better', 'feeling worse', 'same as'],
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

const hasAny = (text: string, patterns: string[]): boolean =>
  patterns.some((pattern) => text.includes(pattern));

const extractEntities = (text: string): string[] => {
  const entities: string[] = [];
  for (const hint of SPECIALTY_HINTS) {
    if (hasAny(text, hint.keywords) && !entities.includes(hint.specialty)) {
      entities.push(hint.specialty);
    }
  }
  // capture explicit medicine names
  const medicines = ['metformin', 'paracetamol', 'amoxicillin', 'aspirin', 'insulin'];
  for (const med of medicines) {
    if (text.includes(med) && !entities.includes(med)) {
      entities.push(med);
    }
  }
  return entities;
};

export function classifyIntent(rawInput: string): IntentClassification {
  const text = normalize(rawInput);

  if (!text) {
    return { intent: 'general', confidence: 'low', entities: [], rawInput };
  }

  // Emergency takes priority — always escalate over everything else.
  if (hasAny(text, EMERGENCY_PATTERNS)) {
    return {
      intent: 'emergency',
      confidence: 'high',
      entities: extractEntities(text),
      rawInput,
    };
  }

  // Order matters: more specific intents first.
  const orderedIntents: Exclude<AgentIntent, 'general' | 'emergency'>[] = [
    'report',
    'appointment',
    'route',
    'pharmacy',
    'lab',
    'medicine',
    'doctor',
    'hospital',
    'disease',
    'symptom',
  ];

  for (const intent of orderedIntents) {
    if (hasAny(text, INTENT_PATTERNS[intent])) {
      const confidence: ConfidenceLevel = 'medium';
      return { intent, confidence, entities: extractEntities(text), rawInput };
    }
  }

  // Fallback: presence of a specialty hint alone implies symptom navigation.
  const entities = extractEntities(text);
  if (entities.length > 0) {
    return { intent: 'symptom', confidence: 'medium', entities, rawInput };
  }

  return { intent: 'general', confidence: 'low', entities: [], rawInput };
}

/** Language hint — minimal heuristic for the demo multilingual toggle. */
export function detectLanguageHint(rawInput: string): 'en' | 'te' | 'hi' | null {
  const text = normalize(rawInput);
  // Telugu script range
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  // Devanagari script range (Hindi / Hinglish native chars)
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  // Crude Hinglish keyword sniff
  const hinglish = ['kya', 'kaise', 'mera', 'meri', 'muje', 'mujhe', 'hai', 'ho raha', 'dard', 'bimari', 'ilaaj'];
  if (hinglish.some((w) => text.includes(w))) return 'hi';
  return null;
}

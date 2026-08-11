/**
 * ContextManager — conversation memory for the Health Agent.
 *
 * Extracts navigational context (conditions, specialties, medicines, intents)
 * from each turn and carries it forward so the agent can resolve references
 * like "Hospital kavali" after "Naaku diabetes undi" without repetition.
 *
 * SAFETY: this is *navigational* context only. It never stores a diagnosis or
 * a prescription decision — only tags that help route the next query toward
 * the right specialty / facility / clinician. Severity/emergency is never
 * "remembered away"; each emergency-pattern input is re-evaluated fresh.
 *
 * Pure functions, no React, no I/O — fully testable and UI-agnostic.
 */

import type {
  AgentIntent,
  AgentMessage,
  ConversationContext,
} from '../types';

const CONDITION_SYNONYMS: Record<string, string> = {
  diabetes: 'Diabetes',
  diabetic: 'Diabetes',
  sugar: 'Diabetes',
  glucose: 'Diabetes',
  hypertension: 'Hypertension',
  'high bp': 'Hypertension',
  'blood pressure': 'Hypertension',
  asthma: 'Asthma',
  migraine: 'Migraine',
  arthritis: 'Arthritis',
  thyroid: 'Thyroid',
  covid: 'COVID-19',
  cholesterol: 'High Cholesterol',
};

const SPECIALTY_KEYWORDS: { keywords: string[]; specialty: string }[] = [
  { keywords: ['heart', 'chest', 'cardiac', 'cardio'], specialty: 'Cardiology' },
  { keywords: ['brain', 'stroke', 'neuro', 'seizure'], specialty: 'Neurology' },
  { keywords: ['child', 'kid', 'baby', 'pediatric', 'newborn'], specialty: 'Pediatrics' },
  { keywords: ['bone', 'joint', 'knee', 'spine', 'orthopedic'], specialty: 'Orthopedics' },
  { keywords: ['skin', 'dermat', 'rash'], specialty: 'Dermatology' },
  { keywords: ['mental', 'anxiety', 'depress', 'stress', 'panic'], specialty: 'Mental Health' },
  { keywords: ['eye', 'vision', 'ophthalm'], specialty: 'Ophthalmology' },
  { keywords: ['diabetes', 'sugar', 'glucose', 'insulin'], specialty: 'Endocrinology' },
  { keywords: ['stomach', 'liver', 'kidney', 'gut', 'gastro'], specialty: 'Gastroenterology' },
];

const MEDICINE_NAMES = ['metformin', 'paracetamol', 'acetaminophen', 'amoxicillin', 'aspirin', 'insulin'];

const HINGLISH_KEYWORDS = ['kya', 'kaise', 'mera', 'meri', 'muje', 'mujhe', 'hai', 'dard', 'bimari', 'ilaaj', 'kavali', 'chahiye', 'batao'];

const normalize = (input: string): string => input.toLowerCase().trim();
const dedupe = <T,>(arr: T[]): T[] => Array.from(new Set(arr));

const extractConditions = (text: string): string[] => {
  const t = normalize(text);
  const found: string[] = [];
  for (const [key, label] of Object.entries(CONDITION_SYNONYMS)) {
    if (t.includes(key) && !found.includes(label)) found.push(label);
  }
  return found;
};

const extractSpecialties = (text: string): string[] => {
  const t = normalize(text);
  const found: string[] = [];
  for (const hint of SPECIALTY_KEYWORDS) {
    if (hint.keywords.some((k) => t.includes(k)) && !found.includes(hint.specialty)) {
      found.push(hint.specialty);
    }
  }
  return found;
};

const extractMedicines = (text: string): string[] => {
  const t = normalize(text);
  return MEDICINE_NAMES.filter((m) => t.includes(m));
};

export const detectLanguage = (input: string): 'en' | 'te' | 'hi' | undefined => {
  const t = normalize(input);
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (HINGLISH_KEYWORDS.some((w) => t.includes(w))) {
    // Telugu-English mix leans Telugu (naaku/undi), else Hinglish.
    return t.includes('naaku') || t.includes('undi') || t.includes('kavali') ? 'te' : 'hi';
  }
  return undefined;
};

export const emptyContext = (): ConversationContext => ({
  conditions: [],
  specialties: [],
  medicines: [],
  recentIntents: [],
  summary: '',
  hasContext: false,
});

/**
 * Fold a new turn into the running context. Idempotent for repeated tags and
 * caps recent intents so memory stays bounded.
 */
export function accumulateContext(
  prev: ConversationContext,
  message: AgentMessage,
  intent: AgentIntent
): ConversationContext {
  if (message.role !== 'user' || !message.content) return prev;

  const conditions = dedupe([...prev.conditions, ...extractConditions(message.content)]);
  const specialties = dedupe([...prev.specialties, ...extractSpecialties(message.content)]);
  const medicines = dedupe([...prev.medicines, ...extractMedicines(message.content)]);
  const recentIntents = dedupe([intent, ...prev.recentIntents]).slice(0, 5);

  const summary = buildSummary(conditions, specialties, medicines);
  const hasContext = conditions.length > 0 || specialties.length > 0;

  return { conditions, specialties, medicines, recentIntents, summary, hasContext };
}

function buildSummary(conditions: string[], specialties: string[], medicines: string[]): string {
  const parts: string[] = [];
  if (conditions.length) parts.push(conditions.join(' · '));
  if (specialties.length) parts.push(`${specialties.join('/')} focus`);
  if (medicines.length) parts.push(`meds: ${medicines.join(', ')}`);
  return parts.join(' — ');
}

/**
 * Resolve an ambiguous follow-up using carried context. E.g. when the user
 * says "hospital kavali" with no new specialty, inherit the prior specialty
 * (diabetes → Endocrinology) so recommendations stay relevant.
 */
export function resolveSpecialtyFromContext(
  currentEntities: string[],
  context: ConversationContext
): string | undefined {
  const explicit = currentEntities.find((e) => /^[A-Z]/.test(e));
  if (explicit) return explicit;
  if (context.specialties.length > 0) return context.specialties[0];
  // Map a carried condition to a specialty (diabetes → Endocrinology).
  const fromCondition = context.conditions
    .map((c) => SPECIALTY_KEYWORDS.find((s) => s.keywords.some((k) => c.toLowerCase().includes(k)))?.specialty)
    .filter((x): x is string => Boolean(x));
  return fromCondition[0];
}

/**
 * Build a focus topic compatible with the EXISTING hospital doctor-topic filter
 * (`'All' | 'Cardiology' | 'Diabetes' | 'Neurology' | 'Migraine' | 'Orthopedics'`)
 * so an AI hospital deep-link can pre-filter relevant doctors.
 */
export function hospitalFocusTopic(context: ConversationContext): string | undefined {
  const conditionMap: Record<string, string> = {
    Diabetes: 'Diabetes',
    Hypertension: 'Cardiology',
    Migraine: 'Migraine',
    Asthma: 'All',
    Arthritis: 'Orthopedics',
  };
  for (const c of context.conditions) {
    if (conditionMap[c]) return conditionMap[c];
  }
  const specialtyMap: Record<string, string> = {
    Cardiology: 'Cardiology',
    Neurology: 'Neurology',
    Orthopedics: 'Orthopedics',
    Endocrinology: 'Diabetes',
  };
  for (const s of context.specialties) {
    if (specialtyMap[s]) return specialtyMap[s];
  }
  return undefined;
}

/**
 * Whether the latest user turn looks like a short follow-up that should inherit
 * context (e.g. "hospital kavali", "doctor kavali", "book one").
 */
export function looksLikeContextualFollowUp(text: string): boolean {
  const t = normalize(text);
  if (t.split(/\s+/).length > 6) return false;
  const followupHints = ['kavali', 'chahiye', 'want', 'need', 'book one', 'book it', 'that hospital', 'that doctor', 'nearest', 'closest'];
  return followupHints.some((h) => t.includes(h));
}

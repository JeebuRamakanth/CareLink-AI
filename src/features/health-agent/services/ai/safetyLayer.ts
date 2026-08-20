/**
 * Medical safety layer (Step 13 §4, §19).
 *
 * Every AI-produced payload — real or mock — passes through this layer before
 * the orchestrator may use it. It enforces, deterministically:
 *
 * 1. NO DIAGNOSIS: overclaim patterns ("you have diabetes", "you are diagnosed
 *    with", "definitely", prescription/dosage instructions) are rejected and
 *    replaced with safe navigational phrasing + a warning.
 * 2. ESCALATION: emergency indicators in the USER input always win — the safety
 *    level can be escalated by this layer but never de-escalated by the AI.
 * 3. EXFILTRATION DEFENSE: output is scanned for leaked secrets, system-prompt
 *    echoes and instruction-override markers; hits are stripped and flagged.
 *
 * Pure functions — no I/O, fully testable.
 */

import type { SafetyLevel, UrgencyLevel } from '../../types';
import type { AIChatResponse } from './aiTypes';

/* ----------------------------------------------------------------------------
 * Unsafe-medical-certainty patterns (case-insensitive)
 * ------------------------------------------------------------------------- */

const DIAGNOSTIC_OVERCLAIM = [
  /\byou (definitely|certainly|surely) have\b/i,
  /\byou are diagnosed with\b/i,
  /\byou have been diagnosed\b/i,
  /\bthis confirms (you have|that you have)\b/i,
  /\byou are suffering from\b/i,
  /\bi diagnose (you|this) (as|with)\b/i,
  /\byou (must|should) take \d+\s?(mg|ml|tablets?|pills?)\b/i,
  /\b(increase|decrease|stop|double) (your )?(dose|dosage)\b/i,
  /\bprescri(be|bed|bing) (you )?\w+/i,
  /\bguaranteed (cure|recovery|outcome)\b/i,
];

const SAFE_REPLACEMENT =
  'I can’t confirm a diagnosis. What you described may have several possible explanations — a qualified clinician can evaluate it properly.';

/* ----------------------------------------------------------------------------
 * Emergency escalation patterns (user input side, independent of the AI)
 * ------------------------------------------------------------------------- */

const EMERGENCY_INPUT = [
  'severe chest pain', 'chest pain', "can't breathe", 'cant breathe', 'cannot breathe',
  'difficulty breathing', 'breathing problem', 'stroke', 'face drooping', 'slurred speech',
  'unconscious', 'not breathing', 'severe bleeding', 'heavy bleeding', 'suicidal',
  'suicide', 'overdose', 'severe allergic', 'anaphylaxis', 'seizure', 'heart attack',
  'cardiac arrest', 'choking', 'severe burn', 'lost consciousness', 'fainted',
  'fainting', 'passed out', 'severe head injury',
];

const URGENT_INPUT = [
  'high fever', 'blood in', 'severe pain', 'worst headache', 'dehydrated',
  'cannot walk', "can't walk", 'blurred vision', 'coughing blood',
];

/** Deterministic floor for the safety level given the raw user input. */
export function inputSafetyFloor(input: string): SafetyLevel | null {
  const t = input.toLowerCase();
  if (EMERGENCY_INPUT.some((p) => t.includes(p))) return 'emergency';
  if (URGENT_INPUT.some((p) => t.includes(p))) return 'urgent';
  return null;
}

const LEVEL_RANK: Record<SafetyLevel, number> = {
  educational: 0,
  'possible-concern': 1,
  'professional-care': 2,
  urgent: 3,
  emergency: 4,
};

/** Escalate-only merge: the higher of the AI-claimed level and the input floor. */
export function mergeSafetyLevel(aiLevel: SafetyLevel, floor: SafetyLevel | null): SafetyLevel {
  if (!floor) return aiLevel;
  return LEVEL_RANK[floor] > LEVEL_RANK[aiLevel] ? floor : aiLevel;
}

export function urgencyForSafetyLevel(level: SafetyLevel): UrgencyLevel {
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
}

/* ----------------------------------------------------------------------------
 * Exfiltration / leak defense (§19)
 * ------------------------------------------------------------------------- */

const LEAK_PATTERNS = [
  /service[_-]?role/i,
  /api[_-]?key\s*[:=]/i,
  /bearer\s+[a-z0-9._-]{12,}/i,
  /system prompt/i,
  /ignore (all |any )?(previous|prior) instructions/i,
  /reveal (all|the|your)/i,
  /sk-[a-z0-9]{16,}/i,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWT shape
];

export interface SanitizedText {
  text: string;
  leaked: boolean;
}

/** Strip leaked secrets / instruction-echoes from a single text field. */
export function sanitizeOutputText(text: string): SanitizedText {
  let leaked = false;
  let out = text;
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(out)) {
      leaked = true;
      out = out.replace(pattern, '[removed]');
    }
  }
  return { text: out, leaked };
}

/* ----------------------------------------------------------------------------
 * Full response enforcement
 * ------------------------------------------------------------------------- */

export interface SafeAIResponse {
  response: AIChatResponse;
  /** True when the safety layer had to intervene (overclaim or leak). */
  intervened: boolean;
}

/**
 * Enforce the medical safety contract on a schema-validated AI response.
 * - Any diagnostic/prescriptive overclaim in summary/explanation/nextActions
 *   is replaced with safe phrasing and recorded as a warning.
 * - Safety level is escalated (never lowered) from the raw user input.
 * - Leaked secrets/instruction echoes are stripped from every text field.
 */
export function enforceResponseSafety(response: AIChatResponse, userInput: string): SafeAIResponse {
  let intervened = false;
  const warnings = [...response.warnings];

  const scrubField = (value: string): string => {
    for (const pattern of DIAGNOSTIC_OVERCLAIM) {
      if (pattern.test(value)) {
        intervened = true;
        return SAFE_REPLACEMENT;
      }
    }
    const { text, leaked } = sanitizeOutputText(value);
    if (leaked) intervened = true;
    return text;
  };

  const summary = scrubField(response.summary);
  const explanation = scrubField(response.explanation);
  const nextActions = response.nextActions.map(scrubField);
  const followUpQuestions = response.followUpQuestions.map(scrubField);
  const scrubbedWarnings = warnings.map(scrubField);

  if (intervened) {
    scrubbedWarnings.push(
      'Some AI-generated content was adjusted by the CareLink safety layer to avoid unsafe medical certainty.'
    );
  }

  const floor = inputSafetyFloor(userInput);
  const safetyLevel = mergeSafetyLevel(response.safetyLevel, floor);
  const urgency = LEVEL_RANK[safetyLevel] >= LEVEL_RANK.urgent
    ? urgencyForSafetyLevel(safetyLevel)
    : response.urgency;

  return {
    response: {
      ...response,
      summary,
      explanation,
      nextActions,
      followUpQuestions,
      warnings: scrubbedWarnings,
      safetyLevel,
      urgency,
    },
    intervened,
  };
}

/**
 * CareLink-AI — deterministic clinical triage.
 *
 * Decides how urgent it is that a human looks at a document or a set of
 * reported symptoms. This is the DETERMINISTIC SAFETY FLOOR: it runs on the
 * parsed structure (not on generated prose), so an emergency is never missed
 * because a model was unavailable or verbose.
 *
 * URGENCY CATEGORIES (triage guidance, never a diagnosis):
 *   emergency            — seek immediate help
 *   urgent               — prompt medical assessment
 *   needs-follow-up      — clinician follow-up
 *   informational        — general information
 *
 * RULES:
 * - A laboratory value in a CRITICAL band escalates to `emergency` and is
 *   always accompanied by the exact extracted value and its unit.
 * - A lab-printed critical/panic flag escalates to `emergency`.
 * - Reported emergency symptoms escalate to `emergency` even when a report
 *   looks normal — a normal-looking report never overrides severe symptoms.
 * - Uncertainty is stated, and the engine errs TOWARD assessment: an
 *   unreadable critical-looking row produces `needs-follow-up`, not silence.
 * - The engine NEVER claims a call was placed or an ambulance dispatched.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import type { ParsedLabValue } from './labParser';

export type TriageLevel = 'emergency' | 'urgent' | 'needs-follow-up' | 'informational';

export const TRIAGE_LABEL: Record<TriageLevel, string> = {
  emergency: 'Emergency — seek immediate help',
  urgent: 'Urgent — prompt medical assessment',
  'needs-follow-up': 'Needs clinician follow-up',
  informational: 'General information',
};

const TRIAGE_RANK: Record<TriageLevel, number> = {
  informational: 0,
  'needs-follow-up': 1,
  urgent: 2,
  emergency: 3,
};

/** Escalate-only merge. */
export function maxTriage(a: TriageLevel, b: TriageLevel): TriageLevel {
  return TRIAGE_RANK[b] > TRIAGE_RANK[a] ? b : a;
}

export interface TriageTrigger {
  level: TriageLevel;
  /** Short label, e.g. "Critical potassium". */
  label: string;
  /** What exactly triggered it, with the extracted value when applicable. */
  detail: string;
  /** True when the trigger came from a confidently-extracted value. */
  confident: boolean;
  /** Where it came from. */
  source: 'lab-critical' | 'lab-flag' | 'lab-unreadable' | 'symptom' | 'medicine';
  /** 1-based page for a lab trigger. */
  page?: number;
}

export interface TriageResult {
  level: TriageLevel;
  label: string;
  triggers: TriageTrigger[];
  /** True when at least one trigger is an emergency-grade signal. */
  isEmergency: boolean;
  /** Plain-language reason for the banner. */
  reason: string;
}

/** Symptom phrases that require immediate emergency guidance. */
const EMERGENCY_SYMPTOMS = [
  'severe chest pain', 'chest pain', 'crushing chest', 'chest tightness with sweating',
  "can't breathe", 'cant breathe', 'cannot breathe', 'difficulty breathing', 'shortness of breath at rest',
  'stroke', 'face drooping', 'slurred speech', 'sudden weakness', 'one sided weakness',
  'unconscious', 'not breathing', 'unresponsive', 'collapsed',
  'severe bleeding', 'heavy bleeding', 'bleeding that will not stop', 'vomiting blood',
  'suicidal', 'suicide', 'self harm', 'want to die',
  'overdose', 'took too many tablets', 'poisoning',
  'severe allergic', 'anaphylaxis', 'throat swelling', 'swollen tongue',
  'seizure', 'fits', 'convulsion', 'heart attack', 'cardiac arrest', 'choking',
  'severe burn', 'lost consciousness', 'fainted', 'passed out', 'severe head injury',
  'stiff neck with fever', 'worst headache of my life', 'sudden vision loss',
];

const URGENT_SYMPTOMS = [
  'high fever', 'blood in', 'severe pain', 'dehydrated', 'cannot walk', "can't walk",
  'blurred vision', 'coughing blood', 'persistent vomiting', 'severe abdominal pain',
];

/** Telugu (native script) + Romanized Telugu emergency phrases. */
const EMERGENCY_SYMPTOMS_TE = [
  'గుండె నొప్పి', 'శ్వాస ఆడటం లేదు', 'శ్వాస తీసుకోలేక', 'పక్షవాతం', 'స్పృహ తప్ప',
  'రక్తం కారుతోంది', 'ఆత్మహత్య', 'ఫిట్స్',
  'gunde noppi', 'swasa aadatam ledu', 'swasa teesukoleka', 'pakshavatam', 'sprha tappa',
  'raktham karutondi', 'aatmahatya', 'fits', 'gunde noppi ga undi',
];

/** Deterministic symptom floor — independent of any AI classification. */
export function triageSymptoms(text: string): TriageTrigger[] {
  const t = text.toLowerCase();
  const triggers: TriageTrigger[] = [];
  for (const phrase of [...EMERGENCY_SYMPTOMS, ...EMERGENCY_SYMPTOMS_TE]) {
    if (t.includes(phrase)) {
      triggers.push({
        level: 'emergency',
        label: 'Emergency symptom reported',
        detail: `You mentioned "${phrase}".`,
        confident: true,
        source: 'symptom',
      });
    }
  }
  if (triggers.length === 0) {
    for (const phrase of URGENT_SYMPTOMS) {
      if (t.includes(phrase)) {
        triggers.push({
          level: 'urgent',
          label: 'Urgent symptom reported',
          detail: `You mentioned "${phrase}".`,
          confident: true,
          source: 'symptom',
        });
      }
    }
  }
  return triggers;
}

/** Phrase patterns the lab may print to mean "panic/critical value". */
const CRITICAL_FLAG_TEXT = /\b(critical|panic|alert|call (?:the )?(?:doctor|physician) (?:immediately|now)|urgent review|abnormal - critical)\b/i;

/**
 * Triage parsed laboratory values.
 * `reportText` is the full extracted text, used to detect a lab-printed
 * critical/panic marker even when the numeric row could not be parsed.
 */
export function triageLabValues(values: ParsedLabValue[], reportText = ''): TriageTrigger[] {
  const triggers: TriageTrigger[] = [];

  for (const v of values) {
    if (v.critical) {
      triggers.push({
        level: 'emergency',
        label: `Critical ${v.testName}`,
        detail: `${v.testName}: ${v.rawValue}${v.unit ? ` ${v.unit}` : ''}. ${v.criticalReason ?? 'This value is in the critical range.'}`,
        confident: v.unitStatus === 'match' || v.unitStatus === 'converted',
        source: 'lab-critical',
        page: v.page,
      });
    }
  }

  if (triggers.length === 0) {
    // A lab's own printed critical/panic marker.
    if (CRITICAL_FLAG_TEXT.test(reportText)) {
      triggers.push({
        level: 'emergency',
        label: 'Report marked critical by the laboratory',
        detail: 'The report text contains a critical/urgent-review marker. Confirm it with the laboratory or your clinician.',
        confident: true,
        source: 'lab-flag',
      });
    } else {
      // A value the lab flagged abnormal but we could not reconcile (unknown
      // unit / unparsed row) still deserves a prompt human look.
      const flagged = values.filter((v) => v.status === 'abnormal' || v.status === 'attention');
      const unreconciled = values.filter((v) => v.unitStatus === 'unit-mismatch');
      if (unreconciled.length > 0) {
        triggers.push({
          level: 'needs-follow-up',
          label: 'Some values could not be fully interpreted',
          detail: `${unreconciled.length} value(s) use a unit that could not be reconciled, so they were shown as printed without a range comparison.`,
          confident: false,
          source: 'lab-unreadable',
        });
      }
      if (flagged.length > 0 && unreconciled.length === 0) {
        triggers.push({
          level: 'needs-follow-up',
          label: 'Values outside the reference range',
          detail: `${flagged.length} value(s) fall outside the report's reference range.`,
          confident: true,
          source: 'lab-flag',
        });
      }
    }
  }

  return triggers;
}

/** Combine lab + symptom triggers into one triage result. */
export function combineTriage(triggers: TriageTrigger[]): TriageResult {
  let level: TriageLevel = 'informational';
  for (const t of triggers) level = maxTriage(level, t.level);

  const primary = triggers.find((t) => t.level === level);
  const isEmergency = level === 'emergency';

  return {
    level,
    label: TRIAGE_LABEL[level],
    triggers,
    isEmergency,
    reason: primary
      ? primary.detail
      : 'No urgent signals were detected in the information provided. This is not a medical clearance.',
  };
}

/** Convenience: triage a document + optional user text in one call. */
export function triageDocument(values: ParsedLabValue[], reportText: string, userText = ''): TriageResult {
  return combineTriage([...triageLabValues(values, reportText), ...triageSymptoms(userText)]);
}

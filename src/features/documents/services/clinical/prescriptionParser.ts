/**
 * CareLink-AI — prescription parser (deterministic).
 *
 * Extracts the instructions a clinician actually wrote — medicine, strength,
 * form, dose, frequency, timing, duration — from real OCR/PDF text. The parser
 * is deliberately CONSERVATIVE: a field is only populated when the source text
 * supports it, and anything ambiguous is marked `needsConfirmation` with the
 * raw line attached.
 *
 * HARD RULES:
 * - Never invent a frequency, duration, dose, or timing.
 * - A morning/afternoon/night schedule is only derived when the frequency or
 *   timing text actually supports that conversion.
 * - Fields that could not be read are listed in `needsVerification` and shown
 *   as "Needs pharmacist/doctor confirmation" in the UI.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import { findAnalyte } from './analyteCatalog';

export type ScheduleSlot = 'morning' | 'afternoon' | 'night';

export interface ParsedMedicine {
  /** Medicine name exactly as written. */
  name: string;
  /** Strength as written (e.g. '500 mg'), else null. */
  strength: string | null;
  /** Dosage form as written (Tab/Cap/Syp/Inj), else null. */
  form: string | null;
  /** Number of units per dose as written (e.g. '1', '1/2'), else null. */
  dose: string | null;
  /** Frequency as written (e.g. 'BD', 'twice daily'), else null. */
  frequency: string | null;
  /** Normalised frequency label for the table (e.g. 'Twice daily'). */
  frequencyLabel: string | null;
  /** Timing as written (e.g. 'after food', 'HS'), else null. */
  timing: string | null;
  /** Duration as written (e.g. '5 days'), else null. */
  duration: string | null;
  /**
   * Derived schedule slots — populated ONLY when the frequency/timing text
   * supports it. Never guessed.
   */
  schedule: ScheduleSlot[];
  /** Free-text special instructions found on the line. */
  instructions: string | null;
  /** Fields that were unclear and need professional confirmation. */
  needsConfirmation: string[];
  /** The raw source line (for "view source"). */
  rawLine: string;
  /** 1-based page the line came from. */
  page: number;
  /** Matched catalog analyte (generic) when the name resolves, else null. */
  genericKey: string | null;
}

export interface PrescriptionParse {
  medicines: ParsedMedicine[];
  /** Doctor/clinic name when printed. */
  doctorName: string | null;
  /** Date as printed. */
  date: string | null;
  /** Follow-up / advice lines found on the document. */
  followUp: string[];
  /** Lines that looked like prescriptions but could not be parsed. */
  unparsedLines: { line: string; page: number }[];
  parsed: boolean;
}

const FORM_TOKENS: { re: RegExp; form: string }[] = [
  { re: /\b(tab|tabs|tablet|tablets)\b\.?/i, form: 'Tablet' },
  { re: /\b(cap|caps|capsule|capsules)\b\.?/i, form: 'Capsule' },
  { re: /\b(syp|syr|syrup|susp|suspension)\b\.?/i, form: 'Syrup' },
  { re: /\b(inj|injection|vial|ampoule|amp)\b\.?/i, form: 'Injection' },
  { re: /\b(drops?|gtt)\b\.?/i, form: 'Drops' },
  { re: /\b(oint|ointment|cream|gel|lotion)\b\.?/i, form: 'Topical' },
  { re: /\b(inhaler|rotacap|mdpi)\b\.?/i, form: 'Inhaler' },
  { re: /\b(sachet|powder|granules)\b\.?/i, form: 'Powder' },
];

/** Frequency abbreviations and words → (label, supported schedule slots). */
const FREQUENCY_MAP: { re: RegExp; label: string; schedule: ScheduleSlot[] }[] = [
  { re: /\b(q\.?i\.?d|qds|four times(?: a day| daily)?|4 times(?: a day| daily)?)\b/i, label: 'Four times daily', schedule: [] },
  { re: /\b(t\.?d\.?s|tds|thrice(?: a day| daily)?|three times(?: a day| daily)?|3 times(?: a day| daily)?)\b/i, label: 'Three times daily', schedule: ['morning', 'afternoon', 'night'] },
  { re: /\b(b\.?d\.?s|bd|bis in die|twice(?: a day| daily)?|two times(?: a day| daily)?|2 times(?: a day| daily)?)\b/i, label: 'Twice daily', schedule: ['morning', 'night'] },
  { re: /\b(o\.?d\.?s|od|once(?: a day| daily)?|1 time(?: a day| daily)?|daily)\b/i, label: 'Once daily', schedule: ['morning'] },
  { re: /\b(h\.?s|at bedtime|bedtime|night(?: time)? only|nocte)\b/i, label: 'At bedtime', schedule: ['night'] },
  { re: /\b(s\.?o\.?s|prn|as (?:and when )?required|when needed|if needed)\b/i, label: 'Only when needed', schedule: [] },
  { re: /\b(stat|immediately)\b/i, label: 'Immediately (single dose)', schedule: [] },
  { re: /\b(every \d+ hours?|q\d+h)\b/i, label: 'At intervals (see instructions)', schedule: [] },
  { re: /\b(weekly|once a week|once weekly)\b/i, label: 'Once weekly', schedule: [] },
  { re: /\b(alternate days?|every other day)\b/i, label: 'Every other day', schedule: [] },
];

/** Explicit time-of-day words that add a schedule slot on their own. */
const TIMING_WORDS: { re: RegExp; slot: ScheduleSlot }[] = [
  { re: /\b(morning|in the morning|am)\b/i, slot: 'morning' },
  { re: /\b(afternoon|midday|noon)\b/i, slot: 'afternoon' },
  { re: /\b(night|at night|evening|hs|bedtime|nocte)\b/i, slot: 'night' },
];

const DURATION_RE = /\b(?:x|for|continue for|take for)?\s*(\d{1,3})\s*(days?|weeks?|months?|d|w|m)\b/i;
const STRENGTH_RE = /\b(\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|iu|units?|%))\b/i;
const DOSE_RE = /(?:^|\s)(\d+\s?\/\s?\d|\d+(?:\.\d+)?)\s*(?:tab|cap|tablet|capsule|tabs|caps|puff|drops?|ml|unit|units)?(?=\s|$)/i;
const FOOD_RE = /\b(after (?:food|meals?)|before (?:food|meals?)|with (?:food|meals?)|empty stomach|on empty stomach|with water|with milk)\b/i;
const SPECIAL_RE = /\b(do not (?:crush|chew|split)|swallow whole|sublingual|apply (?:topically|locally)|external use only|shake well|dissolve (?:in water|under tongue)|do not exceed|as directed)\b/i;
const RX_MARK = /^(rx|℞|prescription)\b/i;
const FOLLOWUP_RE = /\b(follow[- ]?up|review|next visit|come back|return (?:in|after)|advice|advised)\b/i;
const DOCTOR_RE = /\b(?:dr\.?|doctor|physician|consultant)\s*[:-]?\s*([A-Z][A-Za-z.\s]{2,40})/i;

/** Normalise a raw frequency/timing string into a supported schedule. */
export function deriveSchedule(frequency: string | null, timing: string | null): ScheduleSlot[] {
  const slots = new Set<ScheduleSlot>();
  const text = `${frequency ?? ''} ${timing ?? ''}`;
  if (!text.trim()) return [];
  for (const f of FREQUENCY_MAP) {
    if (f.re.test(text)) f.schedule.forEach((s) => slots.add(s));
  }
  for (const t of TIMING_WORDS) {
    if (t.re.test(text)) slots.add(t.slot);
  }
  // A frequency with no explicit slots (e.g. "four times daily") is left empty —
  // we do not invent a time-of-day mapping for it.
  return [...slots];
}

/**
 * Parse a single prescription line into a medicine row, or null.
 * Requires a plausible medicine name (a letter sequence of length >= 3) plus at
 * least one of a form token, a strength, or a frequency — otherwise the line is
 * not treated as a prescription.
 */
export function parsePrescriptionLine(line: string, page: number): ParsedMedicine | null {
  const raw = line.replace(/\s+/g, ' ').trim();
  if (raw.length < 4 || raw.length > 200) return null;
  if (RX_MARK.test(raw)) return null;
  if (FOLLOWUP_RE.test(raw) && !FORM_TOKENS.some((f) => f.re.test(raw))) return null;

  const needsConfirmation: string[] = [];

  const form = FORM_TOKENS.find((f) => f.re.test(raw))?.form ?? null;

  // The medicine name: strip a leading form token, then take the leading
  // alphabetic phrase (allowing digits in names like "Ecosprin 75").
  let working = raw.replace(/^(tab|cap|syp|syr|inj|tablet|capsule|syrup|injection|drops?)\b\.?\s*/i, '');
  const nameMatch = working.match(/^([A-Za-z][A-Za-z0-9./-]{1,}(?:\s+[A-Za-z][A-Za-z0-9./-]{1,}){0,3})/);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  if (name.length < 3) return null;

  const strengthMatch = raw.match(STRENGTH_RE);
  const strength = strengthMatch ? strengthMatch[1].replace(/\s+/g, ' ').trim() : null;

  // Frequency: match against the frequency table; keep the raw text too.
  let frequency: string | null = null;
  let frequencyLabel: string | null = null;
  for (const f of FREQUENCY_MAP) {
    const m = raw.match(f.re);
    if (m) {
      frequency = m[0].trim();
      frequencyLabel = f.label;
      break;
    }
  }

  const timingMatch = raw.match(FOOD_RE);
  let timing = timingMatch ? timingMatch[1].trim() : null;
  if (!timing) {
    const t = TIMING_WORDS.find((w) => w.re.test(raw));
    if (t) timing = t.re.exec(raw)?.[0].trim() ?? null;
  }

  const durationMatch = raw.match(DURATION_RE);
  const duration = durationMatch ? `${durationMatch[1]} ${durationMatch[2]}`.trim() : null;

  const doseMatch = raw.match(DOSE_RE);
  const dose = doseMatch ? doseMatch[1].trim() : null;

  const specialMatch = raw.match(SPECIAL_RE);
  const instructions = specialMatch ? specialMatch[1].trim() : null;

  // A line is a prescription only if it carries SOME instruction signal.
  const hasSignal = Boolean(form || strength || frequency || timing || duration || dose);
  if (!hasSignal) return null;

  if (!strength) needsConfirmation.push('strength');
  if (!frequency) needsConfirmation.push('frequency');
  if (!duration) needsConfirmation.push('duration');
  if (!form) needsConfirmation.push('form');

  const schedule = deriveSchedule(frequency, timing);

  return {
    name,
    strength,
    form,
    dose,
    frequency,
    frequencyLabel,
    timing,
    duration,
    schedule,
    instructions,
    needsConfirmation,
    rawLine: raw,
    page,
    genericKey: findAnalyte(name)?.key ?? null,
  };
}

/** Parse a full prescription document from extracted page text. */
export function parsePrescription(pages: { pageNumber: number; text: string }[]): PrescriptionParse {
  const medicines: ParsedMedicine[] = [];
  const followUp: string[] = [];
  const unparsedLines: { line: string; page: number }[] = [];
  const seen = new Set<string>();
  let doctorName: string | null = null;
  let date: string | null = null;

  for (const page of pages) {
    for (const line of page.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length < 3) continue;

      if (!doctorName) {
        const dm = trimmed.match(DOCTOR_RE);
        if (dm) doctorName = `Dr. ${dm[1].trim()}`.replace(/^Dr\.\s*Dr\.?/i, 'Dr.');
      }
      if (!date) {
        const dm = trimmed.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/);
        if (dm && /\b(date|dated|dt)\b/i.test(trimmed)) date = dm[1];
      }

      if (FOLLOWUP_RE.test(trimmed) && trimmed.length < 140) {
        followUp.push(trimmed);
        continue;
      }

      const med = parsePrescriptionLine(trimmed, page.pageNumber);
      if (med) {
        const key = `${med.name.toLowerCase()}|${med.strength ?? ''}|${med.frequency ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        medicines.push(med);
      } else if (/\d/.test(trimmed) && /[a-z]/i.test(trimmed) && trimmed.length < 120 && !FOLLOWUP_RE.test(trimmed)) {
        unparsedLines.push({ line: trimmed, page: page.pageNumber });
      }
    }
  }

  return {
    medicines,
    doctorName,
    date,
    followUp: followUp.slice(0, 8),
    unparsedLines: unparsedLines.slice(0, 25),
    parsed: medicines.length > 0,
  };
}

export { FREQUENCY_MAP };

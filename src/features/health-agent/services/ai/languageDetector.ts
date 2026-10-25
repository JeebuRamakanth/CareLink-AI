/**
 * CareLink-AI — multilingual input detection (Phase 2).
 *
 * The assistant must answer in the language and writing style the user actually
 * used, WITHOUT the user picking a language first. This module is the single
 * deterministic detector for that decision. It runs on every user turn, before
 * any model call, so language handling never depends on the LLM being reachable.
 *
 * Three detection layers, strongest first:
 *   1. SCRIPT      — Unicode ranges (Telugu, Devanagari, Kannada, Tamil, …)
 *                    are unambiguous evidence of the script being used.
 *   2. TRANSLITERATION — Romanized keyword/morphology scoring for languages
 *                    written in Latin script (Telugu-English, Hinglish,
 *                    Kannada-English, Tamil-English).
 *   3. CODE-SWITCHING — Latin words present alongside a non-Latin script means
 *                    the user mixes languages; the dominant language wins but
 *                    the response must keep the same mixed style.
 *
 * HONESTY: detection is a heuristic, never a claim of certainty. `confidence`
 * is surfaced so callers can ask a short clarification instead of guessing, and
 * so language detection can NEVER delay emergency handling (it is pure and
 * synchronous).
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import type { AgentLanguage } from '../../types';

export type DetectedScript =
  | 'latin' | 'telugu' | 'devanagari' | 'kannada' | 'tamil' | 'malayalam'
  | 'bengali' | 'gujarati' | 'arabic' | 'other';

export interface LanguageDetection {
  /** Best-supported language for the RESPONSE. */
  language: AgentLanguage;
  confidence: 'high' | 'medium' | 'low';
  /** Dominant script of the input. */
  script: DetectedScript;
  /** True when the input mixes scripts (e.g. Telugu script + English words). */
  codeSwitched: boolean;
  /** True when the input is a non-Latin language written in Latin letters. */
  transliterated: boolean;
  /** Languages detected in the input, most prominent first. */
  candidates: AgentLanguage[];
  /** Human-readable reason (safe to show in a diagnostics/telemetry label). */
  reason: string;
}

/** Languages the assistant can answer in. `en` is the always-available floor. */
export const SUPPORTED_LANGUAGES: readonly AgentLanguage[] = [
  'en', 'te', 'hi', 'kn', 'ta', 'ml', 'bn', 'gu', 'mr', 'ur',
];

/** Display names, used by the language selector. */
export const LANGUAGE_NAMES: Record<AgentLanguage, string> = {
  en: 'English',
  te: 'తెలుగు (Telugu)',
  hi: 'हिन्दी (Hindi)',
  kn: 'ಕನ್ನಡ (Kannada)',
  ta: 'தமிழ் (Tamil)',
  ml: 'മലയാളം (Malayalam)',
  bn: 'বাংলা (Bengali)',
  gu: 'ગુજરાતી (Gujarati)',
  mr: 'मराठी (Marathi)',
  ur: 'اردو (Urdu)',
};

/** Natural-language names, used inside model instructions. */
export const LANGUAGE_ENGLISH_NAMES: Record<AgentLanguage, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  kn: 'Kannada',
  ta: 'Tamil',
  ml: 'Malayalam',
  bn: 'Bengali',
  gu: 'Gujarati',
  mr: 'Marathi',
  ur: 'Urdu',
};

export function isSupportedLanguage(value: unknown): value is AgentLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/* ----------------------------------------------------------------------------
 * 1. Script ranges
 * ------------------------------------------------------------------------- */

const SCRIPT_RANGES: { script: DetectedScript; language: AgentLanguage; re: RegExp }[] = [
  { script: 'telugu', language: 'te', re: /[\u0C00-\u0C7F]/ },
  { script: 'kannada', language: 'kn', re: /[\u0C80-\u0CFF]/ },
  { script: 'malayalam', language: 'ml', re: /[\u0D00-\u0D7F]/ },
  { script: 'tamil', language: 'ta', re: /[\u0B80-\u0BFF]/ },
  { script: 'devanagari', language: 'hi', re: /[\u0900-\u097F]/ },
  { script: 'bengali', language: 'bn', re: /[\u0980-\u09FF]/ },
  { script: 'gujarati', language: 'gu', re: /[\u0A80-\u0AFF]/ },
  { script: 'arabic', language: 'ur', re: /[\u0600-\u06FF]/ },
];

const LATIN_RE = /[A-Za-z]/;

/** Count characters inside a Unicode range. */
function countInRange(text: string, re: RegExp): number {
  const global = new RegExp(re.source, 'g');
  return (text.match(global) ?? []).length;
}

/** Script of the input, plus how many Latin letters it also contains. */
function dominantScript(text: string): { script: DetectedScript; language: AgentLanguage | null; latin: number } {
  let best: { script: DetectedScript; language: AgentLanguage; count: number } | null = null;
  for (const entry of SCRIPT_RANGES) {
    const count = countInRange(text, entry.re);
    if (count > 0 && (!best || count > best.count)) {
      best = { script: entry.script, language: entry.language, count };
    }
  }
  return {
    script: best?.script ?? 'latin',
    language: best?.language ?? null,
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
  };
}

/* ----------------------------------------------------------------------------
 * 2. Transliteration / Romanized scoring
 * ------------------------------------------------------------------------- */

/**
 * Romanized markers per language. These are function words and common
 * symptom/morphology fragments that are strongly associated with one language
 * family. They are matched as whole tokens so "hai" cannot match "chair".
 */
const ROMANIZED_MARKERS: Record<Exclude<AgentLanguage, 'en'>, { strong: string[]; weak: string[] }> = {
  te: {
    strong: ['naaku', 'nakku', 'naku', 'undi', 'unnadi', 'unnayi', 'vastundi', 'vachindi', 'ledu', 'kavali',
      'chestunnanu', 'chestunna', 'ayindi', 'avutundi', 'noppi', 'jvaram', 'jwarm', 'vendiridi', 'thala',
      'gunde', 'swasa', 'kalu', 'kallu', 'kadupu', 'vanti', 'okati', 'rendu', 'emi', 'enti', 'eppudu',
      'ekkada', 'ela', 'enduku', 'meeru', 'nenu', 'maaku', 'mee', 'chala', 'konchem', 'thakkuva', 'ekkuva'],
    weak: ['ra', 'ga', 'ki', 'lo', 'ni', 'tho', 'kuda', 'ani', 'ante', 'ani'],
  },
  hi: {
    strong: ['mujhe', 'muje', 'mera', 'meri', 'mere', 'hai', 'hain', 'nahi', 'nahin', 'raha', 'rahi', 'ho',
      'raha', 'bukhar', 'bukhaar', 'dard', 'sar', 'pet', 'chhati', 'saans', 'khaansi', 'khansi', 'ulti',
      'dast', 'chakkar', 'kamzori', 'thakaan', 'kaise', 'kya', 'kyun', 'kab', 'kahan', 'kitna', 'bimari',
      'ilaaj', 'dawa', 'dawai', 'tablet', 'doctor', 'aspatal', 'haspatal', 'zyada', 'bahut', 'thoda', 'aur'],
    weak: ['ka', 'ki', 'ke', 'se', 'ko', 'mein', 'me', 'par', 'bhi', 'to', 'ek', 'do', 'wala', 'vala'],
  },
  kn: {
    strong: ['nanage', 'nanu', 'nanna', 'nimage', 'nimma', 'ide', 'illa', 'aagide', 'aagutide', 'bandide',
      'nodi', 'noavu', 'tale', 'tale novu', 'hotte', 'kannu', 'usiru', 'jwara', 'jwara bandide', 'shakti',
      'ella', 'enu', 'yaake', 'hege', 'yavaga', 'elli', 'tumba', 'swalpa'],
    weak: ['alli', 'illi', 'inda', 'ge', 'annu', 'ondu', 'eradu', 'beku', 'bekilla'],
  },
  ta: {
    strong: ['enakku', 'ennaku', 'en', 'ennudaiya', 'irukku', 'irukkiradhu', 'illai', 'illa', 'kaichal',
      'vali', 'thala', 'thalaivali', 'vayiru', 'nenju', 'moochu', 'moochu vidamudiyala', 'vandhudhu',
      'enna', 'eppadi', 'eppo', 'enge', 'yaen', 'romba', 'konjam', 'sappadu', 'marundhu'],
    weak: ['oru', 'rendu', 'vendum', 'aachu', 'aaga', 'il', 'ku', 'ai', 'udan'],
  },
  ml: {
    strong: ['enikku', 'eniku', 'ente', 'undu', 'illa', 'illa', 'pani', 'vayar', 'thala', 'thala vedana',
      'shwasam', 'kshema', 'enthu', 'engane', 'eppol', 'evide', 'venda', 'valare', 'kurachu'],
    weak: ['oru', 'randu', 'aanu', 'alla', 'veendum'],
  },
  bn: { strong: ['amar', 'tomar', 'ami', 'kemon', 'acho', 'nei', 'byatha', 'matha', 'jor', 'pet', 'shash'], weak: ['ekta', 'kemon', 'hobe'] },
  gu: { strong: ['mane', 'tamaru', 'che', 'nathi', 'tav', 'dukhavo', 'mathu', 'pet', 'shwas'], weak: ['ek', 'be', 'chhe'] },
  mr: { strong: ['mala', 'maza', 'tumcha', 'aahe', 'nahi', 'dukh', 'tap', 'khok', 'shwas'], weak: ['ek', 'don', 'chya'] },
  ur: { strong: ['mujhe', 'mera', 'dard', 'bukhar', 'sans', 'kya', 'kaise', 'nahi', 'hai'], weak: ['ka', 'ki', 'ke'] },
};

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z\u0900-\u097F\u0C00-\u0C7F\u0C80-\u0CFF\u0B80-\u0BFF\u0D00-\u0D7F]+/i)
    .filter((t) => t.length > 1);

interface RomanizedScore {
  language: AgentLanguage | null;
  /** Total score (strong markers weigh 2, weak markers 1). */
  score: number;
  /** How many STRONG (language-specific) markers matched. */
  strongCount: number;
  second: AgentLanguage | null;
}

/**
 * Score Romanized Latin-script input against each language's markers.
 *
 * A WEAK marker alone is never enough: English sentences legitimately contain
 * tokens like "me", "to", "na" and "do", so weak-only matches would misclassify
 * plain English as Hinglish. A transliterated classification therefore requires
 * at least one STRONG, language-specific marker.
 */
function scoreRomanized(text: string): RomanizedScore {
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return { language: null, score: 0, strongCount: 0, second: null };

  const scores: { language: AgentLanguage; score: number; strongCount: number }[] = [];
  for (const [lang, markers] of Object.entries(ROMANIZED_MARKERS) as [AgentLanguage, { strong: string[]; weak: string[] }][]) {
    let score = 0;
    let strongCount = 0;
    for (const token of tokens) {
      if (markers.strong.includes(token)) {
        score += 2;
        strongCount += 1;
      } else if (markers.weak.includes(token)) {
        score += 1;
      }
    }
    if (score > 0) scores.push({ language: lang, score, strongCount });
  }
  scores.sort((a, b) => b.score - a.score || b.strongCount - a.strongCount);
  const best = scores[0];
  return {
    language: best?.language ?? null,
    score: best?.score ?? 0,
    strongCount: best?.strongCount ?? 0,
    second: scores[1]?.language ?? null,
  };
}

/* ----------------------------------------------------------------------------
 * Public detection
 * ------------------------------------------------------------------------- */

/**
 * Detect the language and writing style of one user message.
 *
 * The result is deliberately conservative: when evidence is weak the detector
 * reports `confidence: 'low'` with `language: 'en'` so the caller can keep the
 * conversation's previous language rather than randomly switching.
 */
export function detectLanguage(input: string): LanguageDetection {
  const text = (input ?? '').trim();
  if (!text) {
    return {
      language: 'en', confidence: 'low', script: 'latin', codeSwitched: false,
      transliterated: false, candidates: ['en'], reason: 'empty input',
    };
  }

  const { script, language: scriptLanguage, latin } = dominantScript(text);
  const romanized = scoreRomanized(text);
  const candidates: AgentLanguage[] = [];
  const pushUnique = (values: AgentLanguage[]) => {
    for (const value of values) if (!candidates.includes(value)) candidates.push(value);
  };

  // Layer 1 — an unambiguous script wins outright.
  if (scriptLanguage) {
    pushUnique([scriptLanguage]);
    if (romanized.language && romanized.language !== scriptLanguage) pushUnique([romanized.language]);
    if (latin > 0) pushUnique(['en']);
    const codeSwitched = latin > 0;
    return {
      language: scriptLanguage,
      confidence: 'high',
      script,
      codeSwitched,
      transliterated: false,
      candidates,
      reason: `${script} script detected${codeSwitched ? ' with English words (code-switched)' : ''}`,
    };
  }

  // Layer 2 — Romanized / transliterated non-English input. At least one
  // STRONG language-specific marker is required, so plain English is not
  // misread as Hinglish on a stray weak token.
  if (romanized.language && romanized.strongCount > 0 && romanized.score >= 4) {
    pushUnique([romanized.language]);
    if (romanized.second) pushUnique([romanized.second]);
    pushUnique(['en']);
    return {
      language: romanized.language,
      confidence: romanized.score >= 6 ? 'high' : 'medium',
      script: 'latin',
      codeSwitched: false,
      transliterated: true,
      candidates,
      reason: `Romanized ${romanized.language} markers detected (score ${romanized.score}, ${romanized.strongCount} strong)`,
    };
  }
  if (romanized.language && romanized.strongCount > 0) {
    pushUnique([romanized.language, 'en']);
    return {
      language: romanized.language,
      confidence: 'low',
      script: 'latin',
      codeSwitched: false,
      transliterated: true,
      candidates,
      reason: `weak Romanized ${romanized.language} signal (score ${romanized.score})`,
    };
  }

  // Layer 3 — plain Latin script, no non-English evidence.
  if (LATIN_RE.test(text)) {
    return {
      language: 'en', confidence: 'medium', script: 'latin', codeSwitched: false,
      transliterated: false, candidates: ['en'], reason: 'Latin script, no non-English markers',
    };
  }

  return {
    language: 'en', confidence: 'low', script: 'other', codeSwitched: false,
    transliterated: false, candidates: ['en'], reason: 'script not recognised',
  };
}

/**
 * Decide the language for the RESPONSE given the current turn's detection and
 * the conversation's remembered language.
 *
 * Rules (Phase 2 §2.2):
 * - A HIGH-confidence detection always wins, so the user can change language
 *   mid-chat and the assistant follows immediately.
 * - A MEDIUM-confidence detection of a NON-English language (native script or
 *   transliteration) also wins — that is positive evidence of a switch.
 * - A plain-English medium/low detection does NOT override a remembered
 *   non-English language: a Telugu conversation with a short "ok" reply must
 *   stay Telugu.
 * - With no prior turns there is nothing to keep, so the detection is adopted.
 */
export function resolveResponseLanguage(
  detection: LanguageDetection,
  remembered: AgentLanguage,
  hasPriorTurns: boolean
): AgentLanguage {
  if (detection.confidence === 'high') return detection.language;
  if (detection.language !== 'en' && (detection.transliterated || detection.script !== 'latin')) {
    return detection.language;
  }
  if (!hasPriorTurns) return detection.language;
  return remembered;
}

/**
 * CareLink-AI — medicine name candidate extraction.
 *
 * When a user asks about a medicine in free text ("tell me about atorvastatin",
 * "Dolo 650 side effects", "what is pantoprazole used for"), the assistant must
 * be able to try the name against an authoritative reference database instead of
 * only recognising a small hardcoded demo list.
 *
 * SAFETY: this module only proposes CANDIDATE STRINGS. Nothing is presented to
 * the user until the reference lookup actually verifies one — an unverified
 * candidate produces an honest "not identified" answer, never a guess.
 */

/** Filler words that are not part of a medicine name. */
const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'what', 'is', 'are', 'the', 'a', 'an', 'of', 'for', 'on', 'to', 'do',
  'does', 'can', 'i', 'you', 'take', 'taking', 'use', 'used', 'uses', 'usage', 'purpose',
  'side', 'effects', 'effect', 'safety', 'safe', 'warning', 'warnings', 'info', 'information',
  'details', 'detail', 'know', 'knows', 'explain', 'give', 'show', 'my', 'this', 'that', 'it',
  'medicine', 'medicines', 'tablet', 'tablets', 'pill', 'pills', 'drug', 'drugs', 'capsule',
  'capsules', 'syrup', 'injection', 'dose', 'dosage', 'mg', 'ml', 'mcg', 'iu', 'and', 'or',
  'please', 'help', 'should', 'how', 'much', 'many', 'if', 'with', 'without', 'any', 'also',
  'more', 'some', 'which', 'when', 'why', 'where', 'who', 'was', 'were', 'be', 'been', 'have',
  'has', 'had', 'there', 'here', 'not', 'no', 'yes',
]);

const cleanToken = (t: string): string => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');

/**
 * Candidate medicine names from free text, most specific first.
 *
 * The whole de-stop-worded phrase is tried first (so "dolo 650" stays together),
 * then progressively shorter trailing windows (so a brand plus strength such as
 * "atorvastatin 10 mg" is also tried as just "atorvastatin").
 */
export function extractMedicineCandidates(text: string): string[] {
  const tokens = text
    .split(/[\s,;:.!?()[\]{}"'/\\]+/)
    .map(cleanToken)
    .filter((t) => t.length > 0);

  const content = tokens.filter((t) => !STOP_WORDS.has(t.toLowerCase()));
  if (content.length === 0) return [];

  const candidates: string[] = [];
  const push = (c: string) => {
    const trimmed = c.trim();
    if (trimmed.length >= 3 && !candidates.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      candidates.push(trimmed);
    }
  };

  // Whole remaining phrase, then windows of 3, 2 and 1 tokens from the start.
  push(content.join(' '));
  for (const size of [3, 2, 1]) {
    for (let i = 0; i + size <= content.length; i += 1) {
      push(content.slice(i, i + size).join(' '));
    }
  }
  return candidates;
}

/**
 * Whether the text looks like a question about a medicine at all. Used only to
 * decide whether to ATTEMPT a reference lookup — the lookup still has to
 * succeed before anything is shown.
 */
export function looksLikeMedicineQuestion(text: string): boolean {
  return /\b(medicine|medicines|tablet|tablets|pill|pills|drug|drugs|capsule|capsules|syrup|dose|dosage|mg)\b/i.test(text)
    || /\b(tell me about|what is|what are|side effects? of|uses? of|purpose of)\b/i.test(text);
}

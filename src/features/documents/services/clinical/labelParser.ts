/**
 * CareLink-AI — medicine-label parser (deterministic).
 *
 * Extracts candidate identifiers from the REAL OCR text of a medicine strip,
 * box, bottle or label: brand name, composition/active ingredient, strength,
 * dosage form, manufacturer, batch and expiry.
 *
 * SAFETY: OCR of packaging is unreliable, so this parser produces CANDIDATES
 * with an explicit reason, never a confirmed identification. The caller must
 * verify each candidate against a medicine database (see medicineSources.ts)
 * before showing any medicine-specific guidance, and must label anything that
 * could not be verified as uncertain.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

export interface LabelCandidate {
  /** The candidate name exactly as read. */
  name: string;
  /** How the name was found (drives the confidence explanation). */
  foundAs: 'composition' | 'brand-line' | 'form-line' | 'fallback';
}

export interface ParsedMedicineLabel {
  /** Ranked candidate names (composition first, then brand lines). */
  candidates: LabelCandidate[];
  /** Active ingredient(s) read from a "composition"/"contains" line. */
  composition: string[];
  /** Strength as printed (e.g. '500 mg'), when found. */
  strength: string | null;
  /** Dosage form as printed. */
  form: string | null;
  /** Manufacturer as printed, when found. */
  manufacturer: string | null;
  /** Batch number as printed, when found. */
  batch: string | null;
  /** Expiry as printed, when found. */
  expiry: string | null;
  /** True when the label text was too sparse to identify anything. */
  unreadable: boolean;
  /** Reason the read is uncertain (shown to the user). */
  uncertaintyReason: string | null;
}

const COMPOSITION_LINE = /\b(composition|each (?:film[- ]coated )?(?:tablet|capsule|5\s?ml|ml)\s+contains|contains|active (?:ingredient|substance)s?)\b/i;
const STRENGTH = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|iu|units?|%)\b/i;
const FORM = /\b(tablets?|capsules?|syrup|suspension|injection|ointment|cream|gel|drops?|inhaler|sachet|powder)\b/i;
const MANUFACTURER = /\b(?:mfg(?:d)?\.?\s*by|manufactured by|marketed by|made by)\s*[:-]?\s*([A-Za-z][A-Za-z0-9&.,' -]{2,50})/i;
const BATCH = /\b(?:batch|b\.?\s?no|lot)\s*(?:no\.?|number)?\s*[:-]?\s*([A-Za-z0-9/-]{3,20})/i;
const EXPIRY = /\b(?:exp(?:iry)?\.?\s*(?:date)?|use before|best before)\s*[:-]?\s*(\d{1,2}[-/.]\d{2,4}|\d{2}[-/.]\d{2,4}|[A-Za-z]{3,9}\s+\d{4})/i;
const MRP_LINE = /\bmrp\b|\brs\.?\s*\d|\bprice\b/i;

/** Words that are never a medicine name. */
const NOISE = /\b(mrp|price|batch|lot|exp|expiry|store|keep|dosage|direction|warning|caution|tablets?|capsules?|syrup|mg|mcg|ml|gm|iu|pack|size|for oral use|prescription|drug|schedule|refill|net content|licence|license)\b/i;

/**
 * Parse medicine-label text into candidates. Ranks composition-derived
 * ingredient names above the printed brand line.
 */
export function parseMedicineLabel(text: string): ParsedMedicineLabel {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2);

  const composition: string[] = [];
  const candidates: LabelCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (name: string, foundAs: LabelCandidate['foundAs']) => {
    const cleaned = cleanName(name);
    if (!cleaned || cleaned.length < 3) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ name: cleaned, foundAs });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (COMPOSITION_LINE.test(line)) {
      // The ingredient usually follows "contains" / "composition:" on the same
      // line, but packaging frequently wraps it onto the next line(s).
      const inline = line.replace(/^.*?\b(?:composition|contains?|active (?:ingredient|substance)s?)\b\s*[:-]?\s*/i, '');
      const sources = [inline];
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
        // Stop at the next labelled section rather than swallowing it.
        if (COMPOSITION_LINE.test(lines[j]) || MANUFACTURER.test(lines[j]) || BATCH.test(lines[j]) || EXPIRY.test(lines[j]) || MRP_LINE.test(lines[j])) break;
        sources.push(lines[j]);
      }
      for (const source of sources) {
        for (const part of source.split(/[,;+]|\band\b/i)) {
          const ingredient = cleanName(part);
          if (ingredient && ingredient.length >= 3 && !NOISE.test(ingredient)) {
            composition.push(ingredient);
            addCandidate(ingredient, 'composition');
          }
        }
      }
    }
  }

  // Brand lines: a short line of title-case words near the top, not a noise line.
  for (const line of lines.slice(0, 12)) {
    if (COMPOSITION_LINE.test(line) || MRP_LINE.test(line)) continue;
    if (NOISE.test(line) && !STRENGTH.test(line)) continue;
    const words = line.split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 4) continue;
    const alpha = words.join('');
    if (!/[A-Za-z]{3,}/.test(alpha)) continue;
    // A brand name is usually Title-case or ALL-CAPS, and contains no dosage.
    const looksLikeBrand = /^[A-Z][A-Za-z0-9.-]*/.test(line) || /^[A-Z0-9\s-]+$/.test(line);
    if (!looksLikeBrand) continue;
    addCandidate(line.replace(STRENGTH, '').trim(), 'brand-line');
  }

  const fullText = lines.join('\n');
  const strength = fullText.match(STRENGTH)?.[0].trim() ?? null;
  const form = fullText.match(FORM)?.[0]?.trim() ?? null;
  const manufacturer = fullText.match(MANUFACTURER)?.[1]?.trim() ?? null;
  const batch = fullText.match(BATCH)?.[1]?.trim() ?? null;
  const expiry = fullText.match(EXPIRY)?.[1]?.trim() ?? null;

  const textLength = fullText.replace(/\s/g, '').length;
  const unreadable = textLength < 12 || candidates.length === 0;

  return {
    candidates,
    composition,
    strength,
    form,
    manufacturer,
    batch,
    expiry,
    unreadable,
    uncertaintyReason: unreadable
      ? 'The label text could not be read clearly enough to identify this medicine.'
      : 'Packaging text alone cannot confirm the medicine — verify the name and strength against the label or with a pharmacist.',
  };
}

/** Strip dosage tokens and punctuation from a candidate name. */
function cleanName(value: string): string {
  return value
    .replace(STRENGTH, '')
    .replace(/[(){}[\]]/g, ' ')
    .replace(/\b(?:tablets?|capsules?|syrup|suspension|injection)\b/gi, '')
    .replace(/[.:;,\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

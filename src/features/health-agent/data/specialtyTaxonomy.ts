/**
 * CareLink-AI — clinical specialty taxonomy (Phase 1.4).
 *
 * A single normalized specialty model shared by the directory pages, the agent
 * and the chatbot so that a user query ("orthopedic", "children's doctor",
 * "heart specialist") resolves to the SAME canonical specialty the sourced
 * directory actually uses.
 *
 * RULES (non-negotiable):
 *   - Synonyms exist ONLY for spelling/locale variants and clearly-equivalent
 *     lay terms of the SAME specialty. Clinically different specialties are
 *     never equated (e.g. Cardiology ≠ Cardiac Surgery, Neurology ≠ Psychiatry).
 *   - The taxonomy is a SEARCH-ASSISTANCE mapping, never a diagnosis.
 */

export interface SpecialtyDefinition {
  /** Stable identifier (also the canonical lowercase key). */
  id: string;
  /** Canonical display name. */
  name: string;
  /** Alternative spellings, locales, and lay terms that map to this specialty. */
  synonyms: string[];
}

/**
 * Canonical specialties. Order is presentation order, not priority.
 * `synonyms` are matched case-insensitively as whole words/phrases.
 */
export const SPECIALTIES: SpecialtyDefinition[] = [
  { id: 'cardiology', name: 'Cardiology', synonyms: ['cardio', 'cardiac', 'heart', 'heart specialist'] },
  { id: 'neurology', name: 'Neurology', synonyms: ['neuro', 'brain', 'nerves', 'neurologist'] },
  { id: 'general-medicine', name: 'General Medicine', synonyms: ['general physician', 'physician', 'internal medicine', 'gp', 'general practitioner', 'fever', 'cold', 'cough'] },
  { id: 'paediatrics', name: 'Paediatrics', synonyms: ['pediatrics', 'pediatric', 'paediatric', 'child specialist', 'children', 'child', 'kids', 'newborn', 'neonatal'] },
  { id: 'orthopaedics', name: 'Orthopaedics', synonyms: ['orthopedics', 'orthopedic', 'orthopaedic', 'bone', 'joint', 'joint replacement', 'spine', 'knee'] },
  { id: 'dermatology', name: 'Dermatology', synonyms: ['skin', 'dermatologist', 'rash', 'skin specialist'] },
  { id: 'obstetrics-gynaecology', name: 'Obstetrics & Gynaecology', synonyms: ['gynecology', 'gynaecology', 'ob-gyn', 'obgyn', 'gynecologist', 'pregnancy', 'maternity', 'women'] },
  { id: 'ent', name: 'ENT', synonyms: ['ear nose throat', 'otolaryngology', 'ent surgeon', 'ear', 'nose', 'throat'] },
  { id: 'ophthalmology', name: 'Ophthalmology', synonyms: ['eye', 'eyes', 'ophthalmologist', 'eye specialist', 'retina', 'vision'] },
  { id: 'psychiatry', name: 'Psychiatry', synonyms: ['mental health', 'psychiatrist', 'anxiety', 'depression', 'depress', 'mental'] },
  { id: 'nephrology', name: 'Nephrology', synonyms: ['kidney', 'renal', 'nephrologist'] },
  { id: 'endocrinology', name: 'Endocrinology', synonyms: ['endocrine', 'endocrinologist', 'diabetes', 'sugar', 'thyroid', 'hormone'] },
  { id: 'rheumatology', name: 'Rheumatology', synonyms: ['rheumatologist', 'arthritis', 'autoimmune'] },
  { id: 'oncology', name: 'Oncology', synonyms: ['cancer', 'oncologist', 'tumour', 'tumor'] },
  { id: 'pulmonology', name: 'Pulmonology', synonyms: ['respiratory', 'lung', 'pulmonologist', 'chest', 'asthma'] },
  { id: 'gastroenterology', name: 'Gastroenterology', synonyms: ['gastro', 'stomach', 'liver', 'gut', 'gastroenterologist', 'digestive'] },
  { id: 'general-surgery', name: 'General Surgery', synonyms: ['surgery', 'surgeon', 'surgical'] },
  { id: 'emergency-medicine', name: 'Emergency Medicine', synonyms: ['emergency', 'accident', 'trauma', 'casualty'] },
];

const normalize = (value: string): string => value.trim().toLowerCase();

/** Word-boundary match so "heart" does not match "hearthstone" and "ent" is not matched inside "patient". */
const containsPhrase = (haystack: string, phrase: string): boolean => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
};

/**
 * Resolve a free-text term (specialty name, synonym, or lay term) to its
 * canonical specialty definition. Returns null when nothing matches — callers
 * must NOT invent a specialty for an unknown term.
 */
export function resolveSpecialty(term: string | undefined | null): SpecialtyDefinition | null {
  if (!term) return null;
  const t = normalize(term);
  if (!t) return null;

  // Exact canonical name/id match wins first.
  for (const spec of SPECIALTIES) {
    if (t === spec.id || t === normalize(spec.name)) return spec;
  }
  // Then synonym match (longest synonym first so "joint replacement" beats "joint").
  let best: { spec: SpecialtyDefinition; length: number } | null = null;
  for (const spec of SPECIALTIES) {
    for (const syn of spec.synonyms) {
      if (containsPhrase(t, syn) && (!best || syn.length > best.length)) {
        best = { spec, length: syn.length };
      }
    }
  }
  return best?.spec ?? null;
}

/** Canonical display name for a term, or the trimmed original when unresolved. */
export function canonicalSpecialtyName(term: string | undefined | null): string {
  return resolveSpecialty(term)?.name ?? (term ?? '').trim();
}

/**
 * Whether two specialty labels refer to the same canonical specialty. Used so
 * "Orthopaedics" (directory) and "Orthopedics" (agent) are treated as equal.
 */
export function isSameSpecialty(a: string | undefined | null, b: string | undefined | null): boolean {
  const ra = resolveSpecialty(a);
  const rb = resolveSpecialty(b);
  if (ra && rb) return ra.id === rb.id;
  return normalize(a ?? '') === normalize(b ?? '') && normalize(a ?? '') !== '';
}

/** Every searchable surface form for a specialty (name + synonyms), lowercased. */
export function specialtySearchTerms(term: string | undefined | null): string[] {
  const spec = resolveSpecialty(term);
  if (!spec) return term ? [normalize(term)] : [];
  return [spec.id, normalize(spec.name), ...spec.synonyms.map(normalize)];
}

/**
 * True when a free-text haystack mentions the specialty by canonical name or
 * any synonym. Used by directory search so lay terms find the right records.
 */
export function textMentionsSpecialty(haystack: string, specialty: string | undefined | null): boolean {
  const terms = specialtySearchTerms(specialty);
  if (terms.length === 0) return false;
  const h = normalize(haystack);
  return terms.some((term) => containsPhrase(h, term));
}

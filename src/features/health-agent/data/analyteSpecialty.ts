/**
 * CareLink-AI — analyte → clinical specialty mapping.
 *
 * The bridge that turns "which lab values are outside their reference range"
 * into "which clinical service usually manages that", so an abnormal report can
 * surface RELEVANT facilities instead of a bare /doctors link.
 *
 * RULES (non-negotiable):
 *   - This maps a TEST to a SERVICE that commonly manages it. It never
 *     diagnoses, never prescribes and never claims a facility treats a
 *     condition. The facility itself must independently publish the matching
 *     department/specialty, otherwise it is not recommended at all.
 *   - Keys are the STABLE `analyteKey` values from the documents analyte
 *     catalog, so a catalog rename cannot silently break the mapping.
 *   - `specialty` is a canonical name from `specialtyTaxonomy`, so the agent,
 *     the directory search and the hospital pages agree on one vocabulary.
 */

export interface AnalyteSpecialtyLink {
  /** Stable analyte key (see documents/services/clinical/analyteCatalog). */
  analyteKey: string;
  /** Canonical specialty name (see data/specialtyTaxonomy). */
  specialty: string;
  /** The clinical area in plain language, used in the "why relevant" copy. */
  area: string;
  /** Why this service is the one that usually manages this test. */
  rationale: string;
}

export const ANALYTE_SPECIALTY: AnalyteSpecialtyLink[] = [
  { analyteKey: 'hemoglobin', specialty: 'General Medicine', area: 'blood counts and anaemia', rationale: 'Haemoglobin is reviewed by a physician, who investigates anaemia and refers on if needed.' },
  { analyteKey: 'wbc', specialty: 'General Medicine', area: 'infection and inflammation', rationale: 'A white-cell count is assessed by a physician looking for infection or inflammation.' },
  { analyteKey: 'platelets', specialty: 'General Medicine', area: 'clotting and bleeding risk', rationale: 'Platelet counts are assessed by a physician for bleeding or clotting problems.' },
  { analyteKey: 'fasting-glucose', specialty: 'Endocrinology', area: 'blood-sugar control', rationale: 'Fasting glucose is used to screen for and monitor diabetes, which endocrinology manages.' },
  { analyteKey: 'hba1c', specialty: 'Endocrinology', area: 'long-term blood-sugar control', rationale: 'HbA1c measures average blood sugar over months and is managed by endocrinology.' },
  { analyteKey: 'creatinine', specialty: 'Nephrology', area: 'kidney function', rationale: 'Creatinine reflects kidney filtration, assessed by nephrology.' },
  { analyteKey: 'egfr', specialty: 'Nephrology', area: 'kidney function', rationale: 'eGFR stages kidney function and is interpreted by nephrology.' },
  { analyteKey: 'total-cholesterol', specialty: 'Cardiology', area: 'cardiovascular risk', rationale: 'Cholesterol is used to estimate cardiovascular risk, managed by cardiology.' },
  { analyteKey: 'ldl', specialty: 'Cardiology', area: 'cardiovascular risk', rationale: 'LDL is a cardiovascular risk marker reviewed by cardiology.' },
  { analyteKey: 'triglycerides', specialty: 'Cardiology', area: 'cardiovascular and metabolic risk', rationale: 'Triglycerides are a cardiovascular risk marker reviewed by cardiology.' },
  { analyteKey: 'tsh', specialty: 'Endocrinology', area: 'thyroid function', rationale: 'TSH screens for thyroid disease, which endocrinology manages.' },
  { analyteKey: 'bilirubin-total', specialty: 'Gastroenterology', area: 'liver function', rationale: 'Bilirubin is a liver marker assessed by gastroenterology.' },
  { analyteKey: 'sgot-ast', specialty: 'Gastroenterology', area: 'liver function', rationale: 'AST is a liver enzyme assessed by gastroenterology.' },
  { analyteKey: 'sgpt-alt', specialty: 'Gastroenterology', area: 'liver function', rationale: 'ALT is a liver enzyme assessed by gastroenterology.' },
  { analyteKey: 'sodium', specialty: 'General Medicine', area: 'fluid and electrolyte balance', rationale: 'Sodium balance is assessed by a physician.' },
  { analyteKey: 'potassium', specialty: 'Nephrology', area: 'electrolyte and kidney function', rationale: 'Potassium is tightly regulated by the kidneys and is assessed by nephrology.' },
  { analyteKey: 'esr', specialty: 'Rheumatology', area: 'inflammation', rationale: 'ESR is a general inflammation marker, often reviewed by rheumatology.' },
];

const BY_KEY = new Map(ANALYTE_SPECIALTY.map((l) => [l.analyteKey, l]));

/** The mapping for one analyte key, or null when no service link is known. */
export function analyteSpecialtyLink(analyteKey: string | null | undefined): AnalyteSpecialtyLink | null {
  if (!analyteKey) return null;
  return BY_KEY.get(analyteKey) ?? null;
}

/**
 * De-duplicated service links for a set of analyte keys, preserving the order of
 * the keys given (callers pass the most concerning values first).
 */
export function specialtiesForAnalyteKeys(keys: (string | null | undefined)[]): AnalyteSpecialtyLink[] {
  const seen = new Set<string>();
  const out: AnalyteSpecialtyLink[] = [];
  for (const key of keys) {
    const link = analyteSpecialtyLink(key);
    if (!link || seen.has(link.specialty)) continue;
    seen.add(link.specialty);
    out.push(link);
  }
  return out;
}

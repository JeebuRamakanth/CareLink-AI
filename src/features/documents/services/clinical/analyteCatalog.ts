/**
 * CareLink-AI — clinical reference catalog (DETERMINISTIC SAFETY FLOOR).
 *
 * ⚠️ CLINICAL GOVERNANCE REQUIRED
 * Every threshold below is a *reference* used to (a) fall back when a report
 * does not print its own interval and (b) drive the deterministic urgency
 * triage. Per the CareLink safety specification these MUST be reviewed and
 * signed off by qualified clinical personnel before production use, and the
 * critical-value bands must be validated against the labs actually served.
 * `CATALOG_VERSION` + `CATALOG_REVIEWED` are surfaced in the UI so an
 * unreviewed catalog is visible, never hidden.
 *
 * RULES ENCODED HERE:
 * 1. The LAB'S OWN printed reference interval ALWAYS wins over this catalog.
 * 2. A critical band is NOT the same concept as a reference interval — a value
 *    can be "within reference range" and still critical in a clinical context
 *    only for specific analytes that define their own critical limits.
 * 3. Units are explicit. A value whose unit cannot be reconciled is NEVER
 *    converted — it is reported as `unit-mismatch` and left for a human.
 * 4. Nothing here diagnoses. It only decides "how urgent is it that a human
 *    looks at this".
 *
 * Sources used to seed the adult intervals and critical bands (all widely
 * published reference material; see `source` per analyte):
 *   - Tietz / standard clinical chemistry reference intervals
 *   - WHO anaemia haemoglobin thresholds
 *   - ADA fasting-glucose / HbA1c diagnostic reference points
 *   - Adult critical-value lists used by hospital laboratories
 * These are reference points, not treatment targets, and not a substitute for
 * the reporting laboratory's own intervals.
 */

/** Bump when any interval/threshold changes so results stay traceable. */
export const CATALOG_VERSION = '1.0.0';

/** Whether a qualified clinician has reviewed this catalog. */
export const CATALOG_REVIEWED = false;

export type Sex = 'male' | 'female' | 'unknown';

/** A numeric interval in a canonical unit. */
export interface Interval {
  low: number;
  high: number;
}

/** An analyte definition. `unit` is the canonical unit for the intervals. */
export interface AnalyteDefinition {
  /** Stable key. */
  key: string;
  /** Preferred display name. */
  name: string;
  /** Lower-cased aliases / abbreviations as they appear on reports. */
  aliases: string[];
  /** Canonical unit the intervals below are expressed in. */
  unit: string;
  /** Accepted spellings of the canonical unit (for reconciliation). */
  unitAliases: string[];
  /** Adult reference interval (sex-independent when the two are equal). */
  reference: { male: Interval; female: Interval };
  /**
   * Critical bands. A value below `low` or above `high` is a laboratory
   * critical value that conventionally triggers urgent clinician notification.
   * Omitted when the analyte has no established critical band.
   */
  critical?: { low?: number; high?: number };
  /** Short plain-language explanation of what the test measures. */
  about: string;
  /** Why clinicians commonly order it. */
  whyOrdered: string;
  /** Provenance label for the interval/critical band. */
  source: string;
}

const IV = (low: number, high: number): Interval => ({ low, high });

/**
 * The catalog. Keys are stable; aliases are matched case-insensitively against
 * the test name column of the report.
 */
export const ANALYTES: AnalyteDefinition[] = [
  {
    key: 'hemoglobin',
    name: 'Haemoglobin',
    aliases: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'],
    unit: 'g/dL',
    unitAliases: ['g/dl', 'gm/dl', 'g/l', 'g%'],
    reference: { male: IV(13, 17), female: IV(12, 15) },
    critical: { low: 7, high: 20 },
    about: 'Measures the oxygen-carrying protein in red blood cells.',
    whyOrdered: 'Used to detect anaemia or polycythaemia and to assess bleeding or chronic disease.',
    source: 'WHO anaemia thresholds + standard clinical chemistry intervals',
  },
  {
    key: 'wbc',
    name: 'Total leucocyte count (WBC)',
    aliases: ['wbc', 'tlc', 'total leucocyte count', 'total leukocyte count', 'white blood cell', 'leucocytes'],
    unit: '10^3/µL',
    unitAliases: ['10^3/ul', '10^3/µl', 'k/ul', '/cumm', 'cells/cumm', 'x10^3/ul', '10*3/ul'],
    reference: { male: IV(4, 11), female: IV(4, 11) },
    critical: { low: 2, high: 30 },
    about: 'Counts the infection-fighting white blood cells.',
    whyOrdered: 'Used to look for infection, inflammation, immune disorders, or bone-marrow problems.',
    source: 'Standard haematology reference intervals',
  },
  {
    key: 'platelets',
    name: 'Platelet count',
    aliases: ['platelet', 'platelets', 'plt', 'platelet count'],
    unit: '10^3/µL',
    unitAliases: ['10^3/ul', '10^3/µl', 'lakhs/cumm', 'lakh/cumm', '/cumm', 'x10^3/ul'],
    reference: { male: IV(150, 410), female: IV(150, 410) },
    critical: { low: 50, high: 1000 },
    about: 'Counts the cell fragments that help blood clot.',
    whyOrdered: 'Used to assess bleeding risk, clotting disorders, and dengue/other infections.',
    source: 'Standard haematology reference intervals',
  },
  {
    key: 'fasting-glucose',
    name: 'Fasting plasma glucose',
    aliases: ['fasting glucose', 'fasting blood sugar', 'fbs', 'fpg', 'glucose fasting', 'fasting plasma glucose'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'mmol/l'],
    reference: { male: IV(70, 99), female: IV(70, 99) },
    critical: { low: 54, high: 250 },
    about: 'Measures blood sugar after an overnight fast.',
    whyOrdered: 'Used to screen for and monitor diabetes and to investigate hypoglycaemia.',
    source: 'ADA diagnostic reference points',
  },
  {
    key: 'hba1c',
    name: 'HbA1c (glycated haemoglobin)',
    aliases: ['hba1c', 'glycated hemoglobin', 'glycated haemoglobin', 'a1c', 'glycosylated hemoglobin'],
    unit: '%',
    unitAliases: ['%', 'percent'],
    reference: { male: IV(4, 5.6), female: IV(4, 5.6) },
    critical: { high: 10 },
    about: 'Reflects average blood sugar over roughly the previous three months.',
    whyOrdered: 'Used to diagnose and monitor long-term diabetes control.',
    source: 'ADA diagnostic reference points',
  },
  {
    key: 'creatinine',
    name: 'Serum creatinine',
    aliases: ['creatinine', 'serum creatinine', 's. creatinine'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'µmol/l', 'umol/l'],
    reference: { male: IV(0.7, 1.3), female: IV(0.6, 1.1) },
    critical: { high: 4 },
    about: 'A waste product filtered by the kidneys.',
    whyOrdered: 'Used to assess kidney function and monitor kidney-affecting medicines.',
    source: 'Standard clinical chemistry intervals',
  },
  {
    key: 'egfr',
    name: 'eGFR',
    aliases: ['egfr', 'gfr', 'estimated gfr'],
    unit: 'mL/min/1.73m²',
    unitAliases: ['ml/min/1.73m2', 'ml/min'],
    reference: { male: IV(90, 200), female: IV(90, 200) },
    critical: { low: 15 },
    about: 'Estimates how well the kidneys are filtering.',
    whyOrdered: 'Used to stage chronic kidney disease and adjust medicine doses.',
    source: 'KDIGO staging reference points',
  },
  {
    key: 'total-cholesterol',
    name: 'Total cholesterol',
    aliases: ['total cholesterol', 'cholesterol total', 'cholesterol'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'mmol/l'],
    reference: { male: IV(0, 200), female: IV(0, 200) },
    about: 'Measures the total amount of cholesterol in the blood.',
    whyOrdered: 'Used to estimate cardiovascular risk.',
    source: 'Standard lipid reference intervals',
  },
  {
    key: 'ldl',
    name: 'LDL cholesterol',
    aliases: ['ldl', 'ldl cholesterol', 'ldl-c', 'low density lipoprotein'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'mmol/l'],
    reference: { male: IV(0, 100), female: IV(0, 100) },
    about: 'The cholesterol fraction most associated with artery disease.',
    whyOrdered: 'Used to guide cardiovascular risk assessment and treatment.',
    source: 'Standard lipid reference intervals',
  },
  {
    key: 'triglycerides',
    name: 'Triglycerides',
    aliases: ['triglycerides', 'triglyceride', 'tg'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'mmol/l'],
    reference: { male: IV(0, 150), female: IV(0, 150) },
    critical: { high: 500 },
    about: 'Measures a type of blood fat linked to diet and metabolic health.',
    whyOrdered: 'Used to assess cardiovascular and pancreatitis risk.',
    source: 'Standard lipid reference intervals',
  },
  {
    key: 'tsh',
    name: 'TSH (thyroid stimulating hormone)',
    aliases: ['tsh', 'thyroid stimulating hormone', 'thyrotropin'],
    unit: 'µIU/mL',
    unitAliases: ['µiu/ml', 'uiu/ml', 'miu/l', 'μiu/ml'],
    reference: { male: IV(0.4, 4.5), female: IV(0.4, 4.5) },
    critical: { low: 0.05, high: 20 },
    about: 'A pituitary hormone that controls thyroid activity.',
    whyOrdered: 'Used to screen for an under- or over-active thyroid.',
    source: 'Standard thyroid reference intervals',
  },
  {
    key: 'bilirubin-total',
    name: 'Total bilirubin',
    aliases: ['total bilirubin', 'bilirubin total', 'bilirubin'],
    unit: 'mg/dL',
    unitAliases: ['mg/dl', 'µmol/l', 'umol/l'],
    reference: { male: IV(0.2, 1.2), female: IV(0.2, 1.2) },
    critical: { high: 15 },
    about: 'A yellow pigment produced when red blood cells break down.',
    whyOrdered: 'Used to assess liver function and jaundice.',
    source: 'Standard liver-function reference intervals',
  },
  {
    key: 'sgot-ast',
    name: 'SGOT (AST)',
    aliases: ['sgot', 'ast', 'aspartate transaminase', 'aspartate aminotransferase'],
    unit: 'U/L',
    unitAliases: ['u/l', 'iu/l', 'units/l'],
    reference: { male: IV(0, 40), female: IV(0, 32) },
    about: 'A liver enzyme that leaks into blood when liver cells are injured.',
    whyOrdered: 'Used to investigate liver damage.',
    source: 'Standard liver-function reference intervals',
  },
  {
    key: 'sgpt-alt',
    name: 'SGPT (ALT)',
    aliases: ['sgpt', 'alt', 'alanine transaminase', 'alanine aminotransferase'],
    unit: 'U/L',
    unitAliases: ['u/l', 'iu/l', 'units/l'],
    reference: { male: IV(0, 41), female: IV(0, 33) },
    about: 'A liver enzyme more specific to the liver than AST.',
    whyOrdered: 'Used to investigate liver damage.',
    source: 'Standard liver-function reference intervals',
  },
  {
    key: 'sodium',
    name: 'Sodium',
    aliases: ['sodium', 'na', 'na+'],
    unit: 'mmol/L',
    unitAliases: ['mmol/l', 'meq/l'],
    reference: { male: IV(135, 145), female: IV(135, 145) },
    critical: { low: 120, high: 160 },
    about: 'The main salt in body fluids, controlling fluid balance.',
    whyOrdered: 'Used to assess hydration, kidney, and hormone problems.',
    source: 'Standard electrolyte reference intervals',
  },
  {
    key: 'potassium',
    name: 'Potassium',
    aliases: ['potassium', 'k', 'k+'],
    unit: 'mmol/L',
    unitAliases: ['mmol/l', 'meq/l'],
    reference: { male: IV(3.5, 5.1), female: IV(3.5, 5.1) },
    critical: { low: 2.5, high: 6.5 },
    about: 'A mineral that is critical for heart and muscle function.',
    whyOrdered: 'Used to detect dangerous electrolyte imbalances.',
    source: 'Standard electrolyte reference intervals',
  },
  {
    key: 'esr',
    name: 'ESR',
    aliases: ['esr', 'erythrocyte sedimentation rate'],
    unit: 'mm/hr',
    unitAliases: ['mm/hr', 'mm/1hr', 'mm/h'],
    reference: { male: IV(0, 15), female: IV(0, 20) },
    about: 'A non-specific marker of inflammation.',
    whyOrdered: 'Used to help detect inflammation or infection.',
    source: 'Standard haematology reference intervals',
  },
];

/** Look up an analyte by a report test name. */
export function findAnalyte(testName: string): AnalyteDefinition | null {
  const n = testName.toLowerCase().replace(/[^a-z0-9%+. ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  let best: { def: AnalyteDefinition; score: number } | null = null;
  for (const def of ANALYTES) {
    for (const alias of def.aliases) {
      // Whole-word/whole-phrase match so "k" never matches inside "creatinine".
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\s)${escaped}($|\\s)`, 'i');
      if (re.test(n)) {
        const score = alias.length;
        if (!best || score > best.score) best = { def, score };
      }
    }
  }
  return best?.def ?? null;
}

/**
 * CareLink-AI — medicine information sources (keyless, authoritative).
 *
 * Two public, key-free APIs are used to VERIFY a medicine name rather than
 * guess it from a photograph:
 *
 *   - RxNorm (US NLM)      — normalises a brand/ingredient name and returns the
 *                            canonical generic ingredient + RxCUI.
 *   - openFDA drug label   — returns the official label sections (indications,
 *                            adverse reactions, warnings, dosage & administration,
 *                            Rx/OTC status) for a matched drug.
 *
 * Both are public reference databases, not Indian regulatory data, so the
 * result is labelled with its source and the app never presents it as a local
 * prescribing decision. Requests are bounded, timed out, and never retried.
 *
 * PRIVACY: only the medicine NAME the user typed (or read from a label) is sent.
 * No patient data, no images, no identifiers.
 */

import type { EvidenceReference } from '../../types';

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';
const REQUEST_TIMEOUT_MS = 9000;

export interface MedicineLookup {
  /** The name that was looked up (as entered/read). */
  query: string;
  /** Canonical generic ingredient, when RxNorm resolved one. */
  genericName: string | null;
  /** RxNorm concept id, when resolved. */
  rxcui: string | null;
  /** Verified common uses, from the label's indications section. */
  uses: string[];
  /** Verified side effects, from the label's adverse-reactions section. */
  sideEffects: string[];
  /** Verified serious warnings (boxed warning + warnings sections). */
  seriousWarnings: string[];
  /** Reference dosage text from the label (never a patient-specific dose). */
  referenceDosage: string | null;
  /** True when the label indicates a prescription-only product. */
  prescriptionRequired: boolean | null;
  /** Manufacturer/brand name from the label, when present. */
  manufacturer: string | null;
  /** Evidence citations for everything above. */
  evidence: EvidenceReference[];
  /** What could not be verified. */
  unverified: string[];
}

/** Whether the external medicine sources are reachable in principle. */
export function medicineSourcesAvailable(): boolean {
  return typeof fetch === 'function';
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

/** Collapse a long label paragraph into readable, bounded sentences. */
function toBullets(value: unknown, max = 4, maxChars = 240): string[] {
  const items = strArray(value);
  const out: string[] = [];
  for (const item of items) {
    for (const sentence of item.split(/(?<=[.;])\s+(?=[A-Z0-9])/)) {
      const s = sentence.replace(/\s+/g, ' ').trim();
      if (s.length < 12) continue;
      out.push(s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Resolve a name to a canonical generic ingredient via RxNorm. */
export async function resolveGenericName(name: string): Promise<{ generic: string | null; rxcui: string | null; evidence: EvidenceReference[] }> {
  const q = name.trim().slice(0, 80);
  if (!q) return { generic: null, rxcui: null, evidence: [] };

  // Try the exact-name endpoint first, then the approximate (spelling) match.
  const exact = await fetchJson(`${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(q)}&search=2`);
  let rxcui: string | null = null;
  const exactIds = exact && typeof exact === 'object' && 'idGroup' in exact ? (exact as { idGroup?: { rxnormId?: unknown } }).idGroup?.rxnormId : null;
  const ids = strArray(exactIds);
  if (ids.length > 0) rxcui = ids[0];

  const evidence: EvidenceReference[] = [];
  if (!rxcui) {
    const approx = await fetchJson(`${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=1`);
    const candidate = approx && typeof approx === 'object' && 'approximateGroup' in approx
      ? (approx as { approximateGroup?: { candidate?: unknown } }).approximateGroup?.candidate
      : null;
    if (Array.isArray(candidate) && candidate.length > 0) {
      const c = candidate[0] as { rxcui?: unknown };
      rxcui = str(c.rxcui);
    }
  }
  if (!rxcui) return { generic: null, rxcui: null, evidence: [] };

  const props = await fetchJson(`${RXNORM_BASE}/rxcui/${rxcui}/properties.json`);
  const generic = props && typeof props === 'object' && 'properties' in props
    ? str((props as { properties?: { name?: unknown } }).properties?.name)
    : null;

  evidence.push({
    label: 'RxNorm (US National Library of Medicine)',
    url: `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`,
    retrievedAt: new Date().toISOString(),
    supports: 'Generic ingredient name and concept identifier.',
  });

  return { generic, rxcui, evidence };
}

/** Look up the official label for a medicine name via openFDA. */
export async function lookupDrugLabel(name: string): Promise<{ label: Omit<MedicineLookup, 'query' | 'genericName' | 'rxcui'> | null; evidence: EvidenceReference[] }> {
  const q = name.trim().slice(0, 80);
  if (!q) return { label: null, evidence: [] };

  const query = `openfda.brand_name:"${q}"+openfda.generic_name:"${q}"`;
  const json = await fetchJson(`${OPENFDA_BASE}?search=${encodeURIComponent(query)}&limit=1`);
  const results = json && typeof json === 'object' && 'results' in json ? (json as { results?: unknown }).results : null;
  const first = Array.isArray(results) && results.length > 0 ? (results[0] as Record<string, unknown>) : null;
  if (!first) return { label: null, evidence: [] };

  const openfda = (first.openfda ?? {}) as Record<string, unknown>;
  const boxedWarning = toBullets(first.boxed_warning, 3);
  const warnings = toBullets(first.warnings, 3);
  const adverse = toBullets(first.adverse_reactions, 4);
  const indications = toBullets(first.indications_and_usage, 4);
  const dosage = toBullets(first.dosage_and_administration, 2, 400);

  const manufacturer = strArray(openfda.manufacturer_name)[0] ?? null;
  const productType = strArray(openfda.product_type).map((t) => t.toLowerCase());
  const prescriptionRequired = productType.length > 0 ? productType.some((t) => t.includes('prescription')) : null;

  return {
    label: {
      uses: indications,
      sideEffects: adverse,
      seriousWarnings: [...boxedWarning, ...warnings],
      referenceDosage: dosage.length > 0 ? dosage.join(' ') : null,
      prescriptionRequired,
      manufacturer,
      evidence: [
        {
          label: 'openFDA drug label',
          url: `${OPENFDA_BASE}?search=${encodeURIComponent(query)}`,
          retrievedAt: new Date().toISOString(),
          supports: 'Indications, adverse reactions, warnings and dosage from the official product label.',
        },
      ],
      unverified: [],
    },
    evidence: [],
  };
}

/**
 * Full verification lookup: resolve the generic name AND fetch the label.
 * Returns null when neither source recognises the name (the caller must then
 * present an UNCERTAIN candidate, never an invented identification).
 */
export async function verifyMedicine(name: string): Promise<MedicineLookup | null> {
  const trimmed = name.trim();
  if (trimmed.length < 3) return null;

  const [genericRes, labelRes] = await Promise.all([resolveGenericName(trimmed), lookupDrugLabel(trimmed)]);
  if (!genericRes.rxcui && !labelRes.label) return null;

  const unverified: string[] = [];
  if (!genericRes.generic) unverified.push('generic ingredient name');
  if (!labelRes.label) unverified.push('official label sections');

  return {
    query: trimmed,
    genericName: genericRes.generic,
    rxcui: genericRes.rxcui,
    uses: labelRes.label?.uses ?? [],
    sideEffects: labelRes.label?.sideEffects ?? [],
    seriousWarnings: labelRes.label?.seriousWarnings ?? [],
    referenceDosage: labelRes.label?.referenceDosage ?? null,
    prescriptionRequired: labelRes.label?.prescriptionRequired ?? null,
    manufacturer: labelRes.label?.manufacturer ?? null,
    evidence: [...genericRes.evidence, ...(labelRes.label?.evidence ?? [])],
    unverified,
  };
}

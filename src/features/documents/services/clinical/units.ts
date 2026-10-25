/**
 * CareLink-AI — units + reference-interval reconciliation.
 *
 * Two jobs, both safety-critical:
 * 1. Reconcile the UNIT printed on the report with the catalog's canonical
 *    unit. Only conversions with an exact, verified factor are applied. An
 *    unrecognised unit yields `unit-mismatch` and the value is NEVER converted.
 * 2. Reconcile the report's OWN reference interval with the catalog interval.
 *    The report's interval is authoritative; the catalog is only a fallback.
 *
 * No conversion is ever applied silently — the caller records the original
 * value/unit alongside the normalised one so nothing is lost.
 */

import type { Interval } from './analyteCatalog';

export type { Interval };

export type UnitStatus = 'match' | 'converted' | 'unit-mismatch' | 'unit-absent';

export interface UnitReconciliation {
  status: UnitStatus;
  /** The canonical unit the value is expressed in after reconciliation. */
  canonicalUnit: string;
  /** The unit exactly as printed on the report. */
  reportedUnit: string;
  /** Multiplicative factor applied to the reported value (1 when none). */
  factor: number;
  /** Human-readable note for the UI (never shown when status === 'match'). */
  note?: string;
}

/**
 * Verified conversion factors keyed `from|to:family`. Only factors that are
 * exact by definition (SI prefixes / established clinical factors) appear here.
 *
 * NOTE ON `/cumm`: "cells per cubic millimetre" equals cells/µL, so a value in
 * `/cumm` is 1000x the same value expressed in `10^3/µL` — the factor below is
 * 0.001, NOT 1. Getting this wrong would silently change a reported count.
 */
const CONVERSIONS: Record<string, number> = {
  // glucose & cholesterol mass ↔ molar
  'mmol/l|mg/dl:glucose': 18.0182,
  'mmol/l|mg/dl:cholesterol': 38.67,
  'mmol/l|mg/dl:triglyceride': 88.57,
  'mmol/l|mg/dl:creatinine': 88.4,
  'umol/l|mg/dl:creatinine': 88.4,
  'umol/l|mg/dl:bilirubin': 58.44,
  'mmol/l|mg/dl:bilirubin': 58.44,
  // haematology count units that denote the same magnitude (factor 1)
  'k/ul|10^3/µl': 1,
  'x10^3/ul|10^3/µl': 1,
  '10*3/ul|10^3/µl': 1,
  '10^3/ul|10^3/µl': 1,
  // absolute cell counts → thousands/µL (exact 1/1000)
  'cumm|10^3/µl': 0.001,
  'cells/cumm|10^3/µl': 0.001,
  'cells/mm3|10^3/µl': 0.001,
  '/cumm|10^3/µl': 0.001,
  // lakh/cumm = 100,000 cells/µL = 100 x 10^3/µL
  'lakh/cumm|10^3/µl': 100,
  'lakhs/cumm|10^3/µl': 100,
  // thyroid
  'miu/l|µiu/ml': 1,
  'uiu/ml|µiu/ml': 1,
};

const normalizeUnitToken = (u: string): string =>
  u
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/μ/g, 'µ')
    // 'u' and 'µ' are used interchangeably for micro- in lab reports
    // ("uL" vs "µL", "uIU/mL" vs "µIU/mL"). Normalise before comparing.
    .replace(/ul\b/g, 'µl')
    .replace(/uiu/g, 'µiu')
    .replace(/^u\//, 'µ/')
    .replace(/×/g, 'x')
    .replace(/\*/g, '^');

/**
 * Reconcile a reported unit against the canonical unit for an analyte.
 * `family` selects the correct mass↔molar factor (glucose vs cholesterol …).
 */
export function reconcileUnit(reportedUnit: string, canonicalUnit: string, family?: string): UnitReconciliation {
  const reported = (reportedUnit ?? '').trim();
  if (!reported) return { status: 'unit-absent', canonicalUnit, reportedUnit: '', factor: 1, note: 'The report did not print a unit for this value.' };

  const r = normalizeUnitToken(reported);
  const c = normalizeUnitToken(canonicalUnit);
  if (r === c) return { status: 'match', canonicalUnit, reportedUnit: reported, factor: 1 };

  // Family-specific factors are keyed `from|to:family`; family-independent ones
  // are keyed `from|to`. The lookup must use the SAME shape or the entry is dead.
  const base = `${r}|${c}`;
  const factor = family !== undefined && CONVERSIONS[`${base}:${family}`] !== undefined
    ? CONVERSIONS[`${base}:${family}`]
    : CONVERSIONS[base];
  if (factor !== undefined) {
    return { status: 'converted', canonicalUnit, reportedUnit: reported, factor, note: `Converted from ${reported} to ${canonicalUnit}.` };
  }

  return {
    status: 'unit-mismatch',
    canonicalUnit,
    reportedUnit: reported,
    factor: 1,
    note: `The unit "${reported}" could not be reconciled with ${canonicalUnit}. The value is shown as printed and was not converted.`,
  };
}

export type IntervalSource = 'report' | 'catalog' | 'none';

export interface IntervalReconciliation {
  interval: Interval | null;
  source: IntervalSource;
  /** The raw text of the report's interval, when one was printed. */
  reportedText: string | null;
}

/**
 * Pick the authoritative interval: the report's own printed interval wins,
 * the catalog is only a fallback. `reportInterval` is the parsed interval.
 */
export function reconcileInterval(
  reportInterval: Interval | null,
  reportedText: string | null,
  catalogInterval: Interval | null
): IntervalReconciliation {
  if (reportInterval) return { interval: reportInterval, source: 'report', reportedText };
  if (catalogInterval) return { interval: catalogInterval, source: 'catalog', reportedText: null };
  return { interval: null, source: 'none', reportedText: null };
}

/**
 * Parse a reference-interval string such as:
 *   "13.0 - 17.0", "13–17", "< 200", "less than 200", "> 40", "70 to 99",
 *   "up to 5.7", "0.4-4.5".
 * Returns null when the text is not a recognisable interval (never guesses).
 */
export function parseInterval(text: string): Interval | null {
  if (!text) return null;
  const t = text.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();

  const range = t.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low <= high) return { low, high };
  }

  const lt = t.match(/(?:<|less than|up to|upto|below|max(?:imum)?)\s*(-?\d+(?:\.\d+)?)/i);
  if (lt) {
    const high = Number(lt[1]);
    if (Number.isFinite(high)) return { low: 0, high };
  }

  const gt = t.match(/(?:>|greater than|above|min(?:imum)?|more than)\s*(-?\d+(?:\.\d+)?)/i);
  if (gt) {
    const low = Number(gt[1]);
    if (Number.isFinite(low)) return { low, high: Number.POSITIVE_INFINITY };
  }

  return null;
}

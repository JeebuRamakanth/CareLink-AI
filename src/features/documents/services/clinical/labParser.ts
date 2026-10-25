/**
 * CareLink-AI — laboratory report parser (deterministic).
 *
 * Parses structured rows out of the REAL text an extraction backend produced:
 *   Test name | value | unit | reference interval | lab flag
 *
 * DESIGN RULES (all safety-critical):
 * - Nothing is invented. A row that cannot be parsed is returned as an
 *   unparsed line so the UI can show exactly what could not be read.
 * - The report's own reference interval is captured verbatim and preferred over
 *   any catalog interval.
 * - The report's own flag (H/L/High/Low/Positive/A) is preserved separately
 *   from the computed status, so the lab's judgement and ours never blur.
 * - The unit is reconciled explicitly; an unreconcilable unit is flagged and
 *   the value is left un-converted.
 * - A value whose unit cannot be reconciled is NOT compared against a catalog
 *   interval (a numeric comparison across units would be meaningless).
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import { findAnalyte, type AnalyteDefinition } from './analyteCatalog';
import { parseInterval, reconcileUnit, type Interval, type IntervalSource, type UnitStatus } from './units';

export type LabValueStatus = 'normal' | 'attention' | 'abnormal' | 'unknown';

/** How a value's status was decided — shown as evidence in the UI. */
export type StatusBasis = 'report-flag' | 'report-interval' | 'catalog-interval' | 'none';

export interface ParsedLabValue {
  /** Test name exactly as printed. */
  testName: string;
  /** Numeric value when parseable, else null. */
  value: number | null;
  /** Value exactly as printed (preserves decimals/signs/format). */
  rawValue: string;
  /** Unit exactly as printed. */
  unit: string;
  /** Canonical unit after reconciliation (equals `unit` when unchanged). */
  canonicalUnit: string;
  unitStatus: UnitStatus;
  /** Reference interval text exactly as printed. */
  referenceText: string | null;
  /** Parsed interval + where it came from. */
  interval: Interval | null;
  intervalSource: IntervalSource;
  /** The lab's own flag, verbatim (e.g. 'H', 'Low', 'Positive'). */
  reportFlag: string | null;
  /** Our computed status. */
  status: LabValueStatus;
  statusBasis: StatusBasis;
  /** 1-based page the row came from. */
  page: number;
  /** The raw source line (for "view source"). */
  rawLine: string;
  /** Matched catalog analyte, when recognised. */
  analyteKey: string | null;
  /** Plain-language context, only when a catalog analyte matched. */
  about?: string;
  whyOrdered?: string;
  /** True when the value sits in a catalog CRITICAL band. */
  critical: boolean;
  /** Human-readable reason for the critical flag. */
  criticalReason?: string;
}

export interface LabReportParse {
  values: ParsedLabValue[];
  /** Lines that looked like data but could not be parsed. */
  unparsedLines: { line: string; page: number }[];
  /** Detected collection/report date when present. */
  collectionDate: string | null;
  /** True when at least one value was parsed. */
  parsed: boolean;
}

/* ---------------------------------------------------------------------------
 * Line parsing
 * ------------------------------------------------------------------------- */

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
/** A reference interval as a range, a < form, or a > form. */
const INTERVAL = String.raw`(?:-?\d+(?:\.\d+)?\s*(?:-|to|–|—)\s*-?\d+(?:\.\d+)?)|(?:[<>]\s*-?\d+(?:\.\d+)?)|(?:(?:less than|greater than|up to|upto|below|above|max(?:imum)?|min(?:imum)?|more than)\s*-?\d+(?:\.\d+)?)`;
/** A unit token: letters (incl. µ/μ/%/^), slashes, dots, exponent digits.
 *  Supports the common Indian lab forms `10^3/uL`, `x10^3/µL` and `/cumm`. */
const UNIT = String.raw`(?:10\s?\^?\s?\d+\s*/\s*)?\/?[a-zA-Zµμ%][a-zA-Zµμ%0-9^*/.\-]{0,14}`;
/** A lab flag token. Matched as a STANDALONE token only, so the "l" in
 *  "mmol/L" or the "a" in "bananas/L" is never mistaken for a flag. */
const FLAG = String.raw`(?:^|\s)(high|low|normal|abnormal|borderline|positive|negative|h|l|a|n|p|↑|↓)(?=\s|$)`;

/** Tokens that mark a line as a header/label rather than a data row. */
const NON_DATA = /^(patient|name|age|sex|gender|date|report|lab(?:oratory)?|specimen|ref(?:erence)?|unit|result|test|method|sample|reg|uhid|mrn|dr\.?|doctor|address|phone|page|sr\.?\s*no|s\.?\s*no|comments?|investigation|profile)\b/i;

/** Words that look like a unit but are not. */
const STOP_UNITS = new Set(['mg', 'ml', 'g', 'iu', 'u', 'l', 'kg', 'cm', 'and', 'or', 'to', 'the', 'of']);

interface RowParts {
  name: string;
  valueText: string;
  unitText: string;
  intervalText: string | null;
  flagText: string | null;
}

/**
 * Split a candidate row into its parts. The name is everything before the first
 * standalone numeric token; the tail is mined order-independently for a unit,
 * an interval and a flag (the interval is removed before the unit is matched so
 * its digits/operators cannot be mistaken for a unit).
 */
function splitRow(raw: string): RowParts | null {
  const nameMatch = raw.match(new RegExp(String.raw`^(.{2,60}?)\s*[:=]?\s*(${NUMBER})(?=\s|$)`));
  if (!nameMatch) return null;
  const name = nameMatch[1].replace(/[.:\-–—]+$/, '').trim();
  const valueText = nameMatch[2];
  if (name.length < 2 || /^\d+$/.test(name) || STOP_UNITS.has(name.toLowerCase())) return null;
  // A test name must be mostly words: reject OCR noise and question-mark rows.
  if ((name.match(/[A-Za-z]/g) ?? []).length < 3) return null;
  if (/[?]{2,}|[|]{2,}/.test(name)) return null;

  const tail = raw.slice(nameMatch[0].length).trim();
  if (!tail) return { name, valueText, unitText: '', intervalText: null, flagText: null };

  let remainder = tail;
  let intervalText: string | null = null;
  const intervalMatch = remainder.match(new RegExp(INTERVAL, 'i'));
  if (intervalMatch) {
    intervalText = intervalMatch[0].trim();
    const at = intervalMatch.index ?? 0;
    remainder = (remainder.slice(0, at) + ' ' + remainder.slice(at + intervalMatch[0].length)).trim();
  }

  let flagText: string | null = null;
  const flagMatch = remainder.match(new RegExp(FLAG, 'i'));
  if (flagMatch) {
    flagText = flagMatch[0].trim();
    const at = flagMatch.index ?? 0;
    remainder = (remainder.slice(0, at) + ' ' + remainder.slice(at + flagMatch[0].length)).trim();
  }

  const unitMatch = remainder.match(new RegExp(UNIT));
  const unitText = unitMatch && !STOP_UNITS.has(unitMatch[0].toLowerCase()) ? unitMatch[0].trim() : '';

  return { name, valueText, unitText, intervalText, flagText };
}

const normalizeFlag = (raw: string | null): string | null => {
  if (!raw) return null;
  const f = raw.trim().toLowerCase();
  const map: Record<string, string> = { h: 'High', l: 'Low', a: 'Abnormal', n: 'Normal', p: 'Positive', '↑': 'High', '↓': 'Low' };
  return map[f] ?? raw.trim();
};

function familyFor(analyte: AnalyteDefinition | null): string | undefined {
  if (!analyte) return undefined;
  if (analyte.key === 'fasting-glucose' || analyte.key === 'hba1c') return 'glucose';
  if (analyte.key === 'total-cholesterol' || analyte.key === 'ldl') return 'cholesterol';
  if (analyte.key === 'triglycerides') return 'triglyceride';
  if (analyte.key === 'creatinine') return 'creatinine';
  if (analyte.key === 'bilirubin-total') return 'bilirubin';
  return undefined;
}

/**
 * Catalog fallback interval. Without a known sex we take the UNION of the male
 * and female intervals so a value is never flagged abnormal purely because we
 * assumed the wrong sex.
 */
export function catalogIntervalFor(analyte: AnalyteDefinition | null): Interval | null {
  if (!analyte) return null;
  return {
    low: Math.min(analyte.reference.male.low, analyte.reference.female.low),
    high: Math.max(analyte.reference.male.high, analyte.reference.female.high),
  };
}

interface StatusDecision {
  status: LabValueStatus;
  basis: StatusBasis;
  critical: boolean;
  criticalReason?: string;
}

/**
 * Decide a value's status. Priority:
 *   1. The report's own flag (the lab's judgement) — highest trust.
 *   2. The report's own printed interval.
 *   3. The catalog interval (only when the unit reconciled).
 * A catalog CRITICAL band is evaluated independently, because a critical value
 * is a distinct concept from a reference-range excursion.
 */
function decideStatus(args: {
  rawValue: number;
  normalized: number;
  comparable: boolean;
  reportFlag: string | null;
  interval: Interval | null;
  intervalSource: IntervalSource;
  analyte: AnalyteDefinition | null;
}): StatusDecision {
  const { rawValue, normalized, comparable, reportFlag, interval, intervalSource, analyte } = args;

  let critical = false;
  let criticalReason: string | undefined;
  if (analyte?.critical && comparable) {
    const { low, high } = analyte.critical;
    if (low !== undefined && normalized < low) {
      critical = true;
      criticalReason = `${analyte.name} is below the critical low limit (${low} ${analyte.unit}).`;
    } else if (high !== undefined && normalized > high) {
      critical = true;
      criticalReason = `${analyte.name} is above the critical high limit (${high} ${analyte.unit}).`;
    }
  }

  if (reportFlag) {
    const f = reportFlag.toLowerCase();
    if (/^(normal|n|negative)$/.test(f)) return { status: 'normal', basis: 'report-flag', critical, criticalReason };
    if (/^borderline$/.test(f)) return { status: 'attention', basis: 'report-flag', critical, criticalReason };
    if (/^(high|h|low|l|abnormal|a|positive|p|↑|↓)$/.test(f)) {
      return { status: 'abnormal', basis: 'report-flag', critical, criticalReason };
    }
  }

  if (interval && comparable) {
    // CRITICAL: the report's OWN interval is expressed in the REPORTED unit, so
    // it must be compared against the raw value. Only a catalog interval (which
    // is expressed in the canonical unit) may be compared against the value
    // after unit reconciliation. Mixing these silently misclassifies every row
    // whose reported unit differs in magnitude from the canonical unit.
    const basis: StatusBasis = intervalSource === 'catalog' ? 'catalog-interval' : 'report-interval';
    const candidate = intervalSource === 'catalog' ? normalized : rawValue;
    if (candidate < interval.low || candidate > interval.high) {
      return { status: 'abnormal', basis, critical, criticalReason };
    }
    return { status: 'normal', basis, critical, criticalReason };
  }

  return { status: 'unknown', basis: 'none', critical, criticalReason };
}

/**
 * Parse one line of a lab report into a value row, or null. Only lines that
 * contain a numeric value AND a name with letters are accepted.
 */
export function parseLabLine(line: string, page: number): ParsedLabValue | null {
  const raw = line.replace(/\s+/g, ' ').trim();
  if (raw.length < 4 || raw.length > 200) return null;
  if (NON_DATA.test(raw)) return null;

  const parts = splitRow(raw);
  if (!parts) return null;

  const value = Number(parts.valueText);
  if (!Number.isFinite(value)) return null;

  const analyte = findAnalyte(parts.name);
  const unitRecon = reconcileUnit(
    parts.unitText || (analyte?.unit ?? ''),
    analyte?.unit ?? parts.unitText ?? '',
    familyFor(analyte)
  );
  const reportedInterval = parseInterval(parts.intervalText ?? '');
  const catalogInterval = catalogIntervalFor(analyte);

  let interval: Interval | null = null;
  let intervalSource: IntervalSource = 'none';
  if (reportedInterval) {
    interval = reportedInterval;
    intervalSource = 'report';
  } else if (catalogInterval) {
    interval = catalogInterval;
    intervalSource = 'catalog';
  }

  const reportFlag = normalizeFlag(parts.flagText);
  const comparable = unitRecon.status === 'match' || unitRecon.status === 'converted';
  const normalized = comparable ? value * unitRecon.factor : value;

  const { status, basis, critical, criticalReason } = decideStatus({
    rawValue: value,
    normalized,
    comparable,
    reportFlag,
    interval,
    intervalSource,
    analyte,
  });

  return {
    testName: parts.name,
    value,
    rawValue: parts.valueText,
    unit: parts.unitText,
    canonicalUnit: unitRecon.canonicalUnit,
    unitStatus: unitRecon.status,
    referenceText: parts.intervalText,
    interval,
    intervalSource,
    reportFlag,
    status,
    statusBasis: basis,
    page,
    rawLine: raw,
    analyteKey: analyte?.key ?? null,
    about: analyte?.about,
    whyOrdered: analyte?.whyOrdered,
    critical,
    criticalReason,
  };
}

/** Detect a collection/report date from report text. */
export function detectCollectionDate(text: string): string | null {
  const m = text.match(/\b(?:collected|collection|sample|report(?:ed)?|date)\s*(?:on|date)?\s*[:-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse a full lab report from extracted page text. Iterates every page so each
 * value keeps its page provenance.
 */
export function parseLabReport(pages: { pageNumber: number; text: string }[]): LabReportParse {
  const values: ParsedLabValue[] = [];
  const unparsedLines: { line: string; page: number }[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const line of page.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length < 4) continue;
      const parsed = parseLabLine(trimmed, page.pageNumber);
      if (parsed) {
        const key = `${parsed.testName.toLowerCase()}|${parsed.rawValue}|${parsed.unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(parsed);
      } else if (/\d/.test(trimmed) && /[a-z]/i.test(trimmed) && !NON_DATA.test(trimmed) && trimmed.length < 120) {
        unparsedLines.push({ line: trimmed, page: page.pageNumber });
      }
    }
  }

  const fullText = pages.map((p) => p.text).join('\n');
  return {
    values,
    unparsedLines: unparsedLines.slice(0, 25),
    collectionDate: detectCollectionDate(fullText),
    parsed: values.length > 0,
  };
}

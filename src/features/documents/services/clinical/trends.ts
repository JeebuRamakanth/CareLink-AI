/**
 * CareLink-AI — multi-report trend analysis.
 *
 * Compares laboratory values across several reports of the SAME person. Only
 * comparable measurements are compared: the analyte must resolve to the same
 * catalog key AND the units must reconcile to the same canonical unit.
 *
 * RULES:
 * - Never invent a missing date, value, or trend.
 * - A value with no date is listed but cannot be placed on a timeline.
 * - A unit mismatch between two reports makes them non-comparable; the pair is
 *   reported as such rather than being silently converted.
 * - "Increased / decreased / broadly stable" is a factual comparison of the
 *   reported numbers — never a clinical judgement.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import { findAnalyte } from './analyteCatalog';
import type { ParsedLabValue } from './labParser';
import { reconcileUnit } from './units';

export type TrendDirection = 'increased' | 'decreased' | 'stable' | 'unavailable';

export interface TrendPoint {
  /** Report label the value came from (e.g. the file name). */
  reportLabel: string;
  /** Date as printed, or null when the report had no readable date. */
  date: string | null;
  /** Value exactly as printed. */
  rawValue: string;
  value: number;
  unit: string;
  /** The report's own interval text, when printed. */
  referenceText: string | null;
  /** Whether the value was flagged abnormal in its own report. */
  status: ParsedLabValue['status'];
  /** True when the value sits in a critical band. */
  critical: boolean;
}

export interface AnalyteTrend {
  analyteKey: string;
  analyteName: string;
  canonicalUnit: string;
  points: TrendPoint[];
  direction: TrendDirection;
  /** Absolute change between the first and last comparable point. */
  change: number | null;
  /** Percentage change, rounded, when the first value is non-zero. */
  changePercent: number | null;
  /** True when any point is in a critical band. */
  hasCritical: boolean;
  /** Reason the trend could not be computed, when direction is 'unavailable'. */
  note?: string;
}

export interface ReportInput {
  label: string;
  date: string | null;
  values: ParsedLabValue[];
}

/** A change smaller than this fraction of the mean is reported as stable. */
const STABLE_FRACTION = 0.05;

/**
 * Build per-analyte trends across reports. Ordering is by parsed date when
 * available; undated points are appended at the end and flagged.
 */
export function buildTrends(reports: ReportInput[]): AnalyteTrend[] {
  const byAnalyte = new Map<string, TrendPoint[]>();
  const names = new Map<string, string>();

  for (const report of reports) {
    for (const v of report.values) {
      const analyte = v.analyteKey ? findAnalyte(v.testName) : null;
      const key = analyte?.key ?? (v.analyteKey ?? null);
      if (!key || v.value === null) continue;
      names.set(key, analyte?.name ?? v.testName);
      const list = byAnalyte.get(key) ?? [];
      list.push({
        reportLabel: report.label,
        date: report.date,
        rawValue: v.rawValue,
        value: v.value,
        unit: v.unit || v.canonicalUnit,
        referenceText: v.referenceText,
        status: v.status,
        critical: v.critical,
      });
      byAnalyte.set(key, list);
    }
  }

  const trends: AnalyteTrend[] = [];
  for (const [key, rawPoints] of byAnalyte) {
    if (rawPoints.length < 2) continue;
    const analyte = findAnalyte(names.get(key) ?? key);
    const canonicalUnit = analyte?.unit ?? rawPoints[0].unit;

    // Only keep points whose unit reconciles to the canonical unit.
    const comparable: TrendPoint[] = [];
    let hadMismatch = false;
    for (const p of rawPoints) {
      const recon = reconcileUnit(p.unit, canonicalUnit, familyFor(analyte?.key ?? key));
      if (recon.status === 'match' || recon.status === 'converted') {
        comparable.push({ ...p, value: p.value * recon.factor, unit: canonicalUnit });
      } else {
        hadMismatch = true;
      }
    }

    if (comparable.length < 2) {
      trends.push({
        analyteKey: key,
        analyteName: names.get(key) ?? key,
        canonicalUnit,
        points: rawPoints,
        direction: 'unavailable',
        change: null,
        changePercent: null,
        hasCritical: rawPoints.some((p) => p.critical),
        note: hadMismatch
          ? 'The units differ between reports, so the values could not be compared.'
          : 'Only one comparable measurement was found.',
      });
      continue;
    }

    // Order by date when present; undated points keep their input order.
    const allDated = comparable.every((p) => p.date);
    const dated = comparable.filter((p) => p.date).sort((a, b) => dateValue(a.date) - dateValue(b.date));
    const undated = comparable.filter((p) => !p.date);
    const ordered = allDated ? dated : [...dated, ...undated];

    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const change = Number((last.value - first.value).toFixed(4));
    const mean = (first.value + last.value) / 2 || 1;
    const direction: TrendDirection =
      Math.abs(change) < Math.abs(mean) * STABLE_FRACTION
        ? 'stable'
        : change > 0
          ? 'increased'
          : 'decreased';

    // A trend needs a usable timeline: when some points have no date we cannot
    // order them, so we refuse the direction rather than guess one.
    const orderable = allDated || undated.length === 0;

    trends.push({
      analyteKey: key,
      analyteName: names.get(key) ?? key,
      canonicalUnit,
      points: ordered,
      direction: orderable ? direction : 'unavailable',
      change: orderable ? change : null,
      changePercent: !orderable || first.value === 0 ? null : Math.round((change / first.value) * 100),
      hasCritical: ordered.some((p) => p.critical),
      note: orderable ? undefined : 'Some measurements had no readable date, so a timeline could not be ordered.',
    });
  }

  return trends;
}

function familyFor(key: string): string | undefined {
  if (key === 'fasting-glucose' || key === 'hba1c') return 'glucose';
  if (key === 'total-cholesterol' || key === 'ldl') return 'cholesterol';
  if (key === 'triglycerides') return 'triglyceride';
  if (key === 'creatinine') return 'creatinine';
  if (key === 'bilirubin-total') return 'bilirubin';
  return undefined;
}

/** Best-effort date value for ordering; undated sorts last. */
function dateValue(date: string | null): number {
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(date.replace(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/, (_, d, m, y) => {
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }));
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

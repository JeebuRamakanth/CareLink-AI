/**
 * CareLink-AI — laboratory findings panel.
 *
 * Renders the values ACTUALLY extracted from the report, grouped by urgency:
 * critical → outside range → within range → not interpretable. Each row shows
 * the value, unit, the report's own reference interval, the lab's own flag and
 * our computed status, plus the page it came from.
 *
 * SAFETY:
 * - Never labels the whole report "normal".
 * - A reference interval is presented as the report's own, not a universal
 *   threshold, and is explicitly distinguished from a critical value.
 * - Rows the parser could not interpret are shown, not hidden.
 */

import { useState } from 'react';
import { cn } from '../../../../components/common/cn';
import { IconActivity, IconReport } from '../../../../components/agent/AgentIcons';
import type { ExtractedMedicalValue, LabResult } from '../../types';
import { SectionLabel } from './ExtractionEvidence';

const STATUS_TONE: Record<ExtractedMedicalValue['status'], string> = {
  normal: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  attention: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  abnormal: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
  unknown: 'border-white/12 bg-white/5 text-ink-200',
};

const STATUS_LABEL: Record<ExtractedMedicalValue['status'], string> = {
  normal: 'In range',
  attention: 'Borderline',
  abnormal: 'Out of range',
  unknown: 'Not interpreted',
};

const BASIS_LABEL: Record<string, string> = {
  'report-flag': 'lab flag',
  'report-interval': 'report range',
  'catalog-interval': 'reference catalog',
  none: 'no range',
};

export function LabFindings({ lab }: { lab: LabResult }) {
  const critical = lab.values.filter((v) => v.critical);
  const outOfRange = lab.valuesRequiringAttention.filter((v) => !v.critical);
  const unknown = lab.unknownValues ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Findings extracted from your report</SectionLabel>
        <span className="text-[0.7rem] text-ink-400">
          {lab.values.length} value(s) read
          {lab.pageCount ? ` · ${lab.pageCount} page(s)` : ''}
          {lab.collectionDate ? ` · collected ${lab.collectionDate}` : ''}
        </span>
      </div>

      {critical.length > 0 ? (
        <ValueGroup title="Critical — needs prompt professional review" tone="critical" values={critical} />
      ) : null}
      {outOfRange.length > 0 ? (
        <ValueGroup title="Outside the report's reference range" tone="attention" values={outOfRange} />
      ) : null}
      {lab.normalValues.length > 0 ? (
        <ValueGroup title="Within the report's reference range" tone="normal" values={lab.normalValues} />
      ) : null}
      {unknown.length > 0 ? (
        <ValueGroup title="Not interpreted (unreadable unit or missing range)" tone="unknown" values={unknown} />
      ) : null}

      {lab.values.length === 0 ? (
        <p className="rounded-[0.8rem] border border-white/10 bg-white/5 px-3 py-2.5 text-[0.8rem] text-ink-300">
          No laboratory value rows could be recognised in this document.
        </p>
      ) : null}

      <p className="text-[0.72rem] italic text-ink-400">
        A reference interval is not a universal threshold, and a critical range is a separate concept. Do not change any
        treatment based on these numbers alone.
      </p>
    </section>
  );
}

function ValueGroup({ title, tone, values }: { title: string; tone: 'critical' | 'attention' | 'normal' | 'unknown'; values: ExtractedMedicalValue[] }) {
  const headingTone =
    tone === 'critical' ? 'text-rose-200'
      : tone === 'attention' ? 'text-amber-200'
        : tone === 'normal' ? 'text-emerald-200'
          : 'text-ink-300';
  return (
    <div className="space-y-2">
      <p className={cn('text-[0.7rem] font-semibold uppercase tracking-[0.18em]', headingTone)}>{title}</p>
      <div className="space-y-2">
        {values.map((v, i) => <LabValueRow key={`${v.testName}-${v.page ?? 0}-${i}`} v={v} />)}
      </div>
    </div>
  );
}

function LabValueRow({ v }: { v: ExtractedMedicalValue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('rounded-[0.85rem] border bg-slate-950/45', v.critical ? 'border-rose-400/40' : 'border-white/10')}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[0.86rem] font-semibold text-white">
            {v.testName}
            {v.critical ? <span className="ml-2 rounded-full border border-rose-300/40 bg-rose-500/20 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-rose-50">Critical</span> : null}
          </p>
          <p className="text-[0.72rem] text-ink-400">
            Reference: {v.referenceRange || 'not printed'}
            {v.reportFlag ? ` · lab flag: ${v.reportFlag}` : ''}
            {v.page ? ` · page ${v.page}` : ''}
            {v.statusBasis ? ` · decided by ${BASIS_LABEL[v.statusBasis] ?? v.statusBasis}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[0.9rem] font-semibold text-white">
            {v.measuredValue}
            {v.unit ? <span className="ml-1 text-[0.68rem] font-normal text-ink-400">{v.unit}</span> : null}
          </span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em]', STATUS_TONE[v.status])}>
            {STATUS_LABEL[v.status]}
          </span>
        </div>
      </div>

      {v.unitStatus === 'unit-mismatch' ? (
        <p className="border-t border-white/8 px-3 py-1.5 text-[0.7rem] text-amber-200">
          The unit "{v.unit}" could not be reconciled, so this value was shown as printed without a range comparison.
        </p>
      ) : null}

      {v.about || v.whyOrdered || v.rawLine ? (
        <div className="border-t border-white/8 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold text-brand-200 transition hover:text-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            <IconActivity width={12} height={12} aria-hidden />
            {open ? 'Hide explanation' : 'What does this mean?'}
          </button>
          {open ? (
            <div className="mt-1.5 space-y-1.5">
              {v.about ? <p className="text-[0.78rem] leading-6 text-ink-200">{v.about}</p> : null}
              {v.whyOrdered ? <p className="text-[0.78rem] leading-6 text-ink-300">Ordered to: {v.whyOrdered}</p> : null}
              {v.criticalReason ? <p className="text-[0.78rem] leading-6 text-rose-200">{v.criticalReason}</p> : null}
              {v.rawLine ? (
                <p className="flex items-start gap-1.5 rounded-[0.6rem] border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-[0.72rem] text-ink-300">
                  <IconReport width={11} height={11} className="mt-1 shrink-0" aria-hidden />
                  <span className="break-words">Source line: {v.rawLine}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

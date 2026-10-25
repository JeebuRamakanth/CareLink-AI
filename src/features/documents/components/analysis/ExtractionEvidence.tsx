/**
 * CareLink-AI — extraction evidence, confidence and limitations panel.
 *
 * Shows exactly what was read from the document, by which backend, on which
 * page — and what could not be read. This is the "evidence" section that keeps
 * the analysis auditable and prevents the UI from presenting interpretation as
 * if it were extracted fact.
 *
 * Accessibility: the source viewer is a real disclosure with a button and
 * keyboard support; nothing is hidden behind hover.
 */

import { useState } from 'react';
import { cn } from '../../../../components/common/cn';
import { IconReport, IconShield, IconSparkle } from '../../../../components/agent/AgentIcons';
import type { DocumentExtraction } from '../../services/extraction/types';
import type { DocumentClassification } from '../../services/extraction/classify';
import type { EvidenceReference } from '../../types';

const BACKEND_LABEL: Record<DocumentExtraction['backend'], string> = {
  'pdf-text': 'PDF text layer',
  ocr: 'On-device OCR',
  'server-ocr': 'Server extraction',
  none: 'No extraction backend',
};

interface Props {
  extraction?: DocumentExtraction;
  classification?: DocumentClassification;
  evidence?: EvidenceReference[];
  limitations?: string[];
}

export function ExtractionEvidence({ extraction, classification, evidence = [], limitations = [] }: Props) {
  const [showSource, setShowSource] = useState(false);
  if (!extraction) return null;

  const readPages = extraction.pages.filter((p) => p.status === 'extracted').length;
  const scoredPages = extraction.pages.filter((p) => typeof p.confidence === 'number');
  const meanConfidence = scoredPages.length > 0
    ? Math.round(scoredPages.reduce((s, p) => s + (p.confidence ?? 0), 0) / scoredPages.length)
    : null;

  return (
    <section className="space-y-2.5">
      <SectionLabel>Evidence &amp; confidence</SectionLabel>

      <div className="grid gap-2 sm:grid-cols-2">
        <InfoCell label="Read from">
          <span>{BACKEND_LABEL[extraction.backend]}</span>
          {extraction.pageCount ? <span className="text-ink-400"> · {extraction.pageCount} page(s)</span> : null}
        </InfoCell>
        <InfoCell label="Pages with readable text">
          <span>{extraction.pages.length > 0 ? `${readPages} of ${extraction.pages.length}` : '—'}</span>
        </InfoCell>
        {classification ? (
          <InfoCell label="Document type">
            <span className="capitalize">{classification.category.replace(/-/g, ' ')}</span>
            <span className="text-ink-400"> · {classification.userSelected ? 'you chose this' : `${Math.round(classification.confidence * 100)}% match`}</span>
          </InfoCell>
        ) : null}
        {meanConfidence !== null ? <InfoCell label="OCR confidence"><span>{meanConfidence}%</span></InfoCell> : null}
      </div>

      {classification && !classification.userSelected && classification.signals.length > 0 ? (
        <p className="text-[0.74rem] text-ink-400">
          Classified from {classification.signals.map((s) => s.label).join(', ')}.
        </p>
      ) : null}

      {limitations.length > 0 ? (
        <div className="rounded-[0.8rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-amber-100">
            <IconShield width={12} height={12} aria-hidden /> Limitations
          </p>
          <ul className="mt-1.5 space-y-1">
            {limitations.map((l, i) => (
              <li key={i} className="flex gap-2 text-[0.78rem] leading-6 text-amber-100/95">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">Sources</p>
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="text-[0.76rem] leading-6 text-ink-300">
                <span className="inline-flex items-center gap-1.5">
                  <IconSparkle width={11} height={11} className="text-brand-200" aria-hidden />
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-200 underline decoration-dotted hover:text-brand-100">
                      {e.label}
                    </a>
                  ) : (
                    <span className="font-medium text-ink-200">{e.label}</span>
                  )}
                </span>
                {e.supports ? <span className="block pl-4 text-ink-400">{e.supports}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extraction.pages.some((p) => p.text.trim().length > 0) ? (
        <div>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.74rem] font-semibold text-ink-200 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            <IconReport width={13} height={13} aria-hidden />
            {showSource ? 'Hide extracted text' : 'View extracted text'}
          </button>
          {showSource ? (
            <div className="mt-2 space-y-2">
              {extraction.pages.map((p) => (
                <div key={p.pageNumber} className="rounded-[0.8rem] border border-white/10 bg-slate-950/50 p-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
                    Page {p.pageNumber}
                    {typeof p.confidence === 'number' ? ` · ${Math.round(p.confidence)}% confidence` : ''}
                  </p>
                  <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[0.74rem] leading-5 text-ink-200">
                    {p.text.trim() || p.note || 'No text on this page.'}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">{children}</p>;
}

export function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-[0.7rem] border border-white/10 bg-slate-950/40 px-3 py-2')}>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className="text-[0.82rem] text-white">{children}</p>
    </div>
  );
}

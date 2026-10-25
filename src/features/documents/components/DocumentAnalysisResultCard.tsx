/**
 * CareLink-AI — document analysis result card (rewritten).
 *
 * Renders a schema-validated DocumentAnalysisResult with a clear hierarchy:
 *   1. document preview + title + provenance
 *   2. urgency banner (deterministic triage) — always near the top
 *   3. overall summary
 *   4. medicine identification / lab findings / medication schedule
 *   5. evidence, confidence and limitations
 *   6. next actions (deep-links into existing routes)
 *   7. follow-up question input
 *
 * It replaces the earlier card that showed invented lab values as if they had
 * been extracted, and that had no extraction provenance, no limitations and no
 * document-type correction.
 *
 * Safety: nothing here is presented as a diagnosis; every extracted value is
 * separated from the plain-language explanation; mock/unavailable output is
 * badged; no unsafe HTML is rendered.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { ROUTES } from '../../../routes/routeConstants';
import {
  IconArrowRight,
  IconClose,
  IconHospital,
  IconLab,
  IconPharmacy,
  IconReport,
  IconShield,
  IconSparkle,
} from '../../../components/agent/AgentIcons';
import { formatFileSize } from '../services/fileValidation';
import { emergencyContacts } from '../services/clinical/emergencyConfig';
import { AnalysisUrgencyBanner } from './analysis/AnalysisUrgencyBanner';
import { ExtractionEvidence } from './analysis/ExtractionEvidence';
import { LabFindings } from './analysis/LabFindings';
import { MedicationSchedule } from './analysis/MedicationSchedule';
import { MedicineIdentification } from './analysis/MedicineIdentification';
import type { DocumentAnalysisResult, DocumentCategory, HealthDocument } from '../types';

const sourceBadge: Record<DocumentAnalysisResult['source'], { label: string; tone: string }> = {
  real: { label: 'Read from your document', tone: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' },
  mock: { label: 'Demo interpretation', tone: 'border-amber-400/30 bg-amber-500/15 text-amber-100' },
  unavailable: { label: 'No text read', tone: 'border-white/15 bg-white/10 text-ink-200' },
};

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'lab-report', label: 'Lab / blood report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'medicine-image', label: 'Medicine photo' },
  { value: 'discharge-summary', label: 'Discharge summary' },
  { value: 'imaging', label: 'Imaging / scan report' },
  { value: 'doctor-note', label: 'Doctor note' },
  { value: 'general-document', label: 'Other document' },
];

interface Props {
  document: HealthDocument;
  analysis: DocumentAnalysisResult;
  /** Re-analyse with a corrected document type. */
  onCorrectType?: (documentId: string, category: DocumentCategory) => void;
  onAnalyze?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Send a follow-up question about this document. */
  onFollowUp?: (question: string) => void;
  /** A directions URL to the nearest suitable facility, when known. */
  directionsUrl?: string | null;
  destinationLabel?: string | null;
}

export function DocumentAnalysisResultCard({
  document,
  analysis,
  onCorrectType,
  onAnalyze,
  onDelete,
  onFollowUp,
  directionsUrl,
  destinationLabel,
}: Props) {
  const navigate = useNavigate();
  const [followUp, setFollowUp] = useState('');
  const badge = sourceBadge[analysis.source];
  const isImage = document.kind === 'image' || document.kind === 'medicine_image';
  const lowConfidenceType = analysis.classification && !analysis.classification.userSelected
    && analysis.classification.confidence < 0.35
    && analysis.classification.category === 'general-document';

  const submitFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const q = followUp.trim();
    if (!q || !onFollowUp) return;
    onFollowUp(q);
    setFollowUp('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] backdrop-blur-xl"
    >
      {/* 1. Header: preview + title + provenance */}
      <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          {isImage && document.previewReference ? (
            <img
              src={document.previewReference}
              alt={`Preview of ${document.fileName}`}
              className="size-12 shrink-0 rounded-[0.7rem] border border-white/10 object-cover"
            />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-[0.85rem] border border-brand-400/25 bg-brand-500/15 text-brand-100">
              <IconReport width={20} height={20} aria-hidden />
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-base font-semibold leading-snug text-white">{document.fileName}</h3>
              <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', badge.tone)}>{badge.label}</span>
            </div>
            <p className="text-[0.72rem] text-ink-400">
              {analysis.category.replace(/-/g, ' ')} · {formatFileSize(document.fileSize)} · {new Date(document.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* 2. Urgency banner — always above secondary detail */}
        {analysis.triage ? (
          <AnalysisUrgencyBanner
            triage={analysis.triage}
            contacts={emergencyContacts('in')}
            directionsUrl={directionsUrl}
            destinationLabel={destinationLabel}
          />
        ) : null}

        {/* 3. Overall summary */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <IconSparkle width={13} height={13} className="text-brand-200" aria-hidden />
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">Summary</p>
          </div>
          <p className="text-sm leading-7 text-ink-200">{analysis.summary}</p>
        </section>

        {/* Document-type correction */}
        {(lowConfidenceType || onCorrectType) && onCorrectType ? (
          <div className="rounded-[0.8rem] border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="text-[0.72rem] text-ink-300">
              {lowConfidenceType
                ? 'We could not confidently tell what type of document this is. Tell us so we can interpret it correctly:'
                : 'Wrong type detected? Correct it and re-analyse:'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.filter((o) => o.value !== analysis.category).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onCorrectType(document.id, o.value)}
                  className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.72rem] font-medium text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 4. Type-specific findings */}
        {analysis.medicine ? (
          <MedicineIdentification
            medicine={analysis.medicine}
            onFindPharmacy={(name) => navigate(`${ROUTES.pharmacies}?q=${encodeURIComponent(name)}`)}
            onRequestClearerImage={onAnalyze ? () => onAnalyze(document.id) : undefined}
          />
        ) : null}

        {analysis.labResult ? <LabFindings lab={analysis.labResult} /> : null}

        {analysis.prescription ? <MedicationSchedule rx={analysis.prescription} /> : null}

        {/* Trends across reports */}
        {analysis.trends && analysis.trends.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">Changes over time</p>
            {analysis.trends.map((t) => (
              <div key={t.analyteKey} className="rounded-[0.8rem] border border-white/10 bg-slate-950/45 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.84rem] font-semibold text-white">{t.analyteName}</p>
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold capitalize',
                    t.direction === 'increased' ? 'border-amber-400/30 bg-amber-500/12 text-amber-100'
                      : t.direction === 'decreased' ? 'border-sky-400/30 bg-sky-500/12 text-sky-100'
                        : 'border-white/12 bg-white/8 text-ink-200'
                  )}>
                    {t.direction}
                  </span>
                </div>
                <p className="mt-1 text-[0.74rem] text-ink-300">
                  {t.points.map((p) => `${p.date ?? p.reportLabel}: ${p.rawValue}${p.unit ? ` ${p.unit}` : ''}`).join('  →  ')}
                </p>
                {t.changePercent !== null ? (
                  <p className="text-[0.72rem] text-ink-400">
                    {t.change !== null && t.change > 0 ? '+' : ''}{t.change} {t.canonicalUnit} ({t.changePercent > 0 ? '+' : ''}{t.changePercent}%)
                  </p>
                ) : null}
                {t.note ? <p className="text-[0.72rem] italic text-amber-200">{t.note}</p> : null}
              </div>
            ))}
            <p className="text-[0.72rem] italic text-ink-400">
              Only measurements with matching units are compared. A change is a factual comparison, not a clinical judgement.
            </p>
          </section>
        ) : null}

        {/* Possible concerns */}
        {analysis.possibleConcerns.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">Worth discussing with a clinician</p>
            <ul className="space-y-1.5">
              {analysis.possibleConcerns.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm leading-6 text-amber-100">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 5. Evidence + confidence + limitations */}
        <ExtractionEvidence
          extraction={analysis.extraction}
          classification={analysis.classification}
          evidence={analysis.evidence}
          limitations={analysis.limitations}
        />

        {/* 6. Next actions */}
        <section className="space-y-2">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">Recommended next actions</p>
          <p className="text-sm leading-6 text-ink-200">{analysis.recommendedNextAction}</p>
          <div className="flex flex-wrap gap-2">
            <ActionChip onClick={() => navigate(ROUTES.doctors)} icon={<IconSparkle width={14} height={14} aria-hidden />}>Find a doctor</ActionChip>
            <ActionChip onClick={() => navigate(ROUTES.hospitals)} icon={<IconHospital width={14} height={14} aria-hidden />}>Find a hospital</ActionChip>
            {analysis.category === 'lab-report' ? (
              <ActionChip onClick={() => navigate(ROUTES.labs)} icon={<IconLab width={14} height={14} aria-hidden />}>Find a lab</ActionChip>
            ) : null}
            {analysis.medicine || analysis.category === 'medicine-image' ? (
              <ActionChip onClick={() => navigate(ROUTES.pharmacies)} icon={<IconPharmacy width={14} height={14} aria-hidden />}>Find a pharmacy</ActionChip>
            ) : null}
            <ActionChip onClick={() => navigate(ROUTES.appointments)} icon={<IconReport width={14} height={14} aria-hidden />}>Book appointment</ActionChip>
            {onAnalyze ? <ActionChip variant="ghost" onClick={() => onAnalyze(document.id)} icon={<IconSparkle width={14} height={14} aria-hidden />}>Re-analyse</ActionChip> : null}
            {onDelete ? <ActionChip variant="danger" onClick={() => onDelete(document.id)} icon={<IconClose width={12} height={12} aria-hidden />}>Delete document</ActionChip> : null}
          </div>
        </section>

        {/* 7. Follow-up question */}
        {onFollowUp ? (
          <form onSubmit={submitFollowUp} className="space-y-2">
            <label htmlFor={`followup-${document.id}`} className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">
              Ask about this document
            </label>
            <div className="flex gap-2">
              <input
                id={`followup-${document.id}`}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="e.g. Ee value enduku perigindi?"
                className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-[0.82rem] text-white placeholder:text-ink-500 focus:border-brand-400/50 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
              />
              <button
                type="submit"
                disabled={!followUp.trim()}
                className="shrink-0 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3.5 py-2 text-[0.8rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-40"
              >
                Ask
              </button>
            </div>
          </form>
        ) : null}

        <p className="flex items-center gap-1.5 text-[0.72rem] italic text-ink-400">
          <IconShield width={12} height={12} aria-hidden /> Guidance, not a diagnosis. Always confirm findings with a qualified professional.
        </p>
      </div>
    </motion.div>
  );
}

function ActionChip({ children, icon, onClick, variant = 'solid' }: { children: React.ReactNode; icon?: React.ReactNode; onClick: () => void; variant?: 'solid' | 'ghost' | 'danger' }) {
  const cls = variant === 'solid'
    ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:opacity-90'
    : variant === 'danger'
      ? 'border border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20'
      : 'border border-white/12 bg-white/8 text-ink-100 hover:bg-white/15';
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[0.76rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40', cls)}>
      {icon}
      <span>{children}</span>
      <IconArrowRight width={11} height={11} aria-hidden />
    </button>
  );
}

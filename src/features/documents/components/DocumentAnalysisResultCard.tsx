/**
 * CareLink-AI — Step 11 document analysis result card.
 *
 * Renders a schema-validated DocumentAnalysisResult. Clearly separates:
 * - EXTRACTED FROM REPORT (structured lab values / prescription fields), and
 * - AI EXPLANATION (navigational guidance, never a diagnosis).
 *
 * Action cards deep-link into existing routes (doctors, hospitals, labs,
 * pharmacies, appointments) — never duplicate those pages.
 *
 * Safety: mock output is always badged; uncertain medicine recognition surfaces
 * the "verify with a pharmacist" guidance; no unsafe HTML is rendered.
 */

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { ROUTES } from '../../../routes/routeConstants';
import {
  IconArrowRight,
  IconHospital,
  IconLab,
  IconPharmacy,
  IconReport,
  IconShield,
  IconSparkle,
} from '../../../components/agent/AgentIcons';
import { formatFileSize } from '../services/fileValidation';
import type { DocumentAnalysisResult, ExtractedMedicalValue, HealthDocument, MedicineRecognitionResult, PrescriptionExtraction } from '../types';

const valueStatusTone: Record<ExtractedMedicalValue['status'], string> = {
  normal: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  attention: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  abnormal: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
  unknown: 'border-white/12 bg-white/5 text-ink-200',
};

const valueStatusLabel: Record<ExtractedMedicalValue['status'], string> = {
  normal: 'Normal',
  attention: 'Attention',
  abnormal: 'Abnormal',
  unknown: 'Unknown',
};

const sourceBadge: Record<DocumentAnalysisResult['source'], { label: string; tone: string }> = {
  real: { label: 'Real analysis', tone: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' },
  mock: { label: 'Mock interpretation', tone: 'border-amber-400/30 bg-amber-500/15 text-amber-100' },
  unavailable: { label: 'Analysis unavailable', tone: 'border-white/15 bg-white/10 text-ink-200' },
};

interface Props {
  document: HealthDocument;
  analysis: DocumentAnalysisResult;
  onAnalyze?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DocumentAnalysisResultCard({ document, analysis, onAnalyze, onDelete }: Props) {
  const navigate = useNavigate();
  const badge = sourceBadge[analysis.source];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.85rem] border border-brand-400/25 bg-brand-500/15 text-brand-100">
            <IconReport width={20} height={20} aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-snug text-white">{document.fileName}</h3>
              <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', badge.tone)}>{badge.label}</span>
            </div>
            <p className="text-[0.72rem] text-ink-400">
              {analysis.category.replace('-', ' ')} · {formatFileSize(document.fileSize)} · {new Date(document.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* AI explanation — clearly labelled, never a diagnosis */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <IconSparkle width={13} height={13} className="text-brand-200" aria-hidden />
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">AI explanation</p>
          </div>
          <p className="text-sm leading-7 text-ink-200">{analysis.summary}</p>
          {analysis.isMock ? (
            <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.74rem] italic text-amber-100">
              This is a demo interpretation. CareLink.AI has not performed real medical analysis. Confirm all findings with a licensed professional.
            </p>
          ) : null}
        </section>

        {/* Extracted lab values */}
        {analysis.labResult ? <LabResultSection lab={analysis.labResult} /> : null}

        {/* Prescription extraction */}
        {analysis.prescription ? <PrescriptionSection rx={analysis.prescription} /> : null}

        {/* Medicine recognition */}
        {analysis.medicine ? <MedicineSection medicine={analysis.medicine} /> : null}

        {/* Important observations */}
        {analysis.importantObservations.length > 0 ? (
          <section className="space-y-2">
            <SectionLabel>Important observations</SectionLabel>
            <ul className="space-y-1.5">
              {analysis.importantObservations.map((obs) => (
                <li key={obs} className="flex gap-2 text-sm leading-6 text-ink-200">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                  <span>{obs}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Possible concerns */}
        {analysis.possibleConcerns.length > 0 ? (
          <section className="space-y-2">
            <SectionLabel>Possible concerns</SectionLabel>
            <ul className="space-y-1.5">
              {analysis.possibleConcerns.map((c) => (
                <li key={c} className="flex gap-2 text-sm leading-6 text-amber-100">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-[0.72rem] italic text-ink-400">
              <IconShield width={12} height={12} aria-hidden /> These are observations, not a diagnosis. Multiple causes are possible.
            </p>
          </section>
        ) : null}

        {/* Action cards */}
        <section className="space-y-2">
          <SectionLabel>Recommended next actions</SectionLabel>
          <p className="text-sm leading-6 text-ink-200">{analysis.recommendedNextAction}</p>
          <div className="flex flex-wrap gap-2">
            <ActionChip onClick={() => navigate(ROUTES.doctors)} icon={<IconSparkle width={14} height={14} aria-hidden />}>Find a doctor</ActionChip>
            <ActionChip onClick={() => navigate(ROUTES.hospitals)} icon={<IconHospital width={14} height={14} aria-hidden />}>Find a hospital</ActionChip>
            {analysis.category === 'lab-report' ? (
              <ActionChip onClick={() => navigate(ROUTES.hospitals)} icon={<IconLab width={14} height={14} aria-hidden />}>Find a lab</ActionChip>
            ) : null}
            {analysis.medicine || analysis.category === 'medicine-image' ? (
              <ActionChip onClick={() => navigate(ROUTES.agent)} icon={<IconPharmacy width={14} height={14} aria-hidden />}>Find a pharmacy</ActionChip>
            ) : null}
            <ActionChip onClick={() => navigate(ROUTES.appointments)} icon={<IconReport width={14} height={14} aria-hidden />}>Book appointment</ActionChip>
            {onAnalyze ? <ActionChip variant="ghost" onClick={() => onAnalyze(document.id)} icon={<IconSparkle width={14} height={14} aria-hidden />}>Re-analyze</ActionChip> : null}
            {onDelete ? <ActionChip variant="danger" onClick={() => onDelete(document.id)}>Delete document</ActionChip> : null}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-400">{children}</p>;
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

function LabResultSection({ lab }: { lab: NonNullable<DocumentAnalysisResult['labResult']> }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Extracted from report</SectionLabel>
        {lab.collectionDate ? <span className="text-[0.7rem] text-ink-400">Collected {lab.collectionDate}</span> : null}
      </div>
      <p className="text-sm font-medium text-white">{lab.reportTitle}</p>
      {lab.valuesRequiringAttention.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Values requiring attention</p>
          {lab.valuesRequiringAttention.map((v) => <LabValueRow key={v.testName} v={v} />)}
        </div>
      ) : null}
      {lab.normalValues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Within reference range</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {lab.normalValues.map((v) => <LabValueRow key={v.testName} v={v} compact />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LabValueRow({ v, compact = false }: { v: ExtractedMedicalValue; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-[0.8rem] border bg-slate-950/45 px-3 py-2.5', compact ? 'border-white/10' : valueStatusTone[v.status].split(' ').filter((c) => c.startsWith('border')).join(' '))}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{v.testName}</p>
        <p className="text-[0.7rem] text-ink-400">Reference: {v.referenceRange || '—'}{v.unit ? ` · ${v.unit}` : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white">{v.measuredValue} <span className="text-[0.66rem] text-ink-400">{v.unit}</span></span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', valueStatusTone[v.status])}>{valueStatusLabel[v.status]}</span>
      </div>
    </div>
  );
}

function PrescriptionSection({ rx }: { rx: PrescriptionExtraction }) {
  return (
    <section className="space-y-2">
      <SectionLabel>Extracted from prescription</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Doctor" value={rx.doctorName} />
        <Field label="Date" value={rx.date} />
        <Field label="Frequency" value={rx.frequency} />
        <Field label="Duration" value={rx.duration} />
      </div>
      {rx.medicineNames.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[0.7rem] text-ink-400">Medicines listed</p>
          <div className="flex flex-wrap gap-1.5">
            {rx.medicineNames.map((m) => (
              <span key={m} className="rounded-full border border-white/12 bg-white/8 px-2.5 py-0.5 text-[0.74rem] text-ink-100">{m}</span>
            ))}
          </div>
        </div>
      ) : null}
      {rx.instructions ? <p className="text-sm leading-6 text-ink-200">{rx.instructions}</p> : null}
      {rx.needsVerification.length > 0 ? (
        <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.74rem] text-amber-100">
          Needs verification: {rx.needsVerification.join(', ')}. Confirm with your doctor or pharmacist before following any instructions.
        </p>
      ) : null}
    </section>
  );
}

function MedicineSection({ medicine }: { medicine: MedicineRecognitionResult }) {
  return (
    <section className="space-y-2">
      <SectionLabel>Medicine recognition</SectionLabel>
      {medicine.isUncertain || !medicine.name ? (
        <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.78rem] italic text-amber-100">
          Medicine identification is uncertain. Please verify the name/strength on the strip or with a pharmacist.
        </p>
      ) : (
        <div className="rounded-[0.8rem] border border-white/10 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ''}</p>
            <span className="rounded-full border border-brand-400/25 bg-brand-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-brand-100">
              {medicine.confidence}% confidence
            </span>
          </div>
          {medicine.dosageForm ? <p className="mt-1 text-[0.72rem] text-ink-400">Form: {medicine.dosageForm}</p> : null}
          {medicine.commonPurpose ? <p className="mt-1 text-sm leading-6 text-ink-200">{medicine.commonPurpose}</p> : null}
        </div>
      )}
      {medicine.safetyWarning ? (
        <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.74rem] text-amber-100">
          <span className="font-semibold">Safety:</span> {medicine.safetyWarning}
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 text-[0.72rem] italic text-ink-400">
        <IconShield width={12} height={12} aria-hidden /> Identification is for navigation only. Never change your dosage or stop a prescribed medicine without consulting your doctor.
      </p>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-[0.7rem] border border-white/10 bg-slate-950/40 px-3 py-2">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className="text-sm text-white">{value || <span className="text-amber-200">Needs verification</span>}</p>
    </div>
  );
}

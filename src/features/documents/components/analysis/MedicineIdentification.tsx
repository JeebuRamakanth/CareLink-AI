/**
 * CareLink-AI — medicine identification panel.
 *
 * Renders either a VERIFIED identification (matched against a medicine database,
 * with cited label facts) or an explicit UNCERTAIN candidate. When uncertain, an
 * unmistakable warning is shown BEFORE any medicine-specific guidance, and the
 * UI asks for a clearer image rather than guessing.
 *
 * DOSAGE SAFETY: the dosage shown is the label's reference text only. It is
 * never converted into a patient-specific dose. Children's dosing always routes
 * to a clinician/pharmacist and no dose is ever calculated here.
 */

import { cn } from '../../../../components/common/cn';
import { IconPharmacy, IconPill, IconShield, IconSparkle } from '../../../../components/agent/AgentIcons';
import type { MedicineRecognitionResult } from '../../types';
import { SectionLabel, InfoCell } from './ExtractionEvidence';

interface Props {
  medicine: MedicineRecognitionResult;
  /** Open the pharmacy search for this medicine. */
  onFindPharmacy?: (medicineName: string) => void;
  /** Ask for a clearer image. */
  onRequestClearerImage?: () => void;
}

export function MedicineIdentification({ medicine, onFindPharmacy, onRequestClearerImage }: Props) {
  const uncertain = medicine.isUncertain || !medicine.name || medicine.verified !== true;

  return (
    <section className="space-y-2.5">
      <SectionLabel>Medicine identification</SectionLabel>

      {uncertain ? (
        <div className="rounded-[0.9rem] border border-amber-400/40 bg-amber-500/12 p-3">
          <p className="flex items-center gap-1.5 text-[0.8rem] font-bold text-amber-100">
            <IconShield width={14} height={14} aria-hidden /> Identification not confirmed
          </p>
          <p className="mt-1 text-[0.8rem] leading-6 text-amber-100/95">
            {medicine.uncertaintyReason
              ?? 'This medicine could not be verified against a medicine database. Do not rely on a name guessed from a photo.'}
          </p>
          {medicine.name ? (
            <p className="mt-1.5 text-[0.78rem] text-amber-100/90">
              A possible match was read as <span className="font-semibold">"{medicine.name}"</span>, but this is an
              unverified candidate — visually similar medicines can contain different ingredients or strengths.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {onRequestClearerImage ? (
              <button
                type="button"
                onClick={onRequestClearerImage}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-[0.76rem] font-bold text-slate-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
              >
                <IconPill width={13} height={13} aria-hidden /> Upload a clearer image
              </button>
            ) : null}
            {medicine.name && onFindPharmacy ? (
              <button
                type="button"
                onClick={() => onFindPharmacy(medicine.name as string)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1.5 text-[0.76rem] font-semibold text-amber-50 transition hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
              >
                <IconPharmacy width={13} height={13} aria-hidden /> Ask a pharmacist
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[0.72rem] italic text-amber-100/85">
            Photograph the front and back of the strip or box, including the active ingredient, strength and imprint.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-[0.9rem] border border-emerald-400/30 bg-emerald-500/8 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.95rem] font-bold text-white">
                  {medicine.name}
                  {medicine.strength ? <span className="ml-2 text-[0.82rem] font-semibold text-emerald-100">{medicine.strength}</span> : null}
                </p>
                {medicine.genericName && medicine.genericName !== medicine.name ? (
                  <p className="text-[0.74rem] text-ink-300">Active ingredient: {medicine.genericName}</p>
                ) : null}
              </div>
              <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-50">
                Matched to a medicine database
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {medicine.dosageForm ? <InfoCell label="Form">{medicine.dosageForm}</InfoCell> : null}
            {medicine.manufacturerPlaceholder ? <InfoCell label="Manufacturer (from label)">{medicine.manufacturerPlaceholder}</InfoCell> : null}
            <InfoCell label="Prescription required">
              {medicine.prescriptionRequired ? 'Generally yes (per the label)' : medicine.prescriptionRequired === false ? 'Generally no (per the label)' : 'Not confirmed'}
            </InfoCell>
          </div>

          {medicine.uses && medicine.uses.length > 0 ? (
            <Bullets title="What it is commonly used for" items={medicine.uses} tone="default" />
          ) : null}
          {medicine.sideEffects && medicine.sideEffects.length > 0 ? (
            <Bullets title="Reported side effects (from the label)" items={medicine.sideEffects} tone="default" />
          ) : null}
          {medicine.seriousWarnings && medicine.seriousWarnings.length > 0 ? (
            <Bullets title="Serious warnings to know" items={medicine.seriousWarnings} tone="warning" />
          ) : null}

          {medicine.referenceDosage ? (
            <div className="rounded-[0.8rem] border border-white/10 bg-white/5 px-3 py-2.5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">Reference dosage from the label</p>
              <p className="mt-1 text-[0.78rem] leading-6 text-ink-200">{medicine.referenceDosage}</p>
              <p className="mt-1.5 text-[0.72rem] italic text-amber-200">
                This is general label information, not a dose for you. Follow the prescription from your doctor. For
                children, ask the prescriber or pharmacist — CareLink never calculates a child's dose.
              </p>
            </div>
          ) : null}
        </>
      )}

      {medicine.safetyWarning ? (
        <p className="rounded-[0.8rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.76rem] text-amber-100">
          <span className="font-semibold">Safety:</span> {medicine.safetyWarning}
        </p>
      ) : null}

      {medicine.unverified && medicine.unverified.length > 0 ? (
        <p className="text-[0.74rem] text-ink-400">
          Not verified: {medicine.unverified.join(', ')}.
        </p>
      ) : null}

      {!uncertain ? (
        <div className="flex flex-wrap gap-2">
          {medicine.name && onFindPharmacy ? (
            <button
              type="button"
              onClick={() => onFindPharmacy(medicine.name as string)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.76rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              <IconPharmacy width={13} height={13} aria-hidden /> Find nearby pharmacies
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-[0.72rem] italic text-ink-400">
        <IconShield width={12} height={12} className="mt-0.5 shrink-0" aria-hidden />
        Identification is for navigation only. Never start, stop, split or change a medicine without your doctor's advice.
      </p>
    </section>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: 'default' | 'warning' }) {
  return (
    <div className={cn('rounded-[0.8rem] border px-3 py-2.5', tone === 'warning' ? 'border-amber-400/25 bg-amber-500/8' : 'border-white/10 bg-white/5')}>
      <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
        <IconSparkle width={11} height={11} className="text-brand-200" aria-hidden /> {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((it, i) => (
          <li key={i} className={cn('flex gap-2 text-[0.78rem] leading-6', tone === 'warning' ? 'text-amber-100/95' : 'text-ink-200')}>
            <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', tone === 'warning' ? 'bg-amber-300' : 'bg-brand-300')} aria-hidden />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * CareLink-AI — medication schedule table.
 *
 * Renders the prescription instructions EXACTLY as written, with a derived
 * morning/afternoon/night schedule shown ONLY when the source text supports it.
 * Any field the parser could not read is marked "Needs confirmation" — nothing
 * is invented.
 *
 * Mobile: the table becomes stacked cards below `sm` so no horizontal
 * scrolling is ever required.
 */

import { cn } from '../../../../components/common/cn';
import { IconPill, IconShield } from '../../../../components/agent/AgentIcons';
import type { PrescriptionExtraction, ScheduleRow } from '../../types';
import { SectionLabel } from './ExtractionEvidence';

const SLOTS = ['morning', 'afternoon', 'night'] as const;

export function MedicationSchedule({ rx }: { rx: PrescriptionExtraction }) {
  const rows = rx.schedule ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Prescription as written</SectionLabel>
        <span className="text-[0.7rem] text-ink-400">
          {rows.length} medicine line(s)
          {rx.doctorName ? ` · ${rx.doctorName}` : ''}
          {rx.date ? ` · ${rx.date}` : ''}
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-[0.9rem] border border-white/10 sm:block">
        <table className="w-full border-collapse text-left text-[0.78rem]">
          <caption className="sr-only">Prescribed medicines and their instructions</caption>
          <thead>
            <tr className="bg-white/5 text-[0.66rem] uppercase tracking-[0.14em] text-ink-400">
              <th scope="col" className="px-3 py-2 font-semibold">Medicine</th>
              <th scope="col" className="px-3 py-2 font-semibold">Strength / form</th>
              <th scope="col" className="px-3 py-2 font-semibold">Instruction as written</th>
              <th scope="col" className="px-3 py-2 font-semibold">Schedule</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.medicine}-${i}`} className="border-t border-white/8 align-top">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-white">{row.medicine}</p>
                  <p className="text-[0.68rem] text-ink-400">page {row.page}</p>
                </td>
                <td className="px-3 py-2.5 text-ink-200">
                  {row.strength ?? <NeedsConfirm />}
                  {row.form ? <span className="block text-[0.7rem] text-ink-400">{row.form}</span> : null}
                </td>
                <td className="px-3 py-2.5">
                  <p className="break-words text-ink-200">{row.instruction}</p>
                  {row.duration ? <p className="text-[0.7rem] text-ink-400">Duration: {row.duration}</p> : null}
                  {row.timing ? <p className="text-[0.7rem] text-ink-400">Timing: {row.timing}</p> : null}
                </td>
                <td className="px-3 py-2.5">
                  <ScheduleSlots slots={row.schedule} />
                  {row.frequency ? <p className="mt-1 text-[0.7rem] text-ink-400">{row.frequency}</p> : null}
                </td>
                <td className="px-3 py-2.5">
                  <ConfirmationStatus needs={row.needsConfirmation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row, i) => (
          <div key={`${row.medicine}-${i}-m`} className="rounded-[0.85rem] border border-white/10 bg-slate-950/45 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[0.86rem] font-semibold text-white">{row.medicine}</p>
              <span className="shrink-0 text-[0.68rem] text-ink-400">page {row.page}</span>
            </div>
            <p className="mt-1 text-[0.76rem] text-ink-200">
              {row.strength ?? <NeedsConfirm />}{row.form ? ` · ${row.form}` : ''}
            </p>
            <p className="mt-1.5 break-words text-[0.78rem] text-ink-200">{row.instruction}</p>
            {row.duration ? <p className="text-[0.7rem] text-ink-400">Duration: {row.duration}</p> : null}
            {row.timing ? <p className="text-[0.7rem] text-ink-400">Timing: {row.timing}</p> : null}
            <div className="mt-2"><ScheduleSlots slots={row.schedule} /></div>
            <div className="mt-2"><ConfirmationStatus needs={row.needsConfirmation} /></div>
          </div>
        ))}
      </div>

      {rx.followUp && rx.followUp.length > 0 ? (
        <div className="rounded-[0.8rem] border border-white/10 bg-white/5 px-3 py-2.5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">Advice / follow-up in the document</p>
          <ul className="mt-1.5 space-y-1">
            {rx.followUp.map((f, i) => (
              <li key={i} className="flex gap-2 text-[0.78rem] leading-6 text-ink-200">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-[0.72rem] italic text-ink-400">
        <IconShield width={12} height={12} className="mt-0.5 shrink-0" aria-hidden />
        Instructions are shown exactly as written. CareLink does not create, change or remind you about a prescription —
        confirm anything unclear with your doctor or pharmacist.
      </p>
    </section>
  );
}

function ScheduleSlots({ slots }: { slots: string[] }) {
  if (slots.length === 0) {
    return <span className="text-[0.72rem] italic text-ink-400">Schedule not stated</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {SLOTS.map((slot) => {
        const on = slots.includes(slot);
        return (
          <span
            key={slot}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold capitalize',
              on ? 'border-brand-400/40 bg-brand-500/20 text-brand-50' : 'border-white/10 bg-white/5 text-ink-500'
            )}
          >
            {slot}
          </span>
        );
      })}
    </div>
  );
}

function ConfirmationStatus({ needs }: { needs: string[] }) {
  if (needs.length === 0) {
    return <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-200">Read clearly</span>;
  }
  return (
    <span className="inline-flex items-start gap-1 rounded-[0.6rem] border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[0.66rem] font-semibold text-amber-100">
      <IconPill width={11} height={11} className="mt-0.5 shrink-0" aria-hidden />
      Needs confirmation: {needs.join(', ')}
    </span>
  );
}

function NeedsConfirm() {
  return <span className="text-[0.72rem] italic text-amber-200">Not read — needs confirmation</span>;
}

export type { ScheduleRow };

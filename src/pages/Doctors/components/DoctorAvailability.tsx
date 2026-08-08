import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorAvailabilitySlot } from '../data/doctorProfileData';

type DoctorAvailabilityProps = {
  slots: DoctorAvailabilitySlot[];
  selectedSlot: string | null;
  onSlotSelect: (slotId: string) => void;
};

export function DoctorAvailability({ slots, selectedSlot, onSlotSelect }: DoctorAvailabilityProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Availability</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Select a consultation slot</h2>
        </div>

        <div className="grid gap-3">
          {slots.map((slot) => {
            const isSelected = slot.id === selectedSlot;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSlotSelect(slot.id)}
                className={`flex items-center justify-between rounded-[1.5rem] border px-4 py-4 text-left transition ${
                  isSelected
                    ? 'border-brand-400 bg-brand-500/10 text-white'
                    : 'border-white/10 bg-slate-950/80 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                }`}
              >
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{slot.day}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{slot.time}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase text-ink-300">
                  {slot.status === 'available' ? 'Available' : slot.status === 'reserved' ? 'Reserved' : 'Unavailable'}
                </span>
              </button>
            );
          })}
        </div>

        {selectedSlot ? (
          <div className="rounded-[1.5rem] border border-brand-400/20 bg-brand-500/10 p-4 text-sm text-brand-100">
            Selected — {slots.find((slot) => slot.id === selectedSlot)?.day}, {slots.find((slot) => slot.id === selectedSlot)?.time}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">Select a slot to confirm your preferred consultation time.</div>
        )}
      </div>
    </motion.section>
  );
}

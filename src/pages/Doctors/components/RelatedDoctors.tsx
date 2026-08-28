import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorProfileCard } from '../data/doctorProfileData';

type RelatedDoctorsProps = {
  doctors: DoctorProfileCard[];
  onViewProfile: (id: string) => void;
};

export function RelatedDoctors({ doctors, onViewProfile }: RelatedDoctorsProps) {
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
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Other specialists</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Other specialists you may consider</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {doctors.map((doctor) => (
            <button
              key={doctor.id}
              type="button"
              onClick={() => onViewProfile(doctor.id)}
              className="group rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5 text-left transition hover:-translate-y-1 hover:border-brand-400/40"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-semibold text-white">
                  {doctor.profileInitials}
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{doctor.name}</p>
                  <p className="text-sm text-ink-400">{doctor.specialty}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-ink-400">
                <p>{doctor.experienceYears} yrs experience</p>
                <p>{doctor.hospital}</p>
                <p>{doctor.availability}</p>
                <p>{doctor.location}</p>
              </div>
              <div className="mt-4">
                <span className="inline-flex w-full items-center justify-start gap-2 rounded-[var(--radius-xl)] border border-transparent px-3.5 py-2 text-sm font-semibold tracking-[0.02em] text-ink-200 transition-all duration-200 group-hover:text-white">
                  View profile
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

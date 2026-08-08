import { motion, useReducedMotion } from 'framer-motion';
import type { HospitalSpecialtyDiscoveryItem } from '../data/hospitalDetailsData';

type HospitalSpecialtiesProps = {
  specialties: HospitalSpecialtyDiscoveryItem[];
};

export function HospitalSpecialties({ specialties }: HospitalSpecialtiesProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Specialty discovery</p>
          <h2 className="mt-4 text-2xl font-semibold text-white">Expertise the hospital is known for</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {specialties.map((topic) => (
            <div key={topic.id} className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">{topic.name}</p>
                  <p className="mt-2 text-sm text-ink-300">{topic.signal}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-ink-200">
                  {topic.rating.toFixed(1)} ★
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between text-sm text-ink-300">
                <span>{topic.reviewCount} reviews</span>
                <span className="text-emerald-300">Trusted</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

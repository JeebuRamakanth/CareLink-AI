import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorExpertiseItem } from '../data/doctorProfileData';

type DoctorExpertiseProps = {
  expertise: DoctorExpertiseItem[];
};

export function DoctorExpertise({ expertise }: DoctorExpertiseProps) {
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
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Specialty expertise</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Key treatment and condition strengths</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {expertise.map((item) => (
            <div key={item.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{item.specialty}</p>
              <p className="mt-3 text-xl font-semibold text-white">{item.rating.toFixed(1)} ★</p>
              <p className="mt-2 text-sm text-ink-300">{item.reviewCount} reviews</p>
              <p className="mt-3 text-sm text-ink-400">{item.experienceIndicator}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

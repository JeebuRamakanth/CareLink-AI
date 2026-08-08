import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorProfile } from '../data/doctorProfileData';

type DoctorExperienceProps = {
  metrics: DoctorProfile['performanceMetrics'];
};

export function DoctorExperience({ metrics }: DoctorExperienceProps) {
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
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Doctor experience</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Performance and patient care intelligence</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{metric.label}</p>
              <p className="mt-3 text-lg font-semibold text-white">{metric.value}</p>
              {metric.note ? <p className="mt-2 text-xs text-ink-500">{metric.note}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

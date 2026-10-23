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
          <p className="break-words text-xs uppercase tracking-[0.2em] text-brand-200 sm:text-sm sm:tracking-[0.28em]">Doctor experience</p>
          <h2 className="mt-3 break-words text-xl font-semibold text-white sm:text-2xl">Published experience information</h2>
        </div>

        {metrics.length === 0 ? (
          <p role="status" className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm leading-6 text-ink-300">
            No published experience or performance data is available for this doctor in the current sources. Nothing is estimated.
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5">
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

import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import type { HospitalDetail } from '../data/hospitalDetailsData';

type HospitalOverviewProps = {
  hospital: HospitalDetail;
};

export function HospitalOverview({ hospital }: HospitalOverviewProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="grid gap-8 xl:grid-cols-[0.95fr_0.85fr]">
        <div className="space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Hospital overview</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">A detailed care summary for informed decisions.</h2>
          </div>

          <p className="text-base leading-7 text-ink-300">{hospital.about}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Years of service</p>
              <p className="mt-3 text-3xl font-semibold text-white">{hospital.yearsInService}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Departments</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hospital.departments.map((department) => (
                  <Badge key={department} tone="neutral" className="text-[0.7rem] uppercase tracking-[0.24em]">
                    {department}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Consultation type</p>
            <p className="mt-2 text-lg font-semibold text-white">{hospital.consultationAvailability}</p>
          </div>
          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Emergency availability</p>
            <p className="mt-2 text-lg font-semibold text-white">{hospital.emergencyAvailable ? 'Available 24/7' : 'Limited hours'}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Specialties</p>
            <div className="mt-4 space-y-2">
              {hospital.specialties.slice(0, 3).map((specialty) => (
                <p key={specialty} className="text-sm text-ink-300">
                  • {specialty}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Facilities</p>
            <div className="mt-4 space-y-2">
              {hospital.facilities.slice(0, 3).map((facility) => (
                <p key={facility} className="text-sm text-ink-300">
                  • {facility}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Experience indicators</p>
            <div className="mt-4 space-y-2">
              {hospital.patientExperienceIndicators.map((item) => (
                <div key={item.label} className="text-sm text-ink-300">
                  <p className="font-medium text-white">{item.value}</p>
                  <p>{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

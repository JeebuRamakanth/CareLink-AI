import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import type { DoctorProfile } from '../data/doctorProfileData';

type DoctorHeroProps = {
  doctor: DoctorProfile;
  onBack: () => void;
};

export function DoctorHero({ doctor, onBack }: DoctorHeroProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="text-sm text-ink-300 transition hover:text-white">
              ← Back
            </button>
            <Badge tone="brand">Doctor profile</Badge>
          </div>
          <div className="grid gap-6 md:grid-cols-[0.95fr_0.55fr] lg:grid-cols-[0.9fr_0.6fr]">
            <div className="grid gap-5 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-3xl font-semibold text-white shadow-[0_20px_60px_rgba(77,132,255,0.3)]">
                    {doctor.profileInitials}
                  </div>
                  <div>
                    <p className="text-lg font-semibold uppercase tracking-[0.24em] text-brand-200">{doctor.specialty}</p>
                    <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">{doctor.name}</h1>
                    <p className="mt-2 text-sm text-ink-300">{doctor.subSpecialty}</p>
                  </div>
                </div>
                <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-4 text-sm text-ink-300">
                  <p className="font-semibold text-white">{doctor.availabilityStatus}</p>
                  <p>{doctor.nextAvailable}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-ink-300">Rating</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{doctor.rating.toFixed(1)}</p>
                  <p className="mt-1 text-sm text-ink-400">{doctor.totalReviews} reviews</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-ink-300">Professional status</p>
                  <p className="mt-2 text-xl font-semibold text-white">Verified specialist</p>
                  <p className="mt-1 text-sm text-ink-400">Affiliated with {doctor.hospitalAffiliation}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.24em] text-brand-200">Location</p>
                <p className="text-lg font-semibold text-white">{doctor.location}</p>
              </div>
              <div className="grid gap-3">
                <Stat label="Years" value={`${doctor.yearsExperience} yrs`} />
                <Stat label="Fee" value={doctor.consultationFee} />
                <Stat label="Languages" value={doctor.languages.join(', ')} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
      <p className="uppercase tracking-[0.24em] text-ink-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

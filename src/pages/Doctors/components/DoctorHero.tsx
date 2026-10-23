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
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="text-sm text-ink-300 transition hover:text-white">
              ← Back
            </button>
            <Badge tone="brand">Doctor profile</Badge>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,0.95fr)_minmax(0,0.55fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.6fr)]">
            <div className="grid min-w-0 gap-5 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-3xl font-semibold text-white shadow-[0_20px_60px_rgba(77,132,255,0.3)]">
                    {doctor.profileInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold uppercase tracking-[0.2em] text-brand-200 sm:text-lg sm:tracking-[0.24em]">{doctor.specialty}</p>
                    <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white sm:text-4xl">{doctor.name}</h1>
                    <p className="mt-2 break-words text-sm text-ink-300">{doctor.subSpecialty}</p>
                  </div>
                </div>
                <div className="min-w-0 space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-4 text-sm text-ink-300">
                  <p className="font-semibold text-white">{doctor.availabilityStatus}</p>
                  <p>{doctor.nextAvailable}</p>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="break-words text-xs uppercase tracking-[0.2em] text-ink-300 sm:text-sm sm:tracking-[0.24em]">Rating</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{doctor.rating.toFixed(1)}</p>
                  <p className="mt-1 text-sm text-ink-400">{doctor.totalReviews} reviews</p>
                </div>
                <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="break-words text-xs uppercase tracking-[0.2em] text-ink-300 sm:text-sm sm:tracking-[0.24em]">Professional status</p>
                  <p className="mt-2 text-xl font-semibold text-white">{doctor.verified ? 'Verified specialist' : 'Unverified listing'}</p>
                  <p className="mt-1 text-sm text-ink-400">
                    {doctor.hospitalAffiliation ? `Affiliated with ${doctor.hospitalAffiliation}` : 'Hospital affiliation unlisted'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="min-w-0 space-y-2">
                <p className="text-sm uppercase tracking-[0.24em] text-brand-200">Location</p>
                <p className="break-words text-lg font-semibold text-white">{doctor.location}</p>
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

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { HospitalDetail } from '../data/hospitalDetailsData';

type HospitalHeroProps = {
  hospital: HospitalDetail;
  onBack: () => void;
};

export function HospitalHero({ hospital, onBack }: HospitalHeroProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.6, ease: 'easeOut' }}
      className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.2)] sm:p-8 xl:p-10"
    >
      <div className="grid gap-8 xl:grid-cols-[1.25fr_0.9fr] xl:items-center">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to Reviews
            </Button>
            <Badge tone="brand">Verified hospital</Badge>
            {hospital.emergencyAvailable && <Badge tone="accent">24/7 emergency</Badge>}
            <Badge tone="neutral">{hospital.distanceKm.toFixed(1)} km away</Badge>
          </div>

          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Hospital review details</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {hospital.name}
            </h1>
            <p className="text-base leading-8 text-ink-300">
              {hospital.type} in {hospital.location} with premium specialty care and modern patient experience pathways.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[0.7fr_0.3fr]">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-ink-400">Overall rating</p>
              <div className="mt-3 flex items-end gap-4">
                <span className="text-5xl font-semibold text-white">{hospital.rating.toFixed(1)}</span>
                <span className="text-sm text-ink-300">based on {hospital.reviewCount.toLocaleString()} reviews</span>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-ink-400">Main specialties</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {hospital.mainSpecialties.map((specialty) => (
                  <Badge key={specialty} tone="neutral" className="text-[0.67rem] uppercase tracking-[0.24em]">
                    {specialty}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%)]" />
          <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-brand-400/10 blur-3xl" />
          <div className="relative space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-ink-400">Premium care</p>
                <p className="mt-2 text-lg font-semibold text-white">Global hospital experience</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-200">
                {hospital.yearsInService}+ years
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.3em] text-ink-400">Patient experience</p>
              <div className="space-y-3">
                {hospital.patientExperienceIndicators.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 text-sm text-ink-300">
                    <span>{item.label}</span>
                    <span className="font-semibold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#0f172a]/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Emergency capacity</p>
                <p className="mt-2 text-lg font-semibold text-white">{hospital.emergencyAvailable ? 'Available 24/7' : 'Limited access'}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-[#0f172a]/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Consultation</p>
                <p className="mt-2 text-lg font-semibold text-white">{hospital.consultationAvailability}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

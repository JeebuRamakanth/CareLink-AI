import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import type { HospitalDetail } from '../data/hospitalDetailsData';

type HospitalLocationProps = {
  hospital: HospitalDetail;
  onGetDirections: () => void;
};

export function HospitalLocation({ hospital, onGetDirections }: HospitalLocationProps) {
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
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Location</p>
          <h2 className="mt-4 text-2xl font-semibold text-white">Hospital address and route guidance</h2>
        </div>
        <div className="grid gap-6 xl:grid-cols-[0.95fr_0.65fr]">
          <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm text-ink-300">{hospital.address}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Location preview</p>
                <p className="mt-2 text-white">{hospital.location}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Distance</p>
                <p className="mt-2 text-white">{hospital.distanceKm.toFixed(1)} km</p>
              </div>
            </div>
            <Button type="button" variant="primary" onClick={onGetDirections}>
              Get Directions
            </Button>
          </div>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
            <div className="h-60 rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(15,23,42,0.95))] p-5 text-white">
              <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Map placeholder</p>
              <div className="mt-5 flex h-full items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-950/80 text-center text-ink-300">
                <span className="max-w-xs text-sm">Map integration ready area. Add a real map here in the next stage.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

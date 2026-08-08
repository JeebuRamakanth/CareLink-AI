import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

type HospitalConnectionProps = {
  hospital: {
    id: string;
    name: string;
    rating: number;
    location: string;
    specialties: string[];
  };
  onViewHospital: () => void;
  onGetDirections: () => void;
};

export function HospitalConnection({ hospital, onViewHospital, onGetDirections }: HospitalConnectionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Hospital connection</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Practice location and affiliation</h2>
          </div>
          <Badge tone="success">Hospital verified</Badge>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <p className="text-lg font-semibold text-white">{hospital.name}</p>
              <p className="mt-2 text-sm text-ink-300">{hospital.location}</p>
              <p className="mt-4 text-sm text-ink-300">Specialties: {hospital.specialties.join(', ')}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-4 text-center text-sm text-ink-300">
              <p className="font-semibold text-white">{hospital.rating.toFixed(1)} ★</p>
              <p className="mt-1">Hospital rating</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={onViewHospital}>
            View Hospital
          </Button>
          <Button type="button" variant="secondary" onClick={onGetDirections}>
            Get Directions
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

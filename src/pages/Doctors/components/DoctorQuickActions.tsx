import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';

type DoctorQuickActionsProps = {
  onBookAppointment: () => void;
  onContactDoctor: () => void;
  onViewHospital: () => void;
  onGetDirections: () => void;
  onWriteReview: () => void;
};

export function DoctorQuickActions({
  onBookAppointment,
  onContactDoctor,
  onViewHospital,
  onGetDirections,
  onWriteReview,
}: DoctorQuickActionsProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.16)]"
    >
      <div className="grid gap-4 lg:grid-cols-[0.9fr_0.7fr]">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Premium actions</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Connect with the doctor quickly</h2>
          <p className="mt-2 text-sm text-ink-300">Choose a premium interaction for consultation planning and care coordination.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" variant="primary" onClick={onBookAppointment}>
            Book Appointment
          </Button>
          <Button type="button" variant="secondary" onClick={onContactDoctor}>
            Contact Doctor
          </Button>
          <Button type="button" variant="secondary" onClick={onViewHospital}>
            View Hospital
          </Button>
          <Button type="button" variant="secondary" onClick={onGetDirections}>
            Get Directions
          </Button>
          <Button type="button" variant="ghost" onClick={onWriteReview} className="col-span-full text-left text-brand-100">
            Write Review
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

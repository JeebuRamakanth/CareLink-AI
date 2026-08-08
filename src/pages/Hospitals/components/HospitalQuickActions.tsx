import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';

type HospitalQuickActionsProps = {
  onViewLocation: () => void;
  onGetDirections: () => void;
  onContact: () => void;
  onWriteReview: () => void;
  onViewDoctors: () => void;
};

const actions = [
  { id: 'location', label: 'View Location', emoji: '📍' },
  { id: 'directions', label: 'Get Directions', emoji: '🗺️' },
  { id: 'contact', label: 'Contact', emoji: '📞' },
  { id: 'review', label: 'Write Review', emoji: '⭐' },
  { id: 'doctors', label: 'View Doctors', emoji: '👨‍⚕️' },
] as const;

export function HospitalQuickActions({ onViewLocation, onGetDirections, onContact, onWriteReview, onViewDoctors }: HospitalQuickActionsProps) {
  const shouldReduceMotion = useReducedMotion();

  const handlers: Record<string, () => void> = {
    location: onViewLocation,
    directions: onGetDirections,
    contact: onContact,
    review: onWriteReview,
    doctors: onViewDoctors,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="grid gap-4 rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.15)] sm:grid-cols-2 xl:grid-cols-5"
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          variant="secondary"
          size="sm"
          fullWidth
          onClick={handlers[action.id]}
          className="justify-start text-left"
        >
          <span>{action.emoji}</span>
          <span>{action.label}</span>
        </Button>
      ))}
    </motion.div>
  );
}

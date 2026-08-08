import { motion } from 'framer-motion';
import type { AppointmentStatus } from '../data/appointmentsData';

type AppointmentTimelineStage = 'Booked' | 'Confirmed' | 'Upcoming' | 'Completed' | 'Cancelled' | 'Rescheduled';

type AppointmentTimelineProps = {
  status: AppointmentStatus;
};

const stages: AppointmentTimelineStage[] = ['Booked', 'Confirmed', 'Upcoming', 'Completed', 'Rescheduled', 'Cancelled'];
const statusToStage: Record<AppointmentStatus, AppointmentTimelineStage> = {
  confirmed: 'Confirmed',
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export function AppointmentTimeline({ status }: AppointmentTimelineProps) {
  const stage = statusToStage[status];
  return (
    <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
      <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Appointment timeline</p>
      <div className="grid gap-4">
        {stages.map((step) => {
          const active = step === stage;
          const completed = stages.indexOf(step) < stages.indexOf(stage);
          return (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex items-center gap-4 rounded-[1.5rem] border px-4 py-3 ${
                active
                  ? 'border-brand-400/30 bg-brand-500/10 text-white'
                  : completed
                  ? 'border-emerald-400/20 bg-emerald-500/10 text-white'
                  : 'border-white/10 bg-slate-950/70 text-ink-300'
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? 'bg-brand-400 text-slate-950' : completed ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-ink-300'}`}>
                {completed ? '✓' : step.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{step}</p>
                <p className="text-sm text-ink-400">{active ? 'Current stage' : completed ? 'Completed stage' : 'Pending stage'}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

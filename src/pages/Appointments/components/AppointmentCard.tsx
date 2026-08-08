import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { BaseCard } from '../../../components/cards/BaseCard';
import { StatusPill } from './StatusPill';
import type { AppointmentRecord } from '../data/appointmentsData';
import { ROUTES } from '../../../routes/routeConstants';

type AppointmentCardProps = {
  appointment: AppointmentRecord;
  onCancel: (appointmentId: string) => void;
  onReschedule: (appointment: AppointmentRecord) => void;
};

export function AppointmentCard({ appointment, onCancel, onReschedule }: AppointmentCardProps) {
  const navigate = useNavigate();

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <BaseCard variant="glass" interactive className="grid gap-4 p-6 lg:grid-cols-[1fr_0.82fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-semibold text-white shadow-[0_18px_60px_rgba(77,132,255,0.18)]">
              {appointment.doctorAvatar}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-white">{appointment.doctorName}</p>
              <p className="text-sm text-ink-300">{appointment.specialty} · {appointment.hospitalName}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm text-ink-300">
            <div>
              <p className="text-ink-400">Date</p>
              <p className="mt-1 text-white">{appointment.date}</p>
            </div>
            <div>
              <p className="text-ink-400">Time</p>
              <p className="mt-1 text-white">{appointment.time}</p>
            </div>
            <div>
              <p className="text-ink-400">Patient</p>
              <p className="mt-1 text-white">{appointment.patientName}</p>
            </div>
            <div>
              <p className="text-ink-400">Booking ID</p>
              <p className="mt-1 text-white">{appointment.appointmentId}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={appointment.status} />
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-ink-300">{appointment.appointmentType}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-ink-300">{appointment.location}</span>
          </div>
        </div>

        <div className="grid gap-3 md:items-end">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
            <p className="font-semibold text-white">Appointment details</p>
            <p className="mt-2">{appointment.consultationMode} consultation</p>
            <p className="mt-1">Booked on {appointment.bookingDate}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(`${ROUTES.appointments}/${appointment.appointmentId}`)}
            >
              View details
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onReschedule(appointment)}>
              Reschedule
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={() => onCancel(appointment.appointmentId)}>
              Cancel
            </Button>
          </div>
        </div>
      </BaseCard>
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import type { AppointmentRecord } from '../data/appointmentsData';

type AppointmentSuccessModalProps = {
  appointment: AppointmentRecord;
  onClose: () => void;
  onViewAppointment: () => void;
  onViewDoctor: () => void;
  onViewHospital: () => void;
};

export function AppointmentSuccessModal({
  appointment,
  onClose,
  onViewAppointment,
  onViewDoctor,
  onViewHospital,
}: AppointmentSuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-6">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Appointment confirmed</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Your CareLink consultation is booked</h2>
            <p className="mt-3 text-sm leading-6 text-ink-300">
              A premium appointment summary has been added to your care command center. You can view details or continue managing your care.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-sm text-ink-300 transition hover:border-white/20 hover:text-white">
            Close
          </button>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_0.95fr]">
          <div className="space-y-5 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-6">
            <div className="rounded-[1.75rem] border border-brand-400/20 bg-brand-500/10 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">Success</p>
              <p className="mt-3 text-lg font-semibold text-white">{appointment.doctorName}</p>
              <p className="mt-2 text-sm text-ink-300">{appointment.hospitalName} • {appointment.appointmentType}</p>
            </div>

            <div className="grid gap-3 text-sm text-ink-300">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                <p className="font-semibold text-white">Date & time</p>
                <p className="mt-2">{appointment.date} at {appointment.time}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                <p className="font-semibold text-white">Consultation fee</p>
                <p className="mt-2">{appointment.consultationFee}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                <p className="font-semibold text-white">Appointment ID</p>
                <p className="mt-2 text-ink-300">{appointment.appointmentId}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Quick actions</p>
            <div className="grid gap-3">
              <Button type="button" variant="primary" onClick={onViewAppointment}>
                View Appointment
              </Button>
              <Button type="button" variant="secondary" onClick={onViewDoctor}>
                View Doctor
              </Button>
              <Button type="button" variant="secondary" onClick={onViewHospital}>
                View Hospital
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Add Reminder
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

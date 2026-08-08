import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import type { AppointmentRecord } from '../data/appointmentsData';

type CancelModalProps = {
  appointment: AppointmentRecord;
  onClose: () => void;
  onConfirm: (appointmentId: string, reason: string) => void;
};

const cancellationReasons = [
  'Patient requested a later appointment',
  'Scheduling conflict',
  'Found an alternative provider',
  'Appointment no longer needed',
];

export function CancelModal({ appointment, onClose, onConfirm }: CancelModalProps) {
  const [selectedReason, setSelectedReason] = useState(cancellationReasons[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Cancel appointment</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Are you sure?</h2>
            <p className="mt-2 text-sm text-ink-300">This action will move the appointment to cancelled status and keep the record in your history.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-ink-300 transition hover:text-white">
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5 text-sm text-ink-300">
            <p className="text-ink-400">Doctor</p>
            <p className="mt-2 text-white">{appointment.doctorName}</p>
            <p className="mt-3 text-ink-400">Hospital</p>
            <p className="mt-2 text-white">{appointment.hospitalName}</p>
            <p className="mt-3 text-ink-400">Date</p>
            <p className="mt-2 text-white">{appointment.date}</p>
            <p className="mt-3 text-ink-400">Time</p>
            <p className="mt-2 text-white">{appointment.time}</p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5 text-sm text-ink-300">
            <p className="text-ink-400">Reason for cancellation</p>
            <div className="mt-4 grid gap-3">
              {cancellationReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(reason)}
                  className={`w-full rounded-[1.5rem] border px-4 py-3 text-left transition ${
                    selectedReason === reason
                      ? 'border-brand-400 bg-brand-500/10 text-white'
                      : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep appointment
            </Button>
            <Button type="button" variant="danger" onClick={() => onConfirm(appointment.appointmentId, selectedReason)}>
              Cancel appointment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

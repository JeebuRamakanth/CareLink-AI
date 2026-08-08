import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import type { AppointmentRecord } from '../data/appointmentsData';

type RescheduleModalProps = {
  appointment: AppointmentRecord;
  onClose: () => void;
  onConfirm: (appointmentId: string, date: string, time: string) => void;
};

const availableDates = ['2026-09-20', '2026-09-21', '2026-09-22'];
const availableTimes = ['9:30 AM', '11:15 AM', '2:00 PM', '4:30 PM'];

export function RescheduleModal({ appointment, onClose, onConfirm }: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState(availableDates[0]);
  const [selectedTime, setSelectedTime] = useState(availableTimes[0]);

  const canConfirm = selectedDate.length > 0 && selectedTime.length > 0;
  const selectedReview = useMemo(() => `${selectedDate} at ${selectedTime}`, [selectedDate, selectedTime]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Reschedule appointment</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Pick a new date and time</h2>
            <p className="mt-2 text-sm text-ink-300">Confirm your updated booking without losing the current appointment details.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-ink-300 transition hover:text-white">
            Close
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[0.95fr_0.75fr]">
          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Select new date</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {availableDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      selectedDate === date
                        ? 'border-brand-400 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                    }`}
                  >
                    <p className="font-semibold">{date}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Select new time</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {availableTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      selectedTime === time
                        ? 'border-brand-400 bg-brand-500/10 text-white'
                        : 'border-white/10 bg-slate-950/75 text-ink-300 hover:border-brand-400/30 hover:bg-white/5'
                    }`}
                  >
                    <p className="font-semibold">{time}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Review new appointment</p>
              <div className="mt-4 space-y-3 text-sm text-ink-300">
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="font-semibold text-white">Doctor</p>
                  <p className="mt-2">{appointment.doctorName}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="font-semibold text-white">New schedule</p>
                  <p className="mt-2 text-white">{selectedReview}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
                  <p className="font-semibold text-white">Location</p>
                  <p className="mt-2">{appointment.hospitalName}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <Button type="button" variant="primary" onClick={() => onConfirm(appointment.appointmentId, selectedDate, selectedTime)} disabled={!canConfirm}>
                Confirm reschedule
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

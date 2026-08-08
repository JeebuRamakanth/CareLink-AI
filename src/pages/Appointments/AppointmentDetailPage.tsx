import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { useAppointmentContext } from '../../contexts/AppointmentContext';
import { StatusPill } from './components/StatusPill';
import { AppointmentTimeline } from './components/AppointmentTimeline';
import { RescheduleModal } from './components/RescheduleModal';
import { CancelModal } from './components/CancelModal';
import './appointments.css';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { getAppointmentById, rescheduleAppointment, cancelAppointment } = useAppointmentContext();
  const appointment = useMemo(() => appointmentId && getAppointmentById(appointmentId), [appointmentId, getAppointmentById]);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  if (!appointment) {
    return (
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/80 p-10 text-center text-ink-300">
          <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Appointment not found</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">We could not locate that booking.</h1>
          <p className="mt-3">Check your appointment list or book a new consultation from the doctor profile.</p>
        </div>
      </Container>
    );
  }

  const schedule = `${appointment.date} at ${appointment.time}`;

  return (
    <Container className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_0.4fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Appointment details</p>
                <h1 className="mt-3 text-3xl font-semibold text-white">{appointment.doctorName}</h1>
                <p className="mt-3 text-sm text-ink-300">{appointment.hospitalName} • {appointment.appointmentType}</p>
              </div>
              <StatusPill status={appointment.status} />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <DetailBlock label="Patient" value={appointment.patientName} />
              <DetailBlock label="Contact" value={appointment.contactPhone} />
              <DetailBlock label="Scheduled" value={schedule} />
              <DetailBlock label="Mode" value={appointment.consultationMode} />
            </div>

            <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Care summary</p>
<p className="mt-4 text-sm leading-7 text-ink-300">{appointment.preparationNotes ?? appointment.notes}</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Appointment journey</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Track each stage</h2>
              </div>
              <div className="text-right text-sm text-ink-300">
                <p>{schedule}</p>
                <p className="mt-1">{appointment.location}</p>
              </div>
            </div>
            <AppointmentTimeline status={appointment.status} />
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-6">
            <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Quick actions</p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => setIsRescheduleOpen(true)}
                className="rounded-[1.75rem] border border-brand-400/30 bg-brand-500/10 px-5 py-4 text-left text-sm font-semibold text-white transition hover:border-brand-400 hover:bg-brand-500/15"
              >
                Reschedule appointment
              </button>
              <button
                type="button"
                onClick={() => setIsCancelOpen(true)}
                className="rounded-[1.75rem] border border-white/10 bg-slate-950/75 px-5 py-4 text-left text-sm font-semibold text-ink-300 transition hover:border-brand-400/30 hover:text-white"
              >
                Cancel appointment
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-6">
            <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Appointment notes</p>
            <p className="mt-4 text-sm leading-7 text-ink-300">Review the full appointment summary, then use quick actions to keep your care timeline updated in real time.</p>
          </div>
        </aside>
      </div>

      {isRescheduleOpen ? (
        <RescheduleModal
          appointment={appointment}
          onClose={() => setIsRescheduleOpen(false)}
          onConfirm={(appointmentId, date, time) => {
            rescheduleAppointment(appointmentId, date, time);
            setIsRescheduleOpen(false);
          }}
        />
      ) : null}

      {isCancelOpen ? (
        <CancelModal
          appointment={appointment}
          onClose={() => setIsCancelOpen(false)}
          onConfirm={(appointmentId, reason) => {
            cancelAppointment(appointmentId, reason);
            setIsCancelOpen(false);
          }}
        />
      ) : null}
    </Container>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{label}</p>
      <p className="mt-3 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

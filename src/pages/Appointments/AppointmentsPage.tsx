import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Container } from '../../components/ui/Container';
import { AppointmentsFilters } from './components/AppointmentsFilters';
import { AppointmentCard } from './components/AppointmentCard';
import { CancelModal } from './components/CancelModal';
import { RescheduleModal } from './components/RescheduleModal';
import { useAppointments } from './hooks/useAppointments';
import type { AppointmentRecord, AppointmentStatus } from './data/appointmentsData';
import './appointments.css';

const statusLabels: Record<AppointmentStatus | 'all', string> = {
  all: 'All appointments',
  upcoming: 'Upcoming appointments',
  confirmed: 'Confirmed appointments',
  completed: 'Completed appointments',
  cancelled: 'Cancelled appointments',
  rescheduled: 'Rescheduled appointments',
};

export function AppointmentsPage() {
  const { appointments, rescheduleAppointment, cancelAppointment } = useAppointments();
  const [activeTab, setActiveTab] = useState<AppointmentStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentActionAppointment, setCurrentActionAppointment] = useState<AppointmentRecord | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (activeTab !== 'all' && appointment.status !== activeTab) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        appointment.doctorName.toLowerCase().includes(query) ||
        appointment.hospitalName.toLowerCase().includes(query) ||
        appointment.appointmentId.toLowerCase().includes(query) ||
        appointment.patientName.toLowerCase().includes(query)
      );
    });
  }, [appointments, activeTab, searchQuery]);

  const handleReschedule = (appointment: AppointmentRecord) => {
    setCurrentActionAppointment(appointment);
    setIsRescheduleOpen(true);
  };

  const handleCancel = (appointmentId: string) => {
    setPendingCancelId(appointmentId);
    setIsCancelOpen(true);
  };

  const activeCount = filteredAppointments.length;

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <AppointmentsFilters
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </motion.div>

      <div className="mt-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Dashboard</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">{statusLabels[activeTab]}</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/80 px-5 py-3 text-sm text-ink-300">
            {activeCount} appointment{activeCount === 1 ? '' : 's'} found
          </div>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="appointments-empty rounded-[2rem] border border-white/10 bg-slate-950/75 p-10 text-center text-ink-300">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-200">No appointments yet</p>
            <h3 className="mt-4 text-2xl font-semibold text-white">You don’t have any appointments in this section.</h3>
            <p className="mt-3 max-w-2xl mx-auto text-sm leading-7">Browse doctors or hospitals, then book a premium consultation to populate your care command center.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAppointments.map((appointment) => (
              <AppointmentCard
                key={appointment.appointmentId}
                appointment={appointment}
                onCancel={handleCancel}
                onReschedule={handleReschedule}
              />
            ))}
          </div>
        )}
      </div>

      {isRescheduleOpen && currentActionAppointment ? (
        <RescheduleModal
          appointment={currentActionAppointment}
          onClose={() => setIsRescheduleOpen(false)}
          onConfirm={(appointmentId, date, time) => {
            rescheduleAppointment(appointmentId, date, time);
            setIsRescheduleOpen(false);
          }}
        />
      ) : null}

      {isCancelOpen && pendingCancelId ? (
        <CancelModal
          appointment={appointments.find((item) => item.appointmentId === pendingCancelId)!}
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

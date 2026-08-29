import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { mockAppointments } from '../pages/Appointments/data/appointmentsData';
import type { AppointmentRecord } from '../pages/Appointments/data/appointmentsData';
import { createAppointment, cancelAppointment as persistCancel, rescheduleAppointment as persistReschedule } from '../services/health-data/appointmentsRepository';
import { isSupabaseConfigured } from '../services/supabase/client';

const APPOINTMENTS_STORAGE_KEY = 'carelink_ai_appointments';

interface AppointmentContextValue {
  appointments: AppointmentRecord[];
  addAppointment: (appointment: AppointmentRecord) => void;
  rescheduleAppointment: (appointmentId: string, date: string, time: string) => void;
  cancelAppointment: (appointmentId: string, reason: string) => void;
  getAppointmentById: (appointmentId: string) => AppointmentRecord | undefined;
}

const AppointmentContext = createContext<AppointmentContextValue | undefined>(undefined);

export function AppointmentProvider({ children }: { children: React.ReactNode }) {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>(() => {
    if (typeof window === 'undefined') return mockAppointments;
    try {
      const stored = window.localStorage.getItem(APPOINTMENTS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as AppointmentRecord[];
      }
    } catch {
      // ignore parse errors and fall back to mock data
    }
    return mockAppointments;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(appointments));
  }, [appointments]);

  const value = useMemo(
    () => ({
      appointments,
      addAppointment: (appointment: AppointmentRecord) => {
        setAppointments((current) => [appointment, ...current]);
        // Persist a REAL database appointment when Supabase is configured. The
        // localStorage-backed flow remains the synchronous UX; DB persistence is
        // best-effort and never blocks/fails the booking experience (Phase 18)。
        if (isSupabaseConfigured()) {
          void createAppointment({
            family_profile_id: null,
            doctor_id: appointment.doctorId,
            doctor_name: appointment.doctorName,
            specialty: appointment.specialty,
            hospital_id: appointment.hospitalId,
            hospital_name: appointment.hospitalName,
            appointment_type: appointment.appointmentType,
            scheduled_date: appointment.date,
            scheduled_time: appointment.time,
            status: appointment.status,
            consultation_fee: appointment.consultationFee,
            notes: appointment.notes,
            preparation_notes: appointment.preparationNotes,
            consultation_mode: appointment.consultationMode,
            location: appointment.location,
          });
        }
      },
      rescheduleAppointment: (appointmentId: string, date: string, time: string) => {
        setAppointments((current) =>
          current.map((appointment) =>
            appointment.appointmentId === appointmentId
              ? {
                  ...appointment,
                  rescheduleInfo: {
                    previousDate: appointment.date,
                    previousTime: appointment.time,
                    rescheduledAt: new Date().toISOString(),
                  },
                  date,
                  time,
                  status: 'rescheduled',
                }
              : appointment
          )
        );
        if (isSupabaseConfigured()) {
          void persistReschedule(appointmentId, date, time).catch(() => null);
        }
      },
      cancelAppointment: (appointmentId: string, reason: string) => {
        setAppointments((current) =>
          current.map((appointment) =>
            appointment.appointmentId === appointmentId
              ? {
                  ...appointment,
                  status: 'cancelled',
                  cancellationReason: reason,
                  cancellationDate: new Date().toISOString(),
                }
              : appointment
          )
        );
        if (isSupabaseConfigured()) {
          void persistCancel(appointmentId, reason).catch(() => null);
        }
      },
      getAppointmentById: (appointmentId: string) => appointments.find((item) => item.appointmentId === appointmentId),
    }),
    [appointments]
  );

  return <AppointmentContext.Provider value={value}>{children}</AppointmentContext.Provider>;
}

export function useAppointmentContext() {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error('useAppointmentContext must be used within AppointmentProvider');
  }
  return context;
}

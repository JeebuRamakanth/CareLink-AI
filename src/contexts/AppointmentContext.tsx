import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { seedAppointments } from '../pages/Appointments/data/appointmentsData';
import type { AppointmentRecord, AppointmentStatus } from '../pages/Appointments/data/appointmentsData';
import {
  cancelAppointment as persistCancel,
  createAppointment,
  listAppointments,
  rescheduleAppointment as persistReschedule,
} from '../services/health-data/appointmentsRepository';
import {
  cancelAppointmentRequest,
  listMyAppointmentRequests,
  type AppointmentRequestRow,
} from '../services/health-data/appointmentRequestsRepository';
import { isSupabaseConfigured } from '../services/supabase/client';

const APPOINTMENTS_STORAGE_KEY = 'carelink_ai_appointments';

interface AppointmentContextValue {
  appointments: AppointmentRecord[];
  addAppointment: (appointment: AppointmentRecord) => void;
  rescheduleAppointment: (appointmentId: string, date: string, time: string) => void;
  cancelAppointment: (appointmentId: string, reason: string) => void;
  getAppointmentById: (appointmentId: string) => AppointmentRecord | undefined;
  refreshFromBackend: () => Promise<void>;
}

const AppointmentContext = createContext<AppointmentContextValue | undefined>(undefined);

export function AppointmentProvider({ children }: { children: React.ReactNode }) {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>(() => {
    if (typeof window === 'undefined') return seedAppointments;
    try {
      const stored = window.localStorage.getItem(APPOINTMENTS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as AppointmentRecord[];
      }
    } catch {
      // ignore parse errors and fall back to mock data
    }
    return seedAppointments;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(appointments));
  }, [appointments]);

  // Load real DB appointments when Supabase is configured so the dashboard
  // reflects server truth (merged with local-only rows, never duplicating on
  // matching dbId/appointmentId). Refreshing never drops mock/local-only rows.

  const refreshFromBackend = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const [rows, requestRows] = await Promise.all([
      listAppointments(),
      listMyAppointmentRequests(),
    ]);
    if ((!rows || rows.length === 0) && (!requestRows || requestRows.length === 0)) return;
    setAppointments((current) => {
      const byLocalId = new Map(current.map((a) => [a.dbId ?? a.appointmentId, a]));
      let next = [...current];
      for (const row of rows ?? []) {
        const existing = byLocalId.get(row.id);
        if (existing) {
          // Keep the local UI shape but refresh status/family linkage from the DB..
          next = next.map((a) =>
            (a.dbId ?? a.appointmentId) === row.id
              ? {
                  ...a,
                  dbId: row.id,
                  familyProfileId: row.family_profile_id ?? a.familyProfileId,
                  status: (row.status as AppointmentStatus) ?? a.status,
                  date: row.scheduled_date ?? a.date,
                  time: row.scheduled_time ?? a.time,
                }
              : a
          );
          byLocalId.set(row.id, existing);
        } else {
          next.unshift(rowToAppointment(row));
        }
      }
      // PENDING requests are loaded from their own owner-scoped RPC. They are a
      // REQUEST awaiting confirmation — never merged into the confirmed list.
      for (const request of requestRows ?? []) {
        if (next.some((a) => a.appointmentId === request.id || a.requestKey === request.request_key)) continue;
        next.unshift(rowToRequestAppointment(request));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || typeof window === 'undefined') return;
    void refreshFromBackend();
  }, [refreshFromBackend]);

  const value = useMemo(
    () => ({
      appointments,
      refreshFromBackend,
      addAppointment: (appointment: AppointmentRecord) => {
        setAppointments((current) => [appointment, ...current]);
        // A PENDING request is already persisted through the guarded
        // carelink_request_appointment RPC; it must NOT also be written to the
        // `appointments` table (that would fabricate a confirmation).
        if (appointment.isRequest) return;
        // Persist a REAL database appointment when Supabase is configured. Once
        // the DB insert succeeds, the returned row id is stored back into the local
        // record (`dbId`) so later reschedule/cancel/status refresh target the real row.

        if (isSupabaseConfigured()) {
          void (async () => {
            const { appointment: saved } = await createAppointment({
              family_profile_id: appointment.familyProfileId ?? null,
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
            if (saved?.id) {
              setAppointments((current) =>
                current.map((a) =>
                  a.appointmentId === appointment.appointmentId
                    ? { ...a, dbId: saved.id }
                    : a
                )
              );
            }
          })();
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
          const target = appointments.find((a) => a.appointmentId === appointmentId);
          const dbId = target?.dbId ?? appointmentId;
          void persistReschedule(dbId, date, time).catch(() => null);
        }
      },
      cancelAppointment: (appointmentId: string, reason: string) => {
        const target = appointments.find((a) => a.appointmentId === appointmentId);
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
        if (!isSupabaseConfigured()) return;
        // A pending REQUEST is cancelled through its own RPC (owner-scoped,
        // pending-only); a confirmed appointment uses the appointments repo.
        if (target?.isRequest) {
          void cancelAppointmentRequest(target.dbId ?? target.appointmentId, reason).catch(() => null);
          return;
        }
        const dbId = target?.dbId ?? appointmentId;
        void persistCancel(dbId, reason).catch(() => null);
      },
      getAppointmentById: (appointmentId: string) => appointments.find((item) => item.appointmentId === appointmentId),
    }),
    [appointments, refreshFromBackend]
  );

  return <AppointmentContext.Provider value={value}>{children}</AppointmentContext.Provider>;
}

/** Convert a real DB appointment row into the UI's AppointmentRecord shape. */
function rowToAppointment(row: NonNullable<Awaited<ReturnType<typeof listAppointments>>>[number]): AppointmentRecord {
  return {
    appointmentId: `${row.id}`,
    dbId: row.id,
    doctorId: row.doctor_id ?? '',
    doctorName: row.doctor_name ?? 'Doctor',
    specialty: row.specialty ?? '',
    doctorAvatar: (row.doctor_name ?? 'D').split(/\s+/).map((s) => s.charAt(0)).join('').slice(0, 2).toUpperCase(),
    hospitalId: row.hospital_id ?? '',
    hospitalName: row.hospital_name ?? 'Hospital',
    patientId: '',
    patientName: 'Myself',
    appointmentType: (row.appointment_type as AppointmentRecord['appointmentType']) ?? 'Consultation',
    date: row.scheduled_date,
    time: row.scheduled_time,
    status: (row.status as AppointmentStatus) ?? 'confirmed',
    consultationFee: row.consultation_fee ?? '',
    bookingTimestamp: row.created_at,
    bookingDate: row.created_at ? row.created_at.slice(0, 10) : '',
    notes: row.notes ?? '',
    preparationNotes: row.preparation_notes ?? '',
    location: row.location ?? '',
    consultationMode: row.consultation_mode ?? 'In-person',
    contactPhone: '',
    contactEmail: '',
    hospitalAddress: '',
    doctorLocation: row.location ?? '',
    familyProfileId: row.family_profile_id ?? undefined,
  };
}

/**
 * Convert a persisted appointment REQUEST row into the UI's AppointmentRecord
 * shape. It stays status `pending` with `isRequest: true` so the dashboard never
 * presents it as a confirmed hospital appointment.
 */
function rowToRequestAppointment(row: AppointmentRequestRow): AppointmentRecord {
  const doctorName = row.doctor_name ?? 'Requested doctor';
  return {
    appointmentId: row.id,
    dbId: row.id,
    requestKey: row.request_key,
    isRequest: row.status === 'pending',
    familyProfileId: row.family_profile_id ?? undefined,
    doctorId: row.doctor_id ?? '',
    doctorName,
    specialty: row.specialty ?? '',
    doctorAvatar: doctorName.split(/\s+/).map((s) => s.charAt(0)).join('').slice(0, 2).toUpperCase(),
    hospitalId: row.hospital_id ?? '',
    hospitalName: row.hospital_name ?? 'Hospital',
    patientId: '',
    patientName: 'Myself',
    appointmentType: (row.appointment_type as AppointmentRecord['appointmentType']) ?? 'Consultation',
    date: row.scheduled_date,
    time: row.scheduled_time,
    status: (row.status as AppointmentStatus) ?? 'pending',
    consultationFee: '',
    bookingTimestamp: row.created_at,
    bookingDate: row.created_at ? row.created_at.slice(0, 10) : '',
    notes: row.reason ?? '',
    location: '',
    consultationMode: 'In-person',
    contactPhone: '',
    contactEmail: '',
    hospitalAddress: '',
    doctorLocation: '',
  };
}

export function useAppointmentContext() {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error('useAppointmentContext must be used within AppointmentProvider');
  }
  return context;
}

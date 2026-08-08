import { useAppointmentContext } from '../../../contexts/AppointmentContext';

export function useAppointments() {
  return useAppointmentContext();
}

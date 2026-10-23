export type AppointmentStatus = 'pending' | 'confirmed' | 'upcoming' | 'completed' | 'cancelled' | 'rescheduled';
export type AppointmentType = 'Consultation' | 'Follow-up' | 'Telehealth';

export interface RescheduleInfo {
  previousDate: string;
  previousTime: string;
  rescheduledAt: string;
}

export interface AppointmentRecord {
  appointmentId: string;
  dbId?: string;
  /**
   * Idempotency key for the request that produced this record. Present for a
   * PENDING request so a retry targets the same server row instead of creating
   * a duplicate.
   */
  requestKey?: string;
  /** True when this record is a REQUEST awaiting provider confirmation. */
  isRequest?: boolean;
  /** Optional real family-profile id scoped to the booking owner. */
  familyProfileId?: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  doctorAvatar: string;
  hospitalId: string;
  hospitalName: string;
  patientId: string;
  patientName: string;
  appointmentType: AppointmentType;
  date: string;
  time: string;
  status: AppointmentStatus;
  consultationFee: string;
  bookingTimestamp: string;
  bookingDate: string;
  notes: string;
  preparationNotes?: string;
  cancellationReason?: string;
  cancellationDate?: string;
  rescheduleInfo?: RescheduleInfo;
  location: string;
  consultationMode: string;
  contactPhone: string;
  contactEmail: string;
  hospitalAddress: string;
  doctorLocation: string;
}

/**
 * Seeded appointments shown before the user books anything.
 *
 * INTENTIONALLY EMPTY. The previous seed contained invented bookings for
 * facilities that do not exist in the CareLink corridor, complete with
 * fabricated phone numbers, email addresses and street addresses. No booking,
 * contact detail or facility is invented anywhere in this app, so a new user
 * starts with a genuinely empty history and the page shows its honest
 * "no appointments yet" state until a real request is persisted.
 */
export const seedAppointments: AppointmentRecord[] = [];

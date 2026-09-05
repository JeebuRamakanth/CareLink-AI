export type AppointmentStatus = 'confirmed' | 'upcoming' | 'completed' | 'cancelled' | 'rescheduled';
export type AppointmentType = 'Consultation' | 'Follow-up' | 'Telehealth';

export interface RescheduleInfo {
  previousDate: string;
  previousTime: string;
  rescheduledAt: string;
}

export interface AppointmentRecord {
  appointmentId: string;
  dbId?: string;
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

export const mockAppointments: AppointmentRecord[] = [
  {
    appointmentId: 'appt-001',
    doctorId: 'anjali-desai',
    doctorName: 'Dr. Anjali Desai',
    specialty: 'Pediatrics',
    doctorAvatar: 'AD',
    hospitalId: 'luma-children-hospital',
    hospitalName: 'Luma Children’s Hospital',
    patientId: 'patient-1',
    patientName: 'Myself',
    appointmentType: 'Consultation',
    date: '2026-09-18',
    time: '10:30 AM',
    status: 'confirmed',
    consultationFee: '$170',
    bookingTimestamp: '2026-08-08T09:12:00Z',
    bookingDate: '2026-08-08',
    notes: 'Arrive 10 minutes early with previous pediatric records. Bring a list of symptoms and current medications.',
    location: 'Toronto, Canada',
    consultationMode: 'In-person',
    contactPhone: '+1 (416) 555-0145',
    contactEmail: 'appointments@lumachildrens.ca',
    hospitalAddress: '18 Maple Avenue, Toronto, ON',
    doctorLocation: 'Toronto, Canada',
  },
  {
    appointmentId: 'appt-002',
    doctorId: 'sophia-miller',
    doctorName: 'Dr. Sophia Miller',
    specialty: 'Neonatal Care',
    doctorAvatar: 'SM',
    hospitalId: 'luma-children-hospital',
    hospitalName: 'Luma Children’s Hospital',
    patientId: 'patient-2',
    patientName: 'Child (age 4)',
    appointmentType: 'Follow-up',
    date: '2026-08-12',
    time: '2:00 PM',
    status: 'completed',
    consultationFee: '$160',
    bookingTimestamp: '2026-07-22T14:05:00Z',
    bookingDate: '2026-07-22',
    notes: 'Ensure the video connection is ready and the child has access to a quiet space.',
    location: 'Toronto, Canada',
    consultationMode: 'Telehealth',
    contactPhone: '+1 (416) 555-0145',
    contactEmail: 'appointments@lumachildrens.ca',
    hospitalAddress: '18 Maple Avenue, Toronto, ON',
    doctorLocation: 'Toronto, Canada',
  },
  {
    appointmentId: 'appt-003',
    doctorId: 'louise-grant',
    doctorName: 'Dr. Louise Grant',
    specialty: 'Orthopedics',
    doctorAvatar: 'LG',
    hospitalId: 'northside-health-pavilion',
    hospitalName: 'Northside Health Pavilion',
    patientId: 'patient-3',
    patientName: 'Family member',
    appointmentType: 'Consultation',
    date: '2026-08-25',
    time: '11:00 AM',
    status: 'cancelled',
    consultationFee: '$185',
    bookingTimestamp: '2026-08-01T08:30:00Z',
    bookingDate: '2026-08-01',
    notes: 'Bring any imaging reports and a summary of injury history.',
    cancellationReason: 'Patient requested a later appointment',
    cancellationDate: '2026-08-18',
    location: 'London, United Kingdom',
    consultationMode: 'In-person',
    contactPhone: '+44 20 7946 0958',
    contactEmail: 'reception@northsidehealth.co.uk',
    hospitalAddress: '55 Camden Road, London, NW1 9JY',
    doctorLocation: 'London, United Kingdom',
  },
];

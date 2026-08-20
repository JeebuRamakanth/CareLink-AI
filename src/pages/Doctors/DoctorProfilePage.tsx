import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { Button } from '../../components/ui/Button';
import { useAppointmentContext } from '../../contexts/AppointmentContext';
import { DoctorHero } from './components/DoctorHero';
import { DoctorQuickActions } from './components/DoctorQuickActions';
import { DoctorProfessionalProfile } from './components/DoctorProfessionalProfile';
import { DoctorExperience } from './components/DoctorExperience';
import { DoctorExpertise } from './components/DoctorExpertise';
import { DoctorMatchSummary } from './components/DoctorMatchSummary';
import { DoctorRatingSummary } from './components/DoctorRatingSummary';
import { DoctorReviewSection } from './components/DoctorReviewSection';
import { DoctorAvailability } from './components/DoctorAvailability';
import { DoctorConsultationInfo } from './components/DoctorConsultationInfo';
import { HospitalConnection } from './components/HospitalConnection';
import { RelatedDoctors } from './components/RelatedDoctors';
import { DoctorBookingModal } from './components/DoctorBookingModal';
import { AppointmentSuccessModal } from '../Appointments/components/AppointmentSuccessModal';
import { getDoctorProfileByAnyId, doctorReviewFilters } from './data/doctorProfileData';
import type { DoctorReviewFilterOption } from './data/doctorProfileData';
import type { AppointmentRecord } from '../Appointments/data/appointmentsData';
import { ROUTES } from '../../routes/routeConstants';

export function DoctorProfilePage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const doctor = useMemo(() => getDoctorProfileByAnyId(doctorId), [doctorId]);
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<DoctorReviewFilterOption>('All');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedPatientProfile, setSelectedPatientProfile] = useState('Myself');
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [successAppointment, setSuccessAppointment] = useState<AppointmentRecord | null>(null);
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const { addAppointment } = useAppointmentContext();

  const patientProfiles = useMemo(() => ['Myself', 'Child (age 4)', 'Family member'], []);

  // Deep-link from directory cards: /doctors/:id?book=1 opens the booking flow.
  useEffect(() => {
    if (doctor && searchParams.get('book') === '1') {
      setIsBookingOpen(true);
      searchParams.delete('book');
      setSearchParams(searchParams, { replace: true });
    }
  }, [doctor, searchParams, setSearchParams]);

  const filteredReviews = useMemo(() => {
    if (!doctor) return [];
    const reviews = [...doctor.reviews];
    if (selectedReviewFilter === 'Most Recent') {
      return reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    if (selectedReviewFilter === 'Highest Rated') {
      return reviews.sort((a, b) => b.rating - a.rating || new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    if (selectedReviewFilter === 'Most Helpful') {
      return reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
    }
    if (selectedReviewFilter === 'Treatment-related') {
      return reviews
        .filter((review) => review.isTreatmentRelated)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    if (selectedReviewFilter !== 'All') {
      const stars = Number(selectedReviewFilter[0]);
      return reviews.filter((review) => review.rating === stars).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [doctor, selectedReviewFilter]);

  if (!doctor) {
    return (
      <Container className="py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-10 text-center text-ink-300">
          <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Doctor not found</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">This doctor profile is unavailable.</h1>
          <p className="mt-3 text-base leading-7 text-ink-400">
            Please return to the hospital experience or doctor directory to select another specialist.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.reviews)}>
              Back to Reviews
            </Button>
            <Button type="button" variant="primary" onClick={() => navigate(ROUTES.doctors)}>
              Browse Doctors
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-10" ref={topSectionRef}>
        {doctor.isBridgeProfile ? (
          <div className="rounded-[1.5rem] border border-brand-400/20 bg-brand-400/10 p-4 text-sm leading-6 text-brand-100">
            This profile is shown from directory data — availability is derived from the doctor’s listed schedule.
            Detailed credentials, verified reviews and hospital affiliations are confirmed during onboarding.
          </div>
        ) : null}
        <DoctorHero doctor={doctor} onBack={() => navigate(-1)} />
        <DoctorQuickActions
          onBookAppointment={() => setIsBookingOpen(true)}
          onContactDoctor={() => window.alert('Contact doctor flow is mocked. Email or phone integration would come next.')}
          onViewHospital={() => navigate(`/hospitals/${doctor.hospitalConnection.id}`)}
          onGetDirections={() => window.alert('Directions are mocked. Map integration can be added here.')}
          onWriteReview={() => window.alert('Review writing is part of the premium experience and is mocked here.')}
        />
        {bookingMessage ? (
          <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {bookingMessage}
          </div>
        ) : null}

        <div className="grid gap-8 xl:grid-cols-[0.92fr_0.78fr] xl:items-start">
          <div className="space-y-8">
            <DoctorMatchSummary
              matchInfo={
                doctor.profileMatch ?? {
                  score: 92,
                  label: 'Premium clinical care match',
                  disclaimer: 'Premium matching is based on specialty alignment, review strength, and availability.',
                  tags: ['Specialty fit', 'Fast response', 'Family care'],
                  description: 'This match highlights the doctor’s suitability for complex pediatric and family-centered referrals.',
                }
              }
              patientsTreated={doctor.patientsTreated ?? 0}
              treatmentRate={doctor.treatmentRate ?? 'N/A'}
              verifiedReviewCount={doctor.verifiedReviewCount ?? doctor.totalReviews}
            />
            <DoctorProfessionalProfile doctor={doctor} />
            <DoctorExperience metrics={doctor.performanceMetrics} />
            <DoctorExpertise expertise={doctor.expertiseList} />
            <DoctorRatingSummary
              rating={doctor.rating}
              totalReviews={doctor.totalReviews}
              starBreakdown={doctor.starBreakdown}
              categoryRatings={doctor.categoryRatings}
            />
            <DoctorReviewSection
              reviews={filteredReviews}
              activeFilter={selectedReviewFilter}
              filters={doctorReviewFilters}
              onFilterChange={setSelectedReviewFilter}
            />
          </div>
          <div className="space-y-8">
            <DoctorAvailability
              slots={doctor.availabilitySlots}
              selectedSlot={selectedSlot}
              onSlotSelect={setSelectedSlot}
            />
            <DoctorConsultationInfo consultationInfo={doctor.consultationInfo} />
            <HospitalConnection hospital={doctor.hospitalConnection} onViewHospital={() => navigate(`/hospitals/${doctor.hospitalConnection.id}`)} onGetDirections={() => window.alert('Open directions for the selected hospital (mocked).')} />
          </div>
        </div>

        <RelatedDoctors doctors={doctor.relatedDoctors} onViewProfile={(id) => navigate(`/doctors/${id}`)} />
      </div>
      {isBookingOpen ? (
        <DoctorBookingModal
          doctor={doctor}
          selectedSlotId={selectedSlot}
          patientProfiles={patientProfiles}
          selectedProfile={selectedPatientProfile}
          onSelectProfile={setSelectedPatientProfile}
          onClose={() => setIsBookingOpen(false)}
          onConfirm={(slotId, profile, appointmentType) => {
            const selectedSlotDetail = doctor.availabilitySlots.find((slot) => slot.id === slotId);
            if (!selectedSlotDetail) return;

            const appointmentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `appt-${Date.now()}`;

            const newAppointment: AppointmentRecord = {
              appointmentId,
              doctorId: doctor.id,
              doctorName: doctor.name,
              specialty: doctor.specialty,
              doctorAvatar: doctor.profileInitials,
              hospitalId: doctor.hospitalId,
              hospitalName: doctor.hospitalAffiliation,
              patientId: profile.toLowerCase().replace(/\s+/g, '-'),
              patientName: profile,
              appointmentType,
              date: selectedSlotDetail.day,
              time: selectedSlotDetail.time,
              status: 'confirmed',
              consultationFee: doctor.consultationFee,
              bookingTimestamp: new Date().toISOString(),
              bookingDate: new Date().toISOString().split('T')[0],
              notes: `New appointment booked for ${profile} with Dr. ${doctor.name}.`,
              preparationNotes: `Prepare for your ${appointmentType.toLowerCase()} with Dr. ${doctor.name}. Bring any recent health information or symptom notes.`,
              location: doctor.location,
              consultationMode: doctor.consultationInfo.modes[0] ?? 'In-person',
              contactPhone: '+1 (800) 555-0199',
              contactEmail: 'support@carelink.ai',
              hospitalAddress: doctor.hospitalConnection.address,
              doctorLocation: doctor.location,
            };

            addAppointment(newAppointment);
            setSuccessAppointment(newAppointment);
            setIsBookingOpen(false);
            setBookingMessage(
              `Appointment confirmed for ${profile} (${appointmentType}) at ${selectedSlotDetail.day}, ${selectedSlotDetail.time}.`
            );
          }}
        />
      ) : null}
      {successAppointment ? (
        <AppointmentSuccessModal
          appointment={successAppointment}
          onClose={() => setSuccessAppointment(null)}
          onViewAppointment={() => {
            setSuccessAppointment(null);
            navigate(ROUTES.appointments);
          }}
          onViewDoctor={() => {
            setSuccessAppointment(null);
            navigate(`/doctors/${doctor.id}`);
          }}
          onViewHospital={() => {
            setSuccessAppointment(null);
            navigate(`/hospitals/${doctor.hospitalConnection.id}`);
          }}
        />
      ) : null}
    </Container>
  );
}

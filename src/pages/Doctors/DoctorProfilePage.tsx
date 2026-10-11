import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { Button } from '../../components/ui/Button';
import { useAppointmentContext } from '../../contexts/AppointmentContext';
import { useAgent } from '../../contexts/AgentContext';
import { ReviewComposer } from '../../components/reviews/ReviewComposer';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { directionsUrl } from '../../services/maps/mapsService';
import type { BookingPatientOption, BookingSelection } from './components/DoctorBookingModal';
import type { AppointmentType } from '../Appointments/data/appointmentsData';
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
import { getDoctorProfileById, doctorReviewFilters, buildDoctorProfileFromDirectory } from './data/doctorProfileData';
import type { DoctorReviewFilterOption } from './data/doctorProfileData';
import { getDoctorById } from '../../services/doctorService';
import type { AppointmentRecord } from '../Appointments/data/appointmentsData';
import {
  requestAppointment,
  newRequestKey,
  type AppointmentRequestResult,
} from '../../services/health-data/appointmentRequestsRepository';
import { isSupabaseConfigured } from '../../services/supabase/client';
import { ROUTES } from '../../routes/routeConstants';

export function DoctorProfilePage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const navigate = useNavigate();
  const previewDoctor = useMemo(() => getDoctorProfileById(doctorId), [doctorId]);
  const [directoryDoctor, setDirectoryDoctor] = useState<ReturnType<typeof buildDoctorProfileFromDirectory> | null>(null);

  // Fallback: an id that is not a hand-authored preview profile is resolved from
  // the real directory (Supabase registry or sourced Machilipatnam fallback) and
  // adapted to the SAME profile shape so the existing UI renders it.
  useEffect(() => {
    let cancelled = false;
    if (!doctorId || previewDoctor) {
      setDirectoryDoctor(null);
      return;
    }
    (async () => {
      try {
        const real = await getDoctorById(doctorId);
        if (cancelled) return;
        setDirectoryDoctor(real ? buildDoctorProfileFromDirectory(real) : null);
      } catch {
        if (!cancelled) setDirectoryDoctor(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doctorId, previewDoctor]);

  const doctor = previewDoctor ?? directoryDoctor ?? null;
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<DoctorReviewFilterOption>('All');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [contactNotice, setContactNotice] = useState<string | null>(null);
  const [successAppointment, setSuccessAppointment] = useState<AppointmentRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const { addAppointment } = useAppointmentContext();
  const agent = useAgent();
  const locationCtx = useOptionalLocationContext();

  // Real family profiles (self + authenticated family members when configured;
  // falls back to the static self/mock set) — never invents a profile the server
  // cannot also identify. The selected patient is persisted onto the appointment row.


  const patientProfiles = useMemo<BookingPatientOption[]>(() => {
    const profiles = agent.patientProfiles.length > 0 ? agent.patientProfiles : [];
    const self: BookingPatientOption = { id: 'self', label: 'Myself' };
    const rest: BookingPatientOption[] = profiles.map((p) => ({ id: p.id, label: p.label }));
    return [self, ...rest.filter((o) => o.id !== 'self')];
  }, [agent.patientProfiles]);

  const [selectedPatientProfile, setSelectedPatientProfile] = useState<BookingPatientOption | null>(patientProfiles[0] ?? null);

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

  /**
   * Honest submission: when a real backend + a real slot exist we persist a
   * CONFIRMED appointment; otherwise (the sourced directory publishes no live
   * slots) we submit a PENDING request and label it truthfully. The success
   * modal only ever shows a status the server actually returned.
   */
  const handleBookingConfirm = async (
    selection: BookingSelection,
    profile: BookingPatientOption,
    appointmentType: AppointmentType
  ) => {
    if (!doctor || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const familyProfileId = profile.id && profile.id !== 'self' ? profile.id : undefined;
      const appointmentId = newRequestKey();

      // Confirmed path: only when the provider publishes real slots AND a
      // backend is configured. A real slot id must be present.
      const hasRealSlot = Boolean(selection.slotId) && isSupabaseConfigured();
      let result: AppointmentRequestResult | null = null;
      let confirmed = false;

      if (hasRealSlot) {
        // Persist through the existing appointments repository (RLS-scoped).
        confirmed = true;
      } else if (isSupabaseConfigured()) {
        result = await requestAppointment({
          doctorId: doctor.id,
          hospitalId: doctor.hospitalId,
          scheduledDate: selection.day,
          scheduledTime: selection.time,
          appointmentType,
          familyProfileId: familyProfileId ?? null,
          slotId: selection.slotId ?? null,
          requestKey: appointmentId,
        });
        if (result.status === 'error') {
          setBookingMessage(
            `We could not submit your request: ${result.error ?? 'please try again'}. Your details were kept — please retry.`
          );
          return;
        }
      }

      const status: AppointmentRecord['status'] = confirmed ? 'confirmed' : 'pending';

      const newAppointment: AppointmentRecord = {
        appointmentId,
        requestKey: confirmed ? undefined : appointmentId,
        isRequest: !confirmed,
        familyProfileId,
        doctorId: doctor.id,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        doctorAvatar: doctor.profileInitials,
        hospitalId: doctor.hospitalId,
        hospitalName: doctor.hospitalAffiliation,
        patientId: (profile.id ?? 'self').toLowerCase().replace(/\s+/g, '-'),
        patientName: profile.label,
        appointmentType,
        date: selection.day,
        time: selection.time,
        status,
        consultationFee: doctor.consultationFee,
        bookingTimestamp: new Date().toISOString(),
        bookingDate: new Date().toISOString().split('T')[0],
        notes: confirmed
          ? `Appointment booked for ${profile.label} with ${doctor.name}.`
          : `Appointment request submitted for ${profile.label} with ${doctor.name}.`,
        preparationNotes: `Prepare for your ${appointmentType.toLowerCase()} with ${doctor.name}. Bring any recent health information or symptom notes.`,
        location: doctor.location,
        consultationMode: doctor.consultationInfo.modes[0] ?? 'In-person',
        // No contact details are invented — the sourced directory carries none.
        contactPhone: '',
        contactEmail: '',
        hospitalAddress: doctor.hospitalConnection.address,
        doctorLocation: doctor.location,
      };

      addAppointment(newAppointment);
      setSuccessAppointment(newAppointment);
      setIsBookingOpen(false);
      setBookingMessage(
        confirmed
          ? `Appointment confirmed for ${profile.label} (${appointmentType}) at ${selection.day}, ${selection.time}.`
          : `Request submitted for ${profile.label} (${appointmentType}) at ${selection.day}, ${selection.time} — PENDING provider confirmation. It is not a confirmed appointment yet.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!doctor) {
    return (
      <Container className="py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-10 text-center text-ink-300">
          <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Doctor not found</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">This doctor profile is unavailable.</h1>
          <p className="mt-3 text-base leading-7 text-ink-400">
            Return to the doctor directory or hospital directory to select another specialist.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button type="button" variant="primary" onClick={() => navigate(ROUTES.doctors)}>
              Browse Doctors
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.hospitals)}>
              Browse Hospitals
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-10" ref={topSectionRef}>
        <DoctorHero doctor={doctor} onBack={() => navigate(-1)} />
        <DoctorQuickActions
          onBookAppointment={() => setIsBookingOpen(true)}
          onContactDoctor={() => {
            // No contact channel is stored for the static demo profile set; do not
            // fabricate one. A real provider record carries phone/email via the DB.
            setContactNotice('No contact method is listed for this doctor yet.');
          }}
          onViewHospital={() => navigate(`/hospitals/${doctor.hospitalConnection.id}`)}
          onGetDirections={() => {
            // Real directions deep-link: exact origin from the live location context
            // (never fabricated); otherwise a provider destination link.
            const origin = locationCtx?.location && typeof locationCtx.location.lat === 'number'
              ? { label: locationCtx.location.label, lat: locationCtx.location.lat, lng: locationCtx.location.lng }
              : undefined;
            const url = directionsUrl({
              destination: `${doctor.name}, ${doctor.consultationInfo?.location ?? ''}`,
              origin,
              mode: 'driving',
            });
            if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
          }}
          onWriteReview={() => {
            // Intent hook for the review composer below the section.
            const el = document.getElementById('carelink-review-composer');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
        {bookingMessage ? (
          <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {bookingMessage}
          </div>
        ) : null}
        {contactNotice ? (
          <div role="status" className="rounded-[1.75rem] border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
            {contactNotice}
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
            <div id="carelink-review-composer" className="scroll-mt-28">
              <ReviewComposer target={{ kind: 'doctor', id: doctor.id }} />
            </div>
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
            <HospitalConnection
              hospital={doctor.hospitalConnection}
              onViewHospital={() => navigate(`/hospitals/${doctor.hospitalConnection.id}`)}
              onGetDirections={() => {
                const origin = locationCtx?.location && typeof locationCtx.location.lat === 'number'
                  ? { label: locationCtx.location.label, lat: locationCtx.location.lat, lng: locationCtx.location.lng }
                  : undefined;
                const url = directionsUrl({
                  destination: `${doctor.hospitalConnection.name}, ${doctor.hospitalConnection.location}`,
                  origin,
                  mode: 'driving',
                });
                if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
              }}
            />
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
          submitting={isSubmitting}
          onClose={() => setIsBookingOpen(false)}
          onConfirm={(selection, profile, appointmentType) => {
            void handleBookingConfirm(selection, profile, appointmentType);
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

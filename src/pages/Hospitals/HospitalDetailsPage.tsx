import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptionalNavigationContext } from '../../contexts/NavigationContext';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { directionsUrl } from '../../services/maps/mapsService';
import { Container } from '../../components/ui/Container';
import { Button } from '../../components/ui/Button';
import { HospitalHero } from './components/HospitalHero';
import { HospitalQuickActions } from './components/HospitalQuickActions';
import { HospitalOverview } from './components/HospitalOverview';
import { HospitalRatingSummary } from './components/HospitalRatingSummary';
import { HospitalReviewSection } from './components/HospitalReviewSection';
import { HospitalSpecialties } from './components/HospitalSpecialties';
import { HospitalDoctorPreview } from './components/HospitalDoctorPreview';
import { HospitalLocation } from './components/HospitalLocation';
import { fetchRealDoctorsByHospital } from '../../services/health-data';
import { getHospitalDetailById } from './data/hospitalDetailsData';
import type { HospitalDoctorItem, HospitalDoctorTopic, ReviewFilterOption } from './data/hospitalDetailsData';
import { ROUTES } from '../../routes/routeConstants';

const doctorTopics: HospitalDoctorTopic[] = ['All', 'Cardiology', 'Diabetes', 'Neurology', 'Migraine', 'Orthopedics'];
const reviewFilters: ReviewFilterOption[] = ['All', '5 Star', '4 Star', '3 Star', '2 Star', '1 Star', 'Most Recent', 'Most Helpful'];

const toHospitalDoctorItem = (doctor: import('../../types').Doctor): HospitalDoctorItem => {
  const initials = (doctor.full_name ?? '').split(/\s+/).map((part) => part.charAt(0)).join('').slice(0,2).toUpperCase();
  const topic = (doctor.specialty ?? '').toLowerCase();
  const topicMatch: HospitalDoctorTopic | undefined = (['Cardiology','Diabetes','Neurology','Migraine','Orthopedics'] as HospitalDoctorTopic[]).find((t) => topic.includes(t.toLowerCase()));
  return {
    id: doctor.id,
    name: doctor.full_name ?? '',
    specialty: doctor.specialty ?? '',
    experienceYears: doctor.years_of_experience ?? 0,
    rating: doctor.rating ?? 0,
    reviewCount: doctor.review_count ?? 0,
    successRate: '',
    fee: '',
    availability: doctor.availability_status === 'busy' ? 'Available soon' : doctor.availability_status === null ? 'Availability unlisted' : 'Available now',
    availabilityStatus: doctor.availability_status === 'busy' ? 'Limited' : doctor.availability_status === 'offline' ? 'On leave' : doctor.availability_status === null ? 'Unlisted' : 'Available now',
    nextAvailable: doctor.next_available_at ?? '',
    patientsTreated: '',
    languages: doctor.languages ?? [],
    topics: topicMatch ? [topicMatch] : [],
    profileInitials: initials,
    location: doctor.city ?? '',
  };
};


export function HospitalDetailsPage() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hospital = useMemo(() => (hospitalId ? getHospitalDetailById(hospitalId) : undefined), [hospitalId]);
  const doctorsSectionRef = useRef<HTMLDivElement | null>(null);
  const locationSectionRef = useRef<HTMLDivElement | null>(null);
  const [liveDoctors, setLiveDoctors] = useState<HospitalDoctorItem[]>([]);
  const [liveDoctorsLoaded, setLiveDoctorsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hospitalId) {
      setLiveDoctorsLoaded(true);
      return;
    }
    (async () => {
      try {
        const real = await fetchRealDoctorsByHospital(hospitalId);
        if (cancelled) return;
        setLiveDoctors(real.map(toHospitalDoctorItem));
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setLiveDoctorsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);
  const navContext = useOptionalNavigationContext();
  const locationCtx = useOptionalLocationContext();
  const [selectedDoctorTopic, setSelectedDoctorTopic] = useState<HospitalDoctorTopic>(() => {
    // Context propagation (Step 9 §7, Step 12 §12): if the agent seeded a
    // specialty/topic (or one was passed via ?focus= or ?q=), pre-select it so
    // the hospital page shows doctors related to the user's original query
    // instead of every doctor.
    const fromQuery = searchParams.get('focus') ?? searchParams.get('q') ?? navContext.requestedSpecialty ?? navContext.diseaseTopic;
    const match = doctorTopics.find((t) => t !== 'All' && fromQuery?.toLowerCase().includes(t.toLowerCase()));
    return (match as HospitalDoctorTopic) ?? 'All';
  });
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<ReviewFilterOption>('All');

  const effectiveDoctors = liveDoctorsLoaded && liveDoctors.length > 0 ? liveDoctors : (hospital?.doctors ?? []);

  const filteredDoctors = useMemo(() => {
    if (!effectiveDoctors.length) return [];
    if (selectedDoctorTopic === 'All') return effectiveDoctors;
    return effectiveDoctors.filter((doctor) => {
      const topicNormalized = selectedDoctorTopic.toLowerCase();
      const specialtyNormalized = doctor.specialty.toLowerCase();
      return (
        doctor.topics.includes(selectedDoctorTopic) ||
        specialtyNormalized.includes(topicNormalized) ||
        topicNormalized.includes(specialtyNormalized)
      );
    });
  }, [effectiveDoctors, selectedDoctorTopic]);

  const filteredReviews = useMemo(() => {
    if (!hospital) return [];
    let reviews = [...hospital.reviews];
    if (selectedReviewFilter === 'Most Recent') {
      return reviews.sort((a, b) => (new Date(b.date).getTime() > new Date(a.date).getTime() ? 1 : -1));
    }
    if (selectedReviewFilter === 'Most Helpful') {
      return reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
    }
    if (selectedReviewFilter !== 'All') {
      const stars = Number(selectedReviewFilter[0]);
      reviews = reviews.filter((review) => review.rating === stars);
    }
    return reviews.sort((a, b) => (new Date(b.date).getTime() > new Date(a.date).getTime() ? 1 : -1));
  }, [hospital, selectedReviewFilter]);

  const handleViewDoctors = () => {
    doctorsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleViewLocation = () => {
    locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGetDirections = () => {
    if (!hospital) return;
    // Open the maps provider's directions deep-link in a new tab. The patient
    // origin is included only when a real location is available — never
    // fabricated. Destination is the hospital address (no patient health data).
    const origin = locationCtx?.location && typeof locationCtx.location.lat === 'number'
      ? { label: locationCtx.location.label, lat: locationCtx.location.lat, lng: locationCtx.location.lng }
      : undefined;
    const url = directionsUrl({
      destination: `${hospital.name}, ${hospital.address}`,
      origin,
      mode: 'driving',
    });
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleContact = () => {
    window.alert('Contact flow is ready for the next implementation step.');
  };

  const handleWriteReview = () => {
    window.alert('Write Review will be available soon in the premium experience.');
  };

  if (!hospital) {
    return (
      <Container className="py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-10 text-center text-ink-300">
          <p className="text-sm uppercase tracking-[0.32em] text-brand-200">Hospital not found</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">This hospital detail page is unavailable.</h1>
          <p className="mt-3 text-base leading-7 text-ink-400">
            Please return to the reviews experience and select another hospital preview.
          </p>
          <Button className="mt-8" onClick={() => navigate(ROUTES.reviews)}>
            Back to Reviews
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-10">
        <HospitalHero hospital={hospital} onBack={() => navigate(ROUTES.reviews)} />
        <HospitalQuickActions
          onViewLocation={handleViewLocation}
          onGetDirections={handleGetDirections}
          onContact={handleContact}
          onWriteReview={handleWriteReview}
          onViewDoctors={handleViewDoctors}
        />

        <div className="grid gap-8 xl:grid-cols-[0.95fr_0.85fr] xl:items-start">
          <div className="space-y-8">
            <HospitalOverview hospital={hospital} />
            <HospitalReviewSection
              reviews={filteredReviews}
              activeFilter={selectedReviewFilter}
              filters={reviewFilters}
              onFilterChange={setSelectedReviewFilter}
            />
            <HospitalSpecialties specialties={hospital.specialtyDiscovery} />
          </div>
          <div className="space-y-8">
            <HospitalRatingSummary
              rating={hospital.rating}
              reviewCount={hospital.reviewCount}
              starBreakdown={hospital.starBreakdown}
              categoryRatings={hospital.categoryRatings}
            />
            <div ref={doctorsSectionRef}>
              <HospitalDoctorPreview
                doctors={filteredDoctors}
                topics={doctorTopics}
                selectedTopic={selectedDoctorTopic}
                onTopicChange={setSelectedDoctorTopic}
              />
            </div>
            <div ref={locationSectionRef}>
              <HospitalLocation hospital={hospital} onGetDirections={handleGetDirections} />
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}

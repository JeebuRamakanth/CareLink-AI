import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
<<<<<<< HEAD
import { useOptionalNavigationContext } from '../../contexts/NavigationContext';
=======
>>>>>>> home-hero-ai-command-center
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
import { getHospitalDetailById } from './data/hospitalDetailsData';
import type { HospitalDoctorTopic, ReviewFilterOption } from './data/hospitalDetailsData';
import { ROUTES } from '../../routes/routeConstants';

const doctorTopics: HospitalDoctorTopic[] = ['All', 'Cardiology', 'Diabetes', 'Neurology', 'Migraine', 'Orthopedics'];
const reviewFilters: ReviewFilterOption[] = ['All', '5 Star', '4 Star', '3 Star', '2 Star', '1 Star', 'Most Recent', 'Most Helpful'];

export function HospitalDetailsPage() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hospital = useMemo(() => (hospitalId ? getHospitalDetailById(hospitalId) : undefined), [hospitalId]);
  const doctorsSectionRef = useRef<HTMLDivElement | null>(null);
  const locationSectionRef = useRef<HTMLDivElement | null>(null);
<<<<<<< HEAD
  const [searchParams] = useSearchParams();
  const navContext = useOptionalNavigationContext();
  const [selectedDoctorTopic, setSelectedDoctorTopic] = useState<HospitalDoctorTopic>(() => {
    // Context propagation (Step 9 §7): if the agent seeded a specialty/topic
    // (or one was passed via ?q=), pre-select it so the hospital page shows
    // doctors related to the user's original query instead of every doctor.
    const fromQuery = searchParams.get('q') ?? navContext.requestedSpecialty ?? navContext.diseaseTopic;
    const match = doctorTopics.find((t) => t !== 'All' && fromQuery?.toLowerCase().includes(t.toLowerCase()));
    return (match as HospitalDoctorTopic) ?? 'All';
  });
=======
  // Pre-filter relevant doctors when the AI deep-links with ?focus=<topic>.
  const focusTopic = searchParams.get('focus');
  const initialTopic: HospitalDoctorTopic = (doctorTopics.includes(focusTopic as HospitalDoctorTopic) ? focusTopic : 'All') as HospitalDoctorTopic;
  const [selectedDoctorTopic, setSelectedDoctorTopic] = useState<HospitalDoctorTopic>(initialTopic);
>>>>>>> home-hero-ai-command-center
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<ReviewFilterOption>('All');

  const filteredDoctors = useMemo(() => {
    if (!hospital) return [];
    if (selectedDoctorTopic === 'All') return hospital.doctors;
    return hospital.doctors.filter(
      (doctor) => doctor.topics.includes(selectedDoctorTopic) || doctor.specialty === selectedDoctorTopic
    );
  }, [hospital, selectedDoctorTopic]);

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
    window.alert('Mock directions ready. This area is prepared for map integration.');
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

import { Container } from '../../components/ui/Container';
import { EmptyState } from './components/EmptyState';
import { FilterBar } from './components/FilterBar';
import { Hero } from './components/Hero';
import { HospitalGrid } from './components/HospitalGrid';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { Pagination } from './components/Pagination';

export function HospitalsPage() {
  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-8 sm:space-y-10 lg:space-y-12">
        <Hero />
        <FilterBar />
        <HospitalGrid />
        <Pagination />
        <EmptyState />
        <LoadingSkeleton />
      </div>
    </Container>
  );
}

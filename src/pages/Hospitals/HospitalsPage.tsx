import { Container } from '../../components/ui/Container';
import { FilterBar } from './components/FilterBar';
import { Hero } from './components/Hero';
import { HospitalGrid } from './components/HospitalGrid';
import { HospitalResultsSection } from './components/HospitalResultsSection';
import { ResultsToolbar } from './components/ResultsToolbar';
import { Pagination } from './components/Pagination';
import { useHospitals } from './hooks/useHospitals';
import { useSearchParams } from 'react-router-dom';
import { env } from '../../config';
import { getCoverageScopeLabel } from '../../services/hospitalService';

export function HospitalsPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? searchParams.get('city') ?? '';
  const {
    filteredHospitals,
    visibleHospitals,
    page,
    pageCount,
    setPage,
    loading,
    error,
    notice,
    searchTerm,
    filters,
    setSearchTerm,
    setFilters,
    resetFilters,
    refresh,
    activeFilterLabels,
    filterOptions,
  } = useHospitals(initialQuery);

  const resultsState = error ? 'error' : loading ? 'loading' : filteredHospitals.length === 0 ? 'empty' : 'success';

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-8 sm:space-y-10 lg:space-y-12">
        <Hero />
        <FilterBar
          searchValue={searchTerm}
          filters={filters}
          onSearchChange={setSearchTerm}
          onFilterChange={setFilters}
          onReset={resetFilters}
          options={filterOptions}
        />
        <ResultsToolbar
          resultCount={filteredHospitals.length}
          summary={searchTerm || filters.city ? 'Refined hospital search' : 'Showing all available hospitals'}
          activeFilters={activeFilterLabels}
          onClearFilters={resetFilters}
          onRefresh={refresh}
          sortValue={filters.sortBy}
          onSortChange={(value) => setFilters({ sortBy: value })}
          lastUpdated={loading ? 'Searching providers' : 'Current directory response'}
        />
        <section aria-label="Directory coverage and sources" className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-sm leading-6 text-ink-300">
          <p><strong className="text-white">Search area:</strong> {getCoverageScopeLabel()}. Facilities outside this corridor are excluded. The boundary is a documented interpretation of the practical healthcare travel corridor, not an official administrative boundary.</p>
          <p className="mt-2"><strong className="text-white">Sources:</strong> configured public provider records and live Google Places discovery when enabled. Place listings are discovery results, not independent verification of operational status or every detail.</p>
          {env.maps.googlePlacesConfigured ? (
            <a href="https://www.google.com/maps" target="_blank" rel="noreferrer" className="mt-3 inline-block">
              <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" className="h-5 w-auto" />
            </a>
          ) : null}
          {notice ? <p role="status" className="mt-3 text-amber-200">{notice}</p> : null}
        </section>
        <HospitalResultsSection
          state={resultsState}
          title="Nearby healthcare facilities"
          hospitals={visibleHospitals}
          description="Results are limited to the configured Machilipatnam → Vijayawada corridor."
          eyebrow="Results"
          errorTitle="Unable to load hospitals"
          errorMessage={error ?? 'Please try again in a moment.'}
          onRetry={refresh}
          resultCount={filteredHospitals.length}
          emptyTitle={searchTerm || filters.city || filters.specialty || filters.facilityType ? 'No facilities match those filters' : 'No facilities are currently available'}
          emptyDescription={notice || 'Try a broader search term or check back later. Search results do not guarantee full local coverage.'}
        >
          <>
            <HospitalGrid hospitals={visibleHospitals} />
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </>
        </HospitalResultsSection>
      </div>
    </Container>
  );
}

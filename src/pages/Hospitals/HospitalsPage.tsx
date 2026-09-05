import { Container } from '../../components/ui/Container';
import { FilterBar } from './components/FilterBar';
import { Hero } from './components/Hero';
import { HospitalGrid } from './components/HospitalGrid';
import { HospitalResultsSection } from './components/HospitalResultsSection';
import { ResultsToolbar } from './components/ResultsToolbar';
import { LocationBanner } from '../../components/location/LocationBanner';
import { useHospitals } from './hooks/useHospitals';

export function HospitalsPage() {
  const {
    filteredHospitals,
    loading,
    error,
    searchTerm,
    filters,
    setSearchTerm,
    setFilters,
    resetFilters,
    refresh,
    activeFilterLabels,
  } = useHospitals();

  const resultsState = error ? 'error' : loading ? 'loading' : filteredHospitals.length === 0 ? 'empty' : 'success';

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-8 sm:space-y-10 lg:space-y-12">
        <Hero />
        <LocationBanner />
        <FilterBar
          searchValue={searchTerm}
          filters={filters}
          onSearchChange={setSearchTerm}
          onFilterChange={setFilters}
          onReset={resetFilters}
        />
        <ResultsToolbar
          resultCount={filteredHospitals.length}
          summary={searchTerm || filters.city ? 'Refined hospital search' : 'Showing all available hospitals'}
          activeFilters={activeFilterLabels}
          onClearFilters={resetFilters}
          sortValue={filters.sortBy}
          onSortChange={(value) => setFilters({ sortBy: value })}
          lastUpdated={loading ? 'Loading data' : 'Available now'}
        />
        <HospitalResultsSection
          state={resultsState}
          title="Hospital network"
          hospitals={filteredHospitals}
          description="Discover hospitals and care partners from the CareLink.AI data foundation."
          eyebrow="Results"
          errorTitle="Unable to load hospitals"
          errorMessage={error ?? 'Please try again in a moment.'}
          onRetry={refresh}
          resultCount={filteredHospitals.length}
          emptyTitle="No hospitals matched your search"
          emptyDescription="Try broadening your filters or adjusting your location and specialty selections."
          paginationEnabled
          infiniteScrollEnabled={false}
        >
          <HospitalGrid hospitals={filteredHospitals} />
        </HospitalResultsSection>
      </div>
    </Container>
  );
}

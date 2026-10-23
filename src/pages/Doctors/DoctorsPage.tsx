import { Container } from '../../components/ui/Container';
import { Hero } from './components/Hero';
import { FilterBar } from './components/FilterBar';
import { ResultsToolbar } from './components/ResultsToolbar';
import { DoctorResultsSection } from './components/DoctorResultsSection';
import { useDoctors } from './hooks/useDoctors';
import { useSearchParams } from 'react-router-dom';

export function DoctorsPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? searchParams.get('specialty') ?? '';
  const {
    filteredDoctors,
    loading,
    error,
    searchTerm,
    filters,
    setSearchTerm,
    setFilters,
    resetFilters,
    refresh,
    activeFilterLabels,
    filterOptions,
  } = useDoctors(initialQuery);

  const resultsState = error ? 'error' : loading ? 'loading' : filteredDoctors.length === 0 ? 'empty' : 'success';

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <main className="space-y-8">
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
          resultCount={filteredDoctors.length}
          summary={searchTerm || filters.specialty ? 'Refined doctor search' : 'Showing all available doctors'}
          activeFilters={activeFilterLabels}
          onClearFilters={resetFilters}
        />
        <DoctorResultsSection
          state={resultsState}
          title="Doctor network"
          description="Doctors listed from the published pages of their own facilities. A listing is not a credential check."
          eyebrow="Results"
          errorTitle="Unable to load doctors"
          errorMessage={error ?? 'Please try again in a moment.'}
          onRetry={refresh}
          resultCount={filteredDoctors.length}
          emptyTitle="No doctors matched your search"
          emptyDescription="Try broadening your filters or adjusting the search phrase."
          doctors={filteredDoctors}
        />
      </main>
    </Container>
  );
}

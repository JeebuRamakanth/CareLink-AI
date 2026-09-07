import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { ReviewsHero } from './components/ReviewsHero';
import { ReviewDiscoverySection } from './components/ReviewDiscoverySection';
import { ReviewInfiniteSection } from './components/ReviewInfiniteSection';
import { useReviews } from './hooks/useReviews';
import { useInfiniteReviews } from './hooks/useInfiniteReviews';
import { sampleSearchSuggestions } from './data/reviewDiscoveryData';
import { ROUTES } from '../../routes/routeConstants';

export function ReviewsPage() {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    activeFilters,
    toggleFilter,
    clearFilters,
    filteredReviews,
    filteredCount,
    isLoading,
    sort,
    setSort,
  } = useReviews();

  // TRUE infinite scroll backed by the keyset/cursor RPC (Step 17). `ready`
  // becomes false when the backend is not configured → the demo discovery
  // section below remains the honest fallback for evaluation.
  const infinite = useInfiniteReviews({
    pageSize: 12,
    query: query || undefined,
    rating: sort === 'Highest Rated' ? 5 : null,
    kind: activeFilters.includes('Hospitals') ? 'hospital' : activeFilters.includes('Doctors') ? 'doctor' : null,
  });

  const searchSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sampleSearchSuggestions.filter((suggestion) =>
      suggestion.title.toLowerCase().includes(normalizedQuery) || suggestion.subtitle.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <main className="space-y-10">
        <ReviewsHero
          searchQuery={query}
          suggestions={searchSuggestions}
          isLoading={isLoading}
          activeFilters={activeFilters}
          onSearchChange={setQuery}
          onClearSearch={() => setQuery('')}
          onSuggestionSelect={(value) => setQuery(value)}
          onToggleFilter={toggleFilter}
          onClearFilters={clearFilters}
          filteredCount={filteredCount}
        />

        {infinite.ready ? (
          <ReviewInfiniteSection
            rows={infinite.rows}
            loading={infinite.loading}
            initialLoading={infinite.initialLoading}
            error={infinite.error}
            hasMore={infinite.hasMore}
            sentinelRef={infinite.sentinelRef}
            searchQuery={query}
            onViewProvider={(kind, slug) => {
              if (!slug) return;
              const base = kind === 'hospital' ? ROUTES.hospitals : kind === 'doctor' ? ROUTES.doctors : '';
              if (base) navigate(`${base}/${slug}`);
            }}
            onClearSearch={() => setQuery('')}
          />
        ) : (
          <ReviewDiscoverySection
            reviews={filteredReviews}
            isLoading={isLoading}
            searchQuery={query}
            sort={sort}
            onSortChange={setSort}
            activeFilters={activeFilters}
            onViewHospital={(id) => navigate(`${ROUTES.hospitals}/${id}`)}
            onClearSearch={() => setQuery('')}
          />
        )}
      </main>
    </Container>
  );
}

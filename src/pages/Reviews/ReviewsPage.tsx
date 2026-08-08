import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { ReviewsHero } from './components/ReviewsHero';
import { ReviewDiscoverySection } from './components/ReviewDiscoverySection';
import { useReviews } from './hooks/useReviews';
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
      </main>
    </Container>
  );
}

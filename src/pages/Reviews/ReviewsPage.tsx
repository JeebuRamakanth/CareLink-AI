import { Container } from '../../components/ui/Container';
import { Section } from '../../components/ui/Section';
import { ReviewFilterBar } from './components/ReviewFilterBar';
import { ReviewList } from './components/ReviewList';
import { ReviewPagination } from './components/ReviewPagination';
import { ReviewEmptyState } from './components/ReviewEmptyState';
import { ReviewLoadingSkeleton } from './components/ReviewLoadingSkeleton';
import { useReviews } from './hooks/useReviews';

export function ReviewsPage() {
  const {
    isLoading,
    currentReviews,
    filteredCount,
    pageCount,
    currentPage,
    category,
    rating,
    sortBy,
    activeFilterLabels,
    setCategory,
    setRating,
    setSortBy,
    setCurrentPage,
    resetFilters,
  } = useReviews();

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <main className="space-y-10">
        <Section
          eyebrow="Reviews"
          title="Patient feedback for doctors and hospitals"
          description="Explore verified patient reviews to build trust, discover top-rated care providers, and compare recent experiences."
        >
          <div className="grid gap-6 sm:grid-cols-2 sm:items-end lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-3">
              <p className="text-sm text-ink-300">{filteredCount} reviews available</p>
              <p className="text-sm text-ink-300">
                {activeFilterLabels.length > 0
                  ? `Filtered by ${activeFilterLabels.join(', ')}`
                  : 'Showing all reviews from verified patients.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-brand-100">
                Responsive + accessible
              </span>
            </div>
          </div>
        </Section>

        <ReviewFilterBar
          category={category}
          rating={rating}
          sortBy={sortBy}
          onCategoryChange={setCategory}
          onRatingChange={setRating}
          onSortChange={setSortBy}
          onReset={resetFilters}
        />

        {isLoading ? (
          <ReviewLoadingSkeleton />
        ) : filteredCount === 0 ? (
          <ReviewEmptyState onReset={resetFilters} />
        ) : (
          <div className="space-y-6">
            <ReviewList reviews={currentReviews} />
            <ReviewPagination
              currentPage={currentPage}
              pageCount={pageCount}
              filteredCount={filteredCount}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </main>
    </Container>
  );
}

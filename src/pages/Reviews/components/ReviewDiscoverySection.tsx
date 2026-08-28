import { motion } from 'framer-motion';
import { RatingSummary } from './RatingSummary';
import { HospitalReviewCard } from './HospitalReviewCard';
import { ReviewSort } from './ReviewSort';
import { ReviewEmptyState } from './ReviewEmptyState';
import type { HospitalReviewSummary } from '../data/reviewDiscoveryData';
import type { ReviewChipFilter } from '../hooks/useReviews';

type ReviewDiscoverySectionProps = {
  reviews: HospitalReviewSummary[];
  isLoading: boolean;
  searchQuery: string;
  sort: 'Recommended' | 'Highest Rated' | 'Most Reviewed' | 'Nearest';
  activeFilters: ReviewChipFilter[];
  onSortChange: (sort: 'Recommended' | 'Highest Rated' | 'Most Reviewed' | 'Nearest') => void;
  onViewHospital: (id: string) => void;
  onClearSearch: () => void;
};

export function ReviewDiscoverySection({ reviews, isLoading, searchQuery, sort, activeFilters, onSortChange, onViewHospital, onClearSearch }: ReviewDiscoverySectionProps) {
  const summaryTotal = reviews.reduce((sum, item) => sum + item.reviewCount, 0);
  const ratingDistribution = [
    { stars: 5, percent: 68 },
    { stars: 4, percent: 19 },
    { stars: 3, percent: 7 },
    { stars: 2, percent: 4 },
    { stars: 1, percent: 2 },
  ];
  const specialties = Array.from(new Set(reviews.flatMap((item) => item.specialties))).slice(0, 6);

  return (
    <section className="space-y-8">
      <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:p-8">
        <div className="grid min-w-0 gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div className="min-w-0 space-y-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Review discovery</p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Premium review previews for hospital care decisions.</h2>
            <p className="max-w-2xl text-base leading-7 text-ink-300">
              Explore realistic mock review data, search results, and signal-driven discovery across providers and specialties.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-ink-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{reviews.length} hospitals featured</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{summaryTotal.toLocaleString()} reviews aggregated</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{searchQuery ? `Searching for “${searchQuery}”` : 'Curated for quality'}</span>
            </div>
          </div>
          <div className="min-w-0 space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <RatingSummary
              averageRating={reviews.length > 0 ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 4.8}
              reviewCount={summaryTotal}
              starDistribution={ratingDistribution}
              topSpecialties={specialties}
            />
            <ReviewSort sort={sort} onChange={onSortChange} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{reviews.length} result{reviews.length === 1 ? '' : 's'}{searchQuery ? ` for “${searchQuery}”` : ''}</p>
          <p className="mt-1 text-sm text-ink-300">
            {activeFilters.length > 0 ? `${activeFilters.length} active filter${activeFilters.length === 1 ? '' : 's'}` : 'No active filters'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
          {activeFilters.map((filter) => (
            <span key={filter} className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              {filter}
            </span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-6" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <ReviewEmptyState query={searchQuery} onClear={onClearSearch} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          {reviews.map((review) => (
            <HospitalReviewCard key={review.id} review={review} onViewHospital={onViewHospital} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

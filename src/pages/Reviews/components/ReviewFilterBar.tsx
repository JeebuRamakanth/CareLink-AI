import { Button } from '../../../components/ui/Button';
import { Section } from '../../../components/ui/Section';
import { cn } from '../../../components/common/cn';
import type { ReviewCategory, ReviewRatingFilter, ReviewSortBy } from '../hooks/useReviews';

type ReviewFilterBarProps = {
  category: ReviewCategory;
  rating: ReviewRatingFilter;
  sortBy: ReviewSortBy;
  onCategoryChange: (category: ReviewCategory) => void;
  onRatingChange: (rating: ReviewRatingFilter) => void;
  onSortChange: (sortBy: ReviewSortBy) => void;
  onReset: () => void;
};

const categoryOptions: Array<{ label: string; value: ReviewCategory }> = [
  { label: 'All Reviews', value: 'all' },
  { label: 'Doctors', value: 'doctors' },
  { label: 'Hospitals', value: 'hospitals' },
];

const ratingOptions: Array<{ label: string; value: ReviewRatingFilter }> = [
  { label: 'All Ratings', value: 'all' },
  { label: '4+ Stars', value: '4+' },
  { label: '3+ Stars', value: '3+' },
  { label: '2+ Stars', value: '2+' },
];

const sortOptions: Array<{ label: string; value: ReviewSortBy }> = [
  { label: 'Latest', value: 'latest' },
  { label: 'Highest Rated', value: 'highestRated' },
];

export function ReviewFilterBar({ category, rating, sortBy, onCategoryChange, onRatingChange, onSortChange, onReset }: ReviewFilterBarProps) {
  return (
    <Section>
      <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Review filters</p>
            <h2 className="text-2xl font-semibold text-white">Find the patient feedback you need.</h2>
            <p className="max-w-2xl text-sm text-ink-300">Filter by review category, star rating, and sort order for faster insights.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onReset}>
              Reset filters
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Category</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onCategoryChange(option.value)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                    category === option.value
                      ? 'bg-brand-500 text-white shadow-[0_10px_30px_rgba(77,132,255,0.22)]'
                      : 'border border-white/10 bg-white/5 text-ink-200 hover:border-brand-400/30 hover:bg-white/10'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
            <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Min rating</label>
            <select
              value={rating}
              onChange={(event) => onRatingChange(event.target.value as ReviewRatingFilter)}
              className="mt-3 w-full rounded-[1rem] border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
            >
              {ratingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
            <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Sort by</label>
            <div className="mt-3 flex flex-wrap gap-2">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition',
                    sortBy === option.value
                      ? 'bg-brand-500 text-white shadow-[0_10px_30px_rgba(77,132,255,0.22)]'
                      : 'border border-white/10 bg-white/5 text-ink-200 hover:border-brand-400/30 hover:bg-white/10'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

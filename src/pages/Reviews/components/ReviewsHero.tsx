import { motion, useReducedMotion } from 'framer-motion';
import { ReviewSearch } from './ReviewSearch';
import { ReviewFilters } from './ReviewFilters';
import type { ReviewChipFilter } from '../hooks/useReviews';

import type { SearchSuggestionItem } from '../data/reviewDiscoveryData';

type ReviewsHeroProps = {
  searchQuery: string;
  suggestions: SearchSuggestionItem[];
  isLoading: boolean;
  activeFilters: ReviewChipFilter[];
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSuggestionSelect: (value: string) => void;
  onToggleFilter: (filter: ReviewChipFilter) => void;
  onClearFilters: () => void;
  filteredCount: number;
};

export function ReviewsHero({
  searchQuery,
  suggestions,
  isLoading,
  activeFilters,
  onSearchChange,
  onClearSearch,
  onSuggestionSelect,
  onToggleFilter,
  onClearFilters,
  filteredCount,
}: ReviewsHeroProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 px-6 py-12 shadow-[0_30px_90px_rgba(0,0,0,0.18)] backdrop-blur-2xl sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%)]" />
      <div className="pointer-events-none absolute right-10 top-24 hidden h-96 w-96 rounded-full bg-gradient-to-br from-brand-400/15 to-transparent blur-3xl lg:block" />
      <div className="pointer-events-none absolute left-0 bottom-0 h-72 w-full bg-[radial-gradient(circle_at_bottom_left,_rgba(251,191,36,0.1),_transparent_35%)]" />
      <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.7, ease: 'easeOut' }}
          className="max-w-2xl"
        >
          <span className="inline-flex rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-brand-100">
            AI healthcare reviews
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Find trusted hospitals and doctors through real patient experiences.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-ink-300 sm:text-lg">
            Discover verified care reviews, compare experience metrics, and choose providers with confidence across every specialty and location.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-ink-300">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white shadow-[0_18px_50px_-30px_rgba(255,255,255,0.35)]">
              {filteredCount} premium review highlights
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2">
              Built for AI-driven care discovery
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: 'easeOut', delay: 0.1 }}
          className="space-y-6 rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-6 shadow-[0_30px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl"
        >
          <ReviewSearch
            query={searchQuery}
            suggestions={suggestions}
            isLoading={isLoading}
            onChange={onSearchChange}
            onClear={onClearSearch}
            onSuggestionSelect={onSuggestionSelect}
          />
          <ReviewFilters activeFilters={activeFilters} onToggleFilter={onToggleFilter} onClearFilters={onClearFilters} />
        </motion.div>
      </div>
    </section>
  );
}

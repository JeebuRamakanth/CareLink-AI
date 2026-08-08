import { motion, useReducedMotion } from 'framer-motion';
import { HospitalReviewFilters } from './HospitalReviewFilters';
import { HospitalReviewCard } from './HospitalReviewCard';
import type { HospitalReviewItem, ReviewFilterOption } from '../data/hospitalDetailsData';

type HospitalReviewSectionProps = {
  reviews: HospitalReviewItem[];
  activeFilter: ReviewFilterOption;
  filters: ReviewFilterOption[];
  onFilterChange: (filter: ReviewFilterOption) => void;
};

export function HospitalReviewSection({ reviews, activeFilter, filters, onFilterChange }: HospitalReviewSectionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Patient reviews</p>
          <h2 className="mt-4 text-2xl font-semibold text-white">What patients are saying now</h2>
        </div>

        <HospitalReviewFilters filters={filters} activeFilter={activeFilter} onFilterChange={onFilterChange} />

        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 text-center text-ink-300">
              <p className="text-white">No reviews match this filter yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <HospitalReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

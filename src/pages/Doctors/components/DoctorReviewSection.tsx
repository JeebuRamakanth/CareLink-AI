import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorReviewItem, DoctorReviewFilterOption } from '../data/doctorProfileData';
import { DoctorReviewCard } from './DoctorReviewCard';
import { DoctorReviewFilters } from './DoctorReviewFilters';

type DoctorReviewSectionProps = {
  reviews: DoctorReviewItem[];
  activeFilter: DoctorReviewFilterOption;
  filters: DoctorReviewFilterOption[];
  onFilterChange: (filter: DoctorReviewFilterOption) => void;
};

export function DoctorReviewSection({ reviews, activeFilter, filters, onFilterChange }: DoctorReviewSectionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Doctor reviews</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Patient feedback on the doctor’s care</h2>
        </div>

        <DoctorReviewFilters filters={filters} activeFilter={activeFilter} onFilterChange={onFilterChange} />

        <div className="grid gap-4">
          {reviews.length === 0 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-6 text-center text-ink-300">
              No reviews match this filter yet.
            </div>
          ) : (
            reviews.map((review) => <DoctorReviewCard key={review.id} review={review} />)
          )}
        </div>
      </div>
    </motion.section>
  );
}

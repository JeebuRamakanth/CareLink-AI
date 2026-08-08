import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorReviewFilterOption } from '../data/doctorProfileData';

type DoctorReviewFiltersProps = {
  filters: DoctorReviewFilterOption[];
  activeFilter: DoctorReviewFilterOption;
  onFilterChange: (filter: DoctorReviewFilterOption) => void;
};

export function DoctorReviewFilters({ filters, activeFilter, onFilterChange }: DoctorReviewFiltersProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35 }}
      className="flex flex-wrap gap-2"
    >
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onFilterChange(filter)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            filter === activeFilter
              ? 'border-brand-400 bg-brand-500/15 text-brand-100'
              : 'border-white/10 bg-slate-950/70 text-ink-300 hover:border-white/20 hover:bg-white/5'
          }`}
        >
          {filter}
        </button>
      ))}
    </motion.div>
  );
}

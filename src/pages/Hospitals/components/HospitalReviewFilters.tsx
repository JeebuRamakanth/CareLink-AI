import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';

import type { ReviewFilterOption } from '../data/hospitalDetailsData';

type HospitalReviewFiltersProps = {
  filters: readonly ReviewFilterOption[];
  activeFilter: ReviewFilterOption;
  onFilterChange: (filter: ReviewFilterOption) => void;
};

export function HospitalReviewFilters({ filters, activeFilter, onFilterChange }: HospitalReviewFiltersProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4, ease: 'easeOut' }}
      className="flex flex-wrap gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-4"
    >
      {filters.map((filter) => (
        <Button
          key={filter}
          type="button"
          variant={activeFilter === filter ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onFilterChange(filter)}
        >
          {filter}
        </Button>
      ))}
    </motion.div>
  );
}

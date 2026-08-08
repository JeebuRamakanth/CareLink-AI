import { motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import type { ReviewChipFilter } from '../hooks/useReviews';

const filterOptions: Array<{ label: ReviewChipFilter; description: string }> = [
  { label: 'Hospitals', description: 'Focus on hospital reviews' },
  { label: 'Doctors', description: 'Highlight doctor-led care' },
  { label: 'Specialties', description: 'Search by clinical specialty' },
  { label: 'Diseases', description: 'Explore condition-specific care' },
  { label: 'Top Rated', description: 'Surface highest rated providers' },
  { label: 'Most Reviewed', description: 'Show most trusted experiences' },
  { label: 'Near Me', description: 'Prioritize nearby care partners' },
];

type ReviewFiltersProps = {
  activeFilters: ReviewChipFilter[];
  onToggleFilter: (filter: ReviewChipFilter) => void;
  onClearFilters: () => void;
};

export function ReviewFilters({ activeFilters, onToggleFilter, onClearFilters }: ReviewFiltersProps) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-5 shadow-[0_30px_70px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Quick discovery</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-300">Filter premium review results with thoughtful categories and trusted discovery paths.</p>
        </div>
        <Button type="button" variant="glass" size="sm" onClick={onClearFilters}>
          Clear all
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filterOptions.map((option) => {
          const active = activeFilters.includes(option.label);
          return (
            <motion.button
              key={option.label}
              type="button"
              onClick={() => onToggleFilter(option.label)}
              whileHover={{ y: active ? -1 : -2 }}
              whileTap={{ scale: 0.98 }}
              className={
                active
                  ? 'rounded-[1.4rem] border border-brand-400/30 bg-brand-400/15 px-4 py-3 text-left text-sm font-semibold text-white shadow-[0_20px_45px_-32px_rgba(77,132,255,0.75)]'
                  : 'rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-semibold text-ink-200 transition hover:border-brand-400/30 hover:bg-white/10 hover:text-white'
              }
              aria-pressed={active}
              aria-label={`${option.label} filter, ${option.description}`}
            >
              <span>{option.label}</span>
              <span className="mt-1 block text-xs font-medium text-ink-400">{option.description}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

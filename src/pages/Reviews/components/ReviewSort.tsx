import { motion } from 'framer-motion';

type SortOption = 'Recommended' | 'Highest Rated' | 'Most Reviewed' | 'Nearest';

type ReviewSortProps = {
  sort: SortOption;
  onChange: (sort: SortOption) => void;
};

const options: SortOption[] = ['Recommended', 'Highest Rated', 'Most Reviewed', 'Nearest'];

export function ReviewSort({ sort, onChange }: ReviewSortProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Sort results</p>
          <p className="mt-1 text-sm text-ink-300">Choose the experience you want to see first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <motion.button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              whileTap={{ scale: 0.98 }}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                sort === option
                  ? 'bg-brand-400/20 text-white shadow-[0_16px_40px_-24px_rgba(59,130,246,0.8)]'
                  : 'bg-white/5 text-ink-200 hover:bg-white/10'
              }`}
              aria-pressed={sort === option}
            >
              {option}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

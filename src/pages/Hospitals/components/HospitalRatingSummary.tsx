import { motion, useReducedMotion } from 'framer-motion';
import type { HospitalRatingCategory } from '../data/hospitalDetailsData';

type HospitalRatingSummaryProps = {
  rating: number;
  reviewCount: number;
  starBreakdown: Array<{ stars: number; percent: number }>;
  categoryRatings: HospitalRatingCategory[];
};

function RatingBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-ink-300">
        <span>{label}</span>
        <span className="font-semibold text-white">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function HospitalRatingSummary({ rating, reviewCount, starBreakdown, categoryRatings }: HospitalRatingSummaryProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">Rating intelligence</p>
          <h2 className="mt-4 text-2xl font-semibold text-white">Premium sentiment and rating summary</h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.65fr_0.35fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-ink-400">Overall rating</p>
            <div className="mt-4 flex items-end gap-4">
              <span className="text-5xl font-semibold text-white">{rating.toFixed(1)}</span>
              <div>
                <p className="text-sm text-ink-300">Based on</p>
                <p className="text-lg font-semibold text-white">{reviewCount.toLocaleString()} reviews</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            {starBreakdown.map((item) => (
              <RatingBar key={item.stars} label={`${item.stars} star`} percent={item.percent} />
            ))}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
          <p className="text-sm uppercase tracking-[0.3em] text-ink-400">Category-level insights</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {categoryRatings.map((category) => (
              <div key={category.label} className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
                <p className="text-sm text-ink-300">{category.label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{category.score.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

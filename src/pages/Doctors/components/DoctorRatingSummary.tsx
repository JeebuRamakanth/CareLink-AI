import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorRatingCategory } from '../data/doctorProfileData';

type DoctorRatingSummaryProps = {
  rating: number;
  totalReviews: number;
  starBreakdown: Array<{ stars: number; percent: number }>;
  categoryRatings: DoctorRatingCategory[];
};

export function DoctorRatingSummary({ rating, totalReviews, starBreakdown, categoryRatings }: DoctorRatingSummaryProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="grid gap-8 xl:grid-cols-[0.45fr_0.55fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-6">
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Rating summary</p>
          <div className="mt-6 flex items-end gap-6">
            <div>
              <p className="text-5xl font-semibold text-white">{rating.toFixed(1)}</p>
              <p className="text-sm text-ink-400">overall score</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{totalReviews} reviews</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {starBreakdown.map((item) => (
              <div key={item.stars} className="space-y-2">
                <div className="flex items-center justify-between text-sm text-ink-300">
                  <span>{item.stars} star</span>
                  <span>{item.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {categoryRatings.map((category) => (
            <div key={category.label} className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between text-sm text-ink-300">
                <p>{category.label}</p>
                <p className="font-semibold text-white">{category.score.toFixed(1)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent-500" style={{ width: `${(category.score / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

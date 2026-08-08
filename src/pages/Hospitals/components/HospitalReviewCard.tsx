import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { HospitalReviewItem } from '../data/hospitalDetailsData';

type HospitalReviewCardProps = {
  review: HospitalReviewItem;
};

export function HospitalReviewCard({ review }: HospitalReviewCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4, ease: 'easeOut' }}
      className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-[0_15px_40px_rgba(0,0,0,0.18)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200">
              {review.rating} ★
            </span>
            <Badge tone="brand">{review.treatmentTag}</Badge>
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">{review.title}</h3>
          <p className="mt-3 text-sm leading-7 text-ink-300">{review.content}</p>
        </div>

        <div className="flex min-w-[10rem] flex-col items-start gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
          <span>{new Date(review.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-ink-200">
            {review.verified ? 'Verified' : 'Unverified'}
          </span>
          <span>{review.helpfulCount} helpful</span>
          <Button type="button" variant="ghost" size="sm">
            Mark helpful
          </Button>
          {review.response && (
            <div className="rounded-[1.5rem] border border-brand-400/20 bg-brand-500/10 p-3 text-sm text-brand-100">
              <p className="font-semibold">Hospital response</p>
              <p className="mt-1">{review.response}</p>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import type { DoctorReviewItem } from '../data/doctorProfileData';

type DoctorReviewCardProps = {
  review: DoctorReviewItem;
};

export function DoctorReviewCard({ review }: DoctorReviewCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35 }}
      className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{review.title}</p>
            {review.verified ? <Badge tone="success">Verified</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-ink-300">{review.specialtyTag}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-white">{review.rating}.0 ★</p>
          <p className="text-sm text-ink-400">{new Date(review.date).toLocaleDateString()}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-ink-300">{review.content}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-400">
        <span>{review.helpfulCount} found this helpful</span>
        {review.response ? <span className="rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-brand-100">Doctor response</span> : null}
      </div>
      {review.response ? (
        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300">
          <p className="font-semibold text-white">Response from doctor</p>
          <p className="mt-2">{review.response}</p>
        </div>
      ) : null}
    </motion.article>
  );
}

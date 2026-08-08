import { motion } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import type { HospitalReviewSummary } from '../data/reviewDiscoveryData';

function getStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => index + 1 <= Math.round(rating));
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type HospitalReviewCardProps = {
  review: HospitalReviewSummary;
  onViewHospital: (id: string) => void;
};

export function HospitalReviewCard({ review, onViewHospital }: HospitalReviewCardProps) {
  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className="group overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-200">Trusted review</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{review.name}</h3>
          <p className="mt-2 text-sm text-ink-300">{review.location}</p>
        </div>
        <div className="flex flex-col gap-2 rounded-[1.5rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-right">
          <span className="text-3xl font-semibold text-white">{review.rating.toFixed(1)}</span>
          <span className="text-sm uppercase tracking-[0.22em] text-ink-300">{review.reviewCount} reviews</span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[0.85fr_0.15fr]">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">Patient experience</p>
            <p className="text-sm leading-7 text-ink-300">{review.highlight}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-4 text-sm text-ink-300">
            <p className="font-semibold text-white">Verified</p>
            <p className="mt-1">{formatDate(review.reviewedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {review.specialties.map((specialty) => (
            <Badge key={specialty} tone="neutral" className="text-[0.72rem] uppercase tracking-[0.24em] text-ink-200">
              {specialty}
            </Badge>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Lead reviewer</p>
            <p className="mt-2 text-base font-semibold text-white">{review.reviewerName}</p>
            <p className="mt-1 text-sm text-ink-400">{review.reviewerRole}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300">
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Patient confidence</p>
            <div className="mt-3 flex items-center gap-1 text-amber-300">
              {getStars(review.rating).map((filled, idx) => (
                <span key={idx} className={filled ? 'text-amber-300' : 'text-white/20'}>★</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-[0.79rem] text-ink-300">
          {review.focusTags.map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.24em] text-ink-200">
              {tag.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onViewHospital(review.id)}>
          View Hospital
        </Button>
      </div>
    </motion.article>
  );
}

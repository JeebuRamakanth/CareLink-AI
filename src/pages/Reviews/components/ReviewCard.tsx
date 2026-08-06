import type { Review } from '../../../types';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/common/cn';

function formatReviewDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type ReviewCardProps = {
  review: Review;
};

export function ReviewCard({ review }: ReviewCardProps) {
  const ratingStars = Array.from({ length: 5 }, (_, index) => index + 1 <= Math.round(review.rating));

  return (
    <Card className="h-full rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] border border-white/10 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-brand-500/20 to-slate-950 text-lg font-semibold text-white shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
            {review.patient_initials}
          </div>
          <div>
            <p className="text-base font-semibold text-white">{review.patient_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {review.patient_verified ? <Badge tone="success">Verified Patient</Badge> : null}
            </div>
          </div>
        </div>

        <div className="space-y-1 text-right text-sm text-ink-300">
          <p className="font-semibold text-white">{review.subject_name}</p>
          <p>{review.subject_type}</p>
          <p>{formatReviewDate(review.reviewed_at)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-amber-300">
        {ratingStars.map((filled, index) => (
          <span key={index} className={cn('text-base leading-none', filled ? 'text-amber-300' : 'text-white/20')}>
            ★
          </span>
        ))}
        <span className="text-white">{review.rating.toFixed(1)}</span>
      </div>

      <div className="mt-4 space-y-3">
        <h3 className="text-xl font-semibold text-white">{review.title}</h3>
        <p className="text-sm leading-7 text-ink-300">{review.comment}</p>
      </div>
    </Card>
  );
}

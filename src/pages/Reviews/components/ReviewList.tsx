import type { Review } from '../../../types';
import { ReviewCard } from './ReviewCard';

type ReviewListProps = {
  reviews: Review[];
};

export function ReviewList({ reviews }: ReviewListProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}

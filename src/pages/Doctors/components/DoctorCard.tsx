import { BaseCard } from '../../../components/cards/BaseCard';
import { CardActions } from '../../../components/cards/CardActions';
import { CardBadge } from '../../../components/cards/CardBadge';
import { CardBody } from '../../../components/cards/CardBody';
import { CardFooter } from '../../../components/cards/CardFooter';
import { CardHeader } from '../../../components/cards/CardHeader';
import { CardImage } from '../../../components/cards/CardImage';

type DoctorCardProps = {
  name?: string;
  specialty?: string;
  location?: string;
  availability?: string;
  rating?: number;
  reviewCount?: number;
  className?: string;
};

export function DoctorCard({
  name = 'Doctor Name',
  specialty = 'Specialty',
  location = 'Location',
  availability = 'Available',
  rating = 4.8,
  reviewCount = 0,
  className = '',
}: DoctorCardProps) {
  return (
    <BaseCard variant="glass" interactive className={className} as="article" ariaLabel={`Doctor card for ${name}`}>
      <CardImage placeholder />
      <CardBody className="mt-3">
        <CardHeader>
          <div>
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            <p className="mt-1 text-sm text-ink-400">{specialty}</p>
          </div>
          <CardBadge tone="brand">{availability}</CardBadge>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-300">
          <span>{location}</span>
          <span className="text-ink-500">•</span>
          <span>
            ★ {rating.toFixed(1)} ({reviewCount} reviews)
          </span>
        </div>
        <CardActions>
          <CardBadge tone="default">Profile</CardBadge>
          <CardBadge tone="default">Schedule</CardBadge>
        </CardActions>
      </CardBody>
      <CardFooter>
        <button type="button" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-ink-200">
          View profile
        </button>
        <button type="button" className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-2 text-sm font-semibold text-white">
          Book visit
        </button>
      </CardFooter>
    </BaseCard>
  );
}

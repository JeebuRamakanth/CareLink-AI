import { BaseCard } from '../../../components/cards/BaseCard';
import { CardActions } from '../../../components/cards/CardActions';
import { CardBadge } from '../../../components/cards/CardBadge';
import { CardBody } from '../../../components/cards/CardBody';
import { CardFooter } from '../../../components/cards/CardFooter';
import { CardHeader } from '../../../components/cards/CardHeader';
import { CardImage } from '../../../components/cards/CardImage';
import type { Doctor } from '../../../types';

type DoctorCardProps = {
  doctor: Doctor;
  className?: string;
};

const availabilityTone: Record<NonNullable<Doctor['availability_status']>, 'brand' | 'success' | 'danger' | 'default'> = {
  available: 'success',
  busy: 'brand',
  limited: 'default',
  offline: 'danger',
};

const availabilityLabel: Record<NonNullable<Doctor['availability_status']>, string> = {
  available: 'Available',
  busy: 'Busy',
  limited: 'Limited',
  offline: 'Offline',
};

export function DoctorCard({ doctor, className = '' }: DoctorCardProps) {
  const availability = doctor.availability_status ? availabilityLabel[doctor.availability_status] : null;
  const badgeTone = doctor.availability_status ? availabilityTone[doctor.availability_status] : 'default';

  return (
    <BaseCard variant="glass" interactive className={className} as="article" ariaLabel={`Doctor card for ${doctor.full_name}`}>
      <CardImage placeholder>
        <div className="flex h-full items-end justify-between bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.28),transparent_42%),linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] p-4">
          <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
            {doctor.specialty}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-ink-200">
            {doctor.city}
          </span>
        </div>
      </CardImage>
      <CardBody className="mt-3">
        <CardHeader>
          <div>
            <h3 className="text-lg font-semibold text-white">{doctor.full_name}</h3>
            <p className="mt-1 text-sm text-ink-400">{doctor.specialty}</p>
          </div>
          {availability ? (
            <CardBadge tone={badgeTone}>{availability}</CardBadge>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink-400">
              Availability unlisted
            </span>
          )}
        </CardHeader>
        <div className="space-y-2 text-sm text-ink-300">
          <p>{doctor.education[0] ?? 'Board-certified specialist'}</p>
          <p>{doctor.years_of_experience} years of experience</p>
          <p>{doctor.location}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span>★ {doctor.rating.toFixed(1)}</span>
            <span className="text-ink-500">•</span>
            <span>({doctor.review_count} reviews)</span>
          </div>
        </div>
        <CardActions>
          <CardBadge tone="default">{doctor.languages.slice(0, 2).join(', ')}</CardBadge>
          <CardBadge tone="brand">{doctor.accepts_new_patients ? 'New patients' : 'Follow-up care'}</CardBadge>
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

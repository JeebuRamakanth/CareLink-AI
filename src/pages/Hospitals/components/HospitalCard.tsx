import { useState } from 'react';

type HospitalCardProps = {
  name: string;
  address: string;
  distance?: string;
  rating?: number;
  reviewCount?: number;
  isOpen?: boolean;
  emergencyAvailable?: boolean;
  is24x7?: boolean;
  departments?: string[];
  doctorsCount?: number;
  insuranceAccepted?: boolean;
  bloodBankAvailable?: boolean;
  ambulanceAvailable?: boolean;
  accreditation?: string[];
  imageLabel?: string;
  className?: string;
};

export function HospitalCard({
  name,
  address,
  distance = '2.4 km away',
  rating = 4.8,
  reviewCount = 128,
  isOpen = true,
  emergencyAvailable = true,
  is24x7 = true,
  departments = ['Cardiology', 'Neurology', 'Orthopedics'],
  doctorsCount = 24,
  insuranceAccepted = true,
  bloodBankAvailable = true,
  ambulanceAvailable = true,
  accreditation = ['JCI', 'NABH'],
  imageLabel = 'Hospital preview',
  className = '',
}: HospitalCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3 shadow-[0_16px_70px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-[0_22px_90px_rgba(77,132,255,0.18)] focus-within:border-brand-400/40 ${className}`}
    >
      <div className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-slate-950/70">
        <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.3),transparent_38%),linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]">
          <div className="absolute inset-0 transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 flex items-end justify-between p-4">
            <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
              {imageLabel}
            </div>
            <div className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-emerald-200">
              {isOpen ? 'Open now' : 'Closed'}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-2 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {accreditation.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink-300"
                >
                  {badge}
                </span>
              ))}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">{name}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-300">{address}</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Add to favorites"
            onClick={() => setIsFavorite((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 p-2.5 text-xl text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/12 hover:text-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            {isFavorite ? '♥' : '♡'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-300">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-300">★</span>
            <span className="font-semibold text-white">{rating.toFixed(1)}</span>
            <span>({reviewCount} reviews)</span>
          </div>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>{distance}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {emergencyAvailable ? (
            <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.75 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-rose-200">
              Emergency
            </span>
          ) : null}
          {is24x7 ? (
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.75 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-100">
              24×7
            </span>
          ) : null}
          {insuranceAccepted ? (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.75 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Insurance
            </span>
          ) : null}
        </div>

        <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-300">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Departments</p>
              <p className="mt-1 text-white">{departments.slice(0, 3).join(' • ')}</p>
            </div>
            <div className="text-right">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Doctors</p>
              <p className="mt-1 font-semibold text-white">{doctorsCount} available</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {bloodBankAvailable ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.75 py-1 text-[0.7rem] font-medium text-ink-300">
              Blood Bank
            </span>
          ) : null}
          {ambulanceAvailable ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.75 py-1 text-[0.7rem] font-medium text-ink-300">
              Ambulance
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="button"
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            View details
          </button>
          <button
            type="button"
            className="flex-1 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            Book appointment
          </button>
        </div>
      </div>
    </article>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../routes/routeConstants';
import type { Hospital } from '../../../types';
import { hospitalDetailsPath } from '../../../services/maps/hospitalPlaceMapping';
import { buildDirectionsUrl, buildPlaceSearchUrl } from '../../../services/maps/directionsService';
import { getListedDoctorCount } from '../../../services/providerDirectoryService';
import { hospitalImageSource } from '../hospitalPresentation';

type HospitalCardProps = {
  hospital: Hospital;
  className?: string;
};

export function HospitalCard({ hospital, className = '' }: HospitalCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const detailHref = hospitalDetailsPath(hospital.id);
  const imageUrl = hospitalImageSource(hospital.image_url);
  const directionsUrl = buildDirectionsUrl({
    name: hospital.name,
    address: [hospital.address, hospital.city, hospital.pincode].filter(Boolean).join(', '),
    locality: hospital.city,
    district: hospital.district,
    state: hospital.state,
    latitude: hospital.latitude,
    longitude: hospital.longitude,
    placeId: hospital.id.startsWith('google-') ? hospital.id.slice('google-'.length) : null,
  }) ?? buildPlaceSearchUrl({ name: hospital.name, address: hospital.address, locality: hospital.city, district: hospital.district, state: hospital.state });
  const {
    facilities,
    departments,
    insurance_partners,
  } = hospital;

  const emergencyAvailable = facilities.emergency;
  const is24x7 = facilities.twenty_four_hours;
  const insuranceAccepted = (insurance_partners?.length ?? 0) > 0;
  const bloodBankAvailable = facilities.blood_bank;
  const ambulanceAvailable = facilities.ambulance;
  // Never fabricate a doctor count: the number is the REAL listed-affiliation
  // count from the directory, and it is labelled as a listing, not staffing.
  const listedDoctors = getListedDoctorCount(hospital.id);
  const doctorsCount = hospital.doctor_count && hospital.doctor_count > 0
    ? `${hospital.doctor_count} listed`
    : listedDoctors > 0
      ? `${listedDoctors} listed`
      : 'Not published';

  return (
    <article className={`group overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3 shadow-[0_16px_70px_rgba(0,0,0,0.2)] transition hover:-translate-y-1 hover:border-brand-400/30 ${className}`}>
      <div className="relative aspect-[16/8] overflow-hidden rounded-[1.2rem] border border-white/10 bg-slate-950/70">
        <img
          src={imageUrl}
          alt={hospital.image_url ? `${hospital.name} facility` : 'Illustration; facility photo unavailable'}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = hospitalImageSource();
          }}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-xs font-semibold text-white">
          {hospital.facility_type || 'Healthcare facility'}
        </span>
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${hospital.name} from favorites` : `Add ${hospital.name} to favorites`}
          aria-pressed={isFavorite}
          onClick={() => setIsFavorite((current) => !current)}
          className="absolute right-3 top-3 rounded-full border border-white/15 bg-slate-950/85 p-2 text-xl text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>

      <div className="space-y-4 p-2 pt-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-ink-300">
              {hospital.verification_status === 'GOOGLE_PLACES' ? 'Google Places · unverified' : hospital.verification_status ?? 'Unverified'}
            </span>
            {hospital.business_status && hospital.business_status !== 'OPERATIONAL' ? (
              <span className="rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-1 text-xs text-rose-100">
                {hospital.business_status === 'CLOSED_PERMANENTLY' ? 'Listed permanently closed' : 'Listed temporarily closed'}
              </span>
            ) : null}
            {hospital.rating > 0 ? (
              <span className="text-sm text-ink-300">
                <span aria-hidden="true" className="text-amber-300">★</span> {hospital.rating.toFixed(1)}
                {hospital.review_count > 0 ? ` · ${hospital.review_count.toLocaleString()} ratings` : ''}
              </span>
            ) : null}
          </div>
          <h2 className="text-xl font-semibold text-white">{hospital.name}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-300">{hospital.address || 'Address not available'}</p>
        </div>

        {hospital.specialties.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Specialties / services</p>
            <p className="mt-1 text-sm text-ink-200">{hospital.specialties.slice(0, 4).join(' · ')}</p>
          </div>
        ) : null}

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
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Departments</p>
              <p className="mt-1 break-words text-white">
                {departments.length > 0 ? departments.slice(0, 3).join(' • ') : 'Not published'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Doctors</p>
              <p className="mt-1 font-semibold text-white">{doctorsCount}</p>
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
          <Link
            to={detailHref}
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            View details
          </Link>
          <Link
            to={`${ROUTES.appointments}?hosp=${hospital.id}`}
            className="flex-1 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          >
            Book appointment
          </Link>
          <a
            href={directionsUrl ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-center text-sm font-semibold text-ink-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
          >
            Directions
          </a>
        </div>
      </div>
    </article>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ReviewComposer } from '../../components/reviews/ReviewComposer';
import { Button } from '../../components/ui/Button';
import { Container } from '../../components/ui/Container';
import { ROUTES } from '../../routes/routeConstants';
import { hospitalDirectionsUrl } from '../../services/maps/hospitalPlaceMapping';
import { getHospitalById } from '../../services/hospitalService';
import type { Hospital } from '../../types';
import { hospitalImageSource } from './hospitalPresentation';

function formatDate(value?: string): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

export function HospitalDetailsPage() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHospital = useCallback(async () => {
    if (!hospitalId) {
      setHospital(null);
      setError('A hospital ID was not provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const record = await getHospitalById(hospitalId);
      setHospital(record);
      if (!record) {
        setError('This facility could not be found in the current directory. It may be outside the search area or no longer listed.');
      }
    } catch {
      setHospital(null);
      setError('Unable to retrieve this facility’s current details. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    void loadHospital();
  }, [loadHospital]);

  if (loading) {
    return (
      <Container className="py-12">
        <div role="status" aria-live="polite" className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-ink-300">
          Loading hospital details…
        </div>
      </Container>
    );
  }

  if (error || !hospital) {
    return (
      <Container className="py-12">
        <div className="rounded-3xl border border-rose-300/20 bg-slate-950/80 p-8">
          <h1 className="text-2xl font-semibold text-white">Hospital details unavailable</h1>
          <p role="alert" className="mt-3 text-ink-300">{error ?? 'This facility is not available.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => void loadHospital()}>Retry</Button>
            <Link to={ROUTES.hospitals} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              Back to hospitals
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const destination = hospitalDirectionsUrl(hospital);

  return (
    <Container className="py-8 sm:py-10 lg:py-14">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to={ROUTES.hospitals} className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink-200 hover:bg-white/10">
          ← Back to Machilipatnam directory
        </Link>

        <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
          <div className="grid md:grid-cols-[0.8fr_1.2fr]">
            <img
              src={hospitalImageSource(hospital.image_url)}
              alt={hospital.image_url ? `${hospital.name} facility` : 'Illustration; facility photo unavailable'}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = hospitalImageSource();
              }}
              className="h-64 w-full bg-slate-900 object-cover md:h-full md:min-h-80"
            />
            <div className="space-y-5 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand-300/20 bg-brand-300/10 px-3 py-1 text-xs font-semibold text-brand-100">
                  {hospital.facility_type || 'Healthcare facility'}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-ink-300">
                  {hospital.verification_status === 'GOOGLE_PLACES' ? 'Google Places listing · not independently verified' : hospital.verification_status ?? 'Unverified'}
                </span>
                {hospital.business_status && hospital.business_status !== 'OPERATIONAL' ? (
                  <span className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-100">
                    {hospital.business_status === 'CLOSED_PERMANENTLY' ? 'Listed permanently closed' : 'Listed temporarily closed'}
                  </span>
                ) : null}
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">{hospital.name}</h1>
                <p className="mt-3 text-sm leading-6 text-ink-300">{hospital.address || 'Address not available'}</p>
              </div>
              {hospital.rating > 0 ? (
                <p className="text-sm text-ink-300">
                  <span className="text-amber-300">★</span> {hospital.rating.toFixed(1)}
                  {hospital.review_count > 0 ? ` · ${hospital.review_count.toLocaleString()} ratings` : ''}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {hospital.phone ? <a href={`tel:${hospital.phone}`} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Call {hospital.phone}</a> : null}
                <a href={destination} target="_blank" rel="noreferrer noopener" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                  Directions
                </a>
                {hospital.website ? <a href={hospital.website} target="_blank" rel="noreferrer noopener" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white">Website listed</a> : null}
              </div>
            </div>
          </div>
        </article>

        <section aria-labelledby="facility-information" className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
          <h2 id="facility-information" className="text-xl font-semibold text-white">Available information</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Phone</dt><dd className="mt-1 text-ink-200">{hospital.phone || 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Website</dt><dd className="mt-1 break-all text-ink-200">{hospital.website || 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Specialties / services</dt><dd className="mt-1 text-ink-200">{hospital.specialties.length ? hospital.specialties.join(', ') : 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Opening hours</dt><dd className="mt-1 text-ink-200">{hospital.opening_hours?.length ? hospital.opening_hours.join('; ') : 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Coordinates</dt><dd className="mt-1 text-ink-200">{typeof hospital.latitude === 'number' && typeof hospital.longitude === 'number' ? `${hospital.latitude}, ${hospital.longitude}` : 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Emergency services</dt><dd className="mt-1 text-ink-200">{hospital.facilities.emergency ? 'Listed' : 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Listing status</dt><dd className="mt-1 text-ink-200">{hospital.business_status?.replaceAll('_', ' ').toLowerCase() ?? 'Not available'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Data source</dt><dd className="mt-1 text-ink-200">{hospital.source_label || 'Provider registry'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-ink-400">Last checked</dt><dd className="mt-1 text-ink-200">{formatDate(hospital.last_checked_at)}</dd></div>
          </dl>
          <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-6 text-ink-400">
            Listings may be incomplete or outdated. A Google Places listing is a discovery source and is not independent confirmation that a facility is operational or that every listed field is correct.
            {hospital.google_maps_url ? <> {' '}Source: <a href={hospital.google_maps_url} target="_blank" rel="noreferrer noopener" className="text-brand-200 underline">Google Maps / Places</a>.</> : null}
          </p>
          {hospital.google_attributions?.length ? (
            <ul className="mt-3 space-y-1 text-xs text-ink-400">
              {hospital.google_attributions.map((attribution) => (
                <li key={`${attribution.provider}-${attribution.provider_uri ?? ''}`}>
                  {attribution.provider_uri ? <a href={attribution.provider_uri} target="_blank" rel="noreferrer noopener" className="underline">{attribution.provider}</a> : attribution.provider}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {!hospital.id.startsWith('google-') ? (
          <section aria-labelledby="hospital-review-heading" className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
            <h2 id="hospital-review-heading" className="mb-5 text-xl font-semibold text-white">Share your experience</h2>
            <ReviewComposer target={{ kind: 'hospital', id: hospital.id }} />
          </section>
        ) : null}
      </div>
    </Container>
  );
}

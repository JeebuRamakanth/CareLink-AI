import { Link } from 'react-router-dom';
import { ROUTES } from '../../../routes/routeConstants';
import { buildDirectionsUrl, buildPlaceSearchUrl } from '../../../services/maps/directionsService';
import type { BloodCentre } from '../../../types';

type BloodCentreCardProps = {
  centre: BloodCentre;
  hospitalName?: string;
};

/**
 * Blood centre card. Every control has a real outcome:
 *   - Contact → tel: when the source published a phone number
 *   - Website → the centre's official site when published
 *   - Directions → a Google Maps directions URL for THIS centre
 *   - Stock    → an honest "not integrated" state plus the official e-RaktKosh link
 */
export function BloodCentreCard({ centre, hospitalName }: BloodCentreCardProps) {
  const directions = buildDirectionsUrl({
    name: centre.name,
    address: centre.address,
    locality: centre.locality,
    district: centre.district,
    state: centre.state,
    latitude: centre.latitude,
    longitude: centre.longitude,
    placeId: null,
  });
  const placeSearch = buildPlaceSearchUrl({ name: centre.name, address: centre.address, locality: centre.locality, district: centre.district, state: centre.state });

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_16px_70px_rgba(0,0,0,0.2)]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-rose-100">
            Blood centre
          </span>
          {centre.ownership ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-ink-300">{centre.ownership}</span>
          ) : null}
          {centre.category_label ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-ink-300">{centre.category_label}</span>
          ) : null}
        </div>
        <h3 className="break-words text-lg font-semibold text-white">{centre.name}</h3>
        <p className="mt-1 break-words text-sm leading-6 text-ink-300">{centre.address || 'Address not available'}</p>
        <p className="mt-1 text-sm text-ink-400">
          {[centre.locality, centre.district, centre.pincode].filter(Boolean).join(', ') || 'Locality not published'}
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p className="text-ink-300">
          <span className="text-ink-400">Phone: </span>
          {centre.phone || 'Not published'}
          {centre.phone_alt ? ` · ${centre.phone_alt}` : ''}
        </p>
        {centre.hospital_id ? (
          <p className="text-ink-300">
            <span className="text-ink-400">Associated facility: </span>
            {hospitalName ? (
              <Link to={`${ROUTES.hospitals}/${centre.hospital_id}`} className="text-brand-200 underline">{hospitalName}</Link>
            ) : 'Listed'}
          </p>
        ) : null}
        <p className="text-ink-400">
          {centre.stock_source === 'live' ? 'Live stock available' : 'Live stock not integrated — confirm current availability with the centre'}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        {centre.phone ? (
          <a href={`tel:${centre.phone.replace(/[^\d+]/g, '')}`} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Call centre
          </a>
        ) : (
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-ink-400">Phone not published</span>
        )}
        {centre.website ? (
          <a href={centre.website} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Website
          </a>
        ) : null}
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Directions
          </a>
        ) : placeSearch ? (
          <a href={placeSearch} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Find on map
          </a>
        ) : (
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-ink-400">Directions unavailable — no published location</span>
        )}
      </div>

      {centre.provenance ? (
        <p className="border-t border-white/10 pt-3 text-xs leading-5 text-ink-400">
          Source: {centre.provenance.source_url
            ? <a href={centre.provenance.source_url} target="_blank" rel="noopener noreferrer" className="underline">{centre.provenance.data_source}</a>
            : centre.provenance.data_source}
          {centre.provenance.fetched_at ? ` · checked ${centre.provenance.fetched_at}` : ''} · Listing, not independent verification of current operation or stock.
        </p>
      ) : null}
    </article>
  );
}

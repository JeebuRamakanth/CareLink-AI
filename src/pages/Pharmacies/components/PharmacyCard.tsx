import { buildDirectionsUrl, buildPlaceSearchUrl } from '../../../services/maps/directionsService';
import type { Pharmacy } from '../../../types';

type PharmacyCardProps = {
  pharmacy: Pharmacy & { distanceKm?: number | null };
  /** Highlight the ranking reason when the list is sorted by proximity. */
  showRankNote?: boolean;
};

/**
 * Pharmacy card. Every control has a real outcome:
 *   - Call      → tel: when a source published a phone number
 *   - Directions→ a Google Maps directions URL for THIS pharmacy (Place ID →
 *                 coordinates → address → locality), or an honest unavailable state
 *   - Stock     → an explicit "not connected — confirm with the pharmacy" state
 *   - Source    → the record's provenance link
 *
 * Nothing here invents a rating, an opening hour or a stock level.
 */
export function PharmacyCard({ pharmacy, showRankNote }: PharmacyCardProps) {
  const directions = buildDirectionsUrl({
    name: pharmacy.name,
    address: pharmacy.address,
    locality: pharmacy.locality,
    district: pharmacy.district,
    state: pharmacy.state,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    placeId: null,
  });
  const placeSearch = buildPlaceSearchUrl({
    name: pharmacy.name,
    address: pharmacy.address,
    locality: pharmacy.locality,
    district: pharmacy.district,
    state: pharmacy.state,
  });

  const distance = typeof pharmacy.distanceKm === 'number' ? pharmacy.distanceKm : null;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_16px_70px_rgba(0,0,0,0.2)]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent-400/25 bg-accent-400/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-accent-100">
            Pharmacy
          </span>
          {pharmacy.brand ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-ink-300">{pharmacy.brand}</span>
          ) : null}
          {distance !== null ? (
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.68rem] font-semibold text-brand-100">
              {distance} km
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-ink-400">Distance unavailable</span>
          )}
        </div>
        <h3 className="break-words text-lg font-semibold text-white">{pharmacy.name}</h3>
        <p className="mt-1 break-words text-sm leading-6 text-ink-300">{pharmacy.address || 'Address not published'}</p>
        <p className="mt-1 text-sm text-ink-400">
          {[pharmacy.locality, pharmacy.district, pharmacy.pincode].filter(Boolean).join(', ') || 'Locality not published'}
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p className="text-ink-300">
          <span className="text-ink-400">Phone: </span>
          {pharmacy.phone ?? 'Not published'}
        </p>
        <p className="text-ink-300">
          <span className="text-ink-400">Opening hours: </span>
          {pharmacy.opening_hours ?? 'Not published'}
        </p>
        <p className="text-ink-400">
          Medicine stock is not connected — confirm availability directly with the pharmacy.
        </p>
      </div>

      {showRankNote ? (
        <p className="rounded-[0.8rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.72rem] leading-5 text-ink-400">
          Ranked by distance from your location
          {distance !== null ? ` (${distance} km)` : ''} — not by a quality or popularity rating, which no source provides.
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {pharmacy.phone ? (
          <a href={`tel:${pharmacy.phone.replace(/[^\d+]/g, '')}`} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Call pharmacy
          </a>
        ) : (
          <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-ink-400">Phone not published</span>
        )}
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

      {pharmacy.provenance ? (
        <p className="border-t border-white/10 pt-3 text-xs leading-5 text-ink-400">
          Source: {pharmacy.provenance.source_url ? (
            <a href={pharmacy.provenance.source_url} target="_blank" rel="noopener noreferrer" className="underline">{pharmacy.provenance.data_source}</a>
          ) : pharmacy.provenance.data_source}
          {pharmacy.last_checked_at ? ` · checked ${pharmacy.last_checked_at}` : ''} · Listing, not a licence or stock verification.
        </p>
      ) : null}
    </article>
  );
}

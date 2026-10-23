import { buildDirectionsUrl, buildPlaceSearchUrl } from '../../../services/maps/directionsService';
import type { Laboratory } from '../../../types';

type LaboratoryCardProps = {
  laboratory: Laboratory & { distanceKm?: number | null };
};

/**
 * Laboratory card. Tests, prices and home-collection are shown ONLY when a
 * source published them — the sourced directory carries none, so the card says
 * so instead of inventing a test menu.
 */
export function LaboratoryCard({ laboratory }: LaboratoryCardProps) {
  const directions = buildDirectionsUrl({
    name: laboratory.name,
    address: laboratory.address,
    locality: laboratory.locality,
    district: laboratory.district,
    state: laboratory.state,
    latitude: laboratory.latitude,
    longitude: laboratory.longitude,
    placeId: null,
  });
  const placeSearch = buildPlaceSearchUrl({
    name: laboratory.name,
    address: laboratory.address,
    locality: laboratory.locality,
    district: laboratory.district,
    state: laboratory.state,
  });

  const distance = typeof laboratory.distanceKm === 'number' ? laboratory.distanceKm : null;
  const tests = laboratory.tests ?? [];

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_16px_70px_rgba(0,0,0,0.2)]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-100">
            Laboratory
          </span>
          {distance !== null ? (
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.68rem] font-semibold text-brand-100">{distance} km</span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] text-ink-400">Distance unavailable</span>
          )}
        </div>
        <h3 className="break-words text-lg font-semibold text-white">{laboratory.name}</h3>
        <p className="mt-1 break-words text-sm leading-6 text-ink-300">{laboratory.address || 'Address not published'}</p>
        <p className="mt-1 text-sm text-ink-400">
          {[laboratory.locality, laboratory.district, laboratory.pincode].filter(Boolean).join(', ') || 'Locality not published'}
        </p>
      </div>

      <div className="space-y-1 text-sm">
        <p className="text-ink-300">
          <span className="text-ink-400">Phone: </span>
          {laboratory.phone ?? 'Not published'}
        </p>
        <p className="text-ink-300">
          <span className="text-ink-400">Opening hours: </span>
          {laboratory.opening_hours ?? 'Not published'}
        </p>
        <p className="text-ink-400">
          {tests.length > 0
            ? `Listed tests: ${tests.join(', ')}`
            : 'Test menu, prices and home-collection are not published for this facility — confirm directly.'}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        {laboratory.phone ? (
          <a href={`tel:${laboratory.phone.replace(/[^\d+]/g, '')}`} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Call laboratory
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

      {laboratory.provenance ? (
        <p className="border-t border-white/10 pt-3 text-xs leading-5 text-ink-400">
          Source: {laboratory.provenance.source_url ? (
            <a href={laboratory.provenance.source_url} target="_blank" rel="noopener noreferrer" className="underline">{laboratory.provenance.data_source}</a>
          ) : laboratory.provenance.data_source}
          {laboratory.last_checked_at ? ` · checked ${laboratory.last_checked_at}` : ''} · Listing, not a licence verification.
        </p>
      ) : null}
    </article>
  );
}

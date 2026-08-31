import { DataStatusBadge } from '../../../components/ui/DataStatusBadge';
import { providerDirections } from '../providerDiscoveryService';
import type { LabDiscovery, PharmacyDiscovery } from '../types';

interface ProviderDiscoveryCardProps {
  provider: PharmacyDiscovery | LabDiscovery;
}

function formatDistance(km: number | null): string {
  if (km === null || km === undefined) return 'Distance unavailable';
  return km.toFixed(1) + ' km away';
}

export function ProviderDiscoveryCard({ provider }: ProviderDiscoveryCardProps) {
  const isPharmacy = provider.kind === 'pharmacy';
  const rating = provider.rating ?? null;
  const displayAddress = [provider.address?.trim() ?? null, provider.city?.trim() ?? null].filter(Boolean).join(' · ');
  const directionsHref = providerDirections(provider.kind, provider);
  const pharma = provider as PharmacyDiscovery;
  const lab = provider as LabDiscovery;
  const homeCollection = lab.homeCollection ?? null;
  const hasTests = Array.isArray(lab.tests) && lab.tests.length > 0;
  const testsLabel = hasTests ? lab.tests.slice(0, 4).join(' · ') : '(tests unavailable)';
  const inventoryLabel = pharma.hasInventory ? 'Stock data available' : 'Inventory availability unavailable';

  return (
    <article className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-xl focus-within:border-brand-400/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-widest text-brand-100">
              {isPharmacy ? 'Pharmacy' : 'Laboratory'}
            </span>
            <DataStatusBadge status={provider.dataStatus} />
          </div>
          <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
          <p className="text-sm leading-6 text-ink-300">{displayAddress}</p>
        </div>
        <a
          href={directionsHref}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          <span aria-hidden>→</span>
          Get directions
        </a>
      </div>

      {provider.fetchedAt ? (
        <p className="mt-2 text-xs text-ink-400">
          Fetched {new Date(provider.fetchedAt).toLocaleString()}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-300">
        {rating !== null ? (
          <span className="inline-flex items-center gap-1">
            ★ <span className="font-semibold text-white">{rating.toFixed(1)}</span>
          </span>
        ) : (
          <span className="text-ink-500">Rating unavailable</span>
        )}
        <span className="h-1 w-1 rounded-full bg-white/20" aria-hidden />
        <span>{formatDistance(provider.distanceKm)}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {isPharmacy ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-ink-400">Hours</p>
              <p className="mt-1 text-sm text-ink-200">{pharma.hoursLabel ?? 'Hours unavailable'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-ink-400">Inventory</p>
              <p className="mt-1 text-sm text-ink-200">{inventoryLabel}</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-ink-400">Home collection</p>
              <p className="mt-1 text-sm text-ink-200">
                {homeCollection === true ? 'Available' : homeCollection === false ? 'Not offered' : 'Unavailable'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-ink-400">Tests</p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-200">{testsLabel}</p>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 text-[0.68rem] uppercase tracking-widest text-ink-500">
        Source: {provider.source ?? 'unlisted'}
      </div>
    </article>
  );
}
import { Container } from '../../components/ui/Container';
import { Input } from '../../components/ui/Input';
import { DataStatusBadge } from '../../components/ui/DataStatusBadge';
import { useProviderDiscovery } from './hooks/useProviderDiscovery';
import { ProviderDiscoveryCard } from './components/ProviderDiscoveryCard';
import type { ProviderDiscoveryKind } from './types';

interface ProviderDiscoveryPageProps {
  kind: ProviderDiscoveryKind;
}

export function ProviderDiscoveryPage({ kind }: ProviderDiscoveryPageProps) {
  const isPharmacy = kind === 'pharmacy';
  const { items, loading, error, searchTerm, setSearchTerm, refresh } = useProviderDiscovery(kind);

  const title = isPharmacy ? 'Pharmacies' : 'Laboratories';
  const eyebrow = isPharmacy ? 'Medicines' : 'Diagnostics';
  const description = isPharmacy
    ? 'Discover pharmacy partners and medicine availability across the network.'
    : 'Discover laboratory partners, tests, and home-collection services.';
  const emptyTitle = isPharmacy ? 'No pharmacies matched' : 'No laboratories matched';
  const emptyDescription = isPharmacy
    ? 'Try adjusting your search or add pharmacy location data to the database.'
    : 'Try adjusting your search or add laboratory location data to the database.';

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <section className="space-y-8">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03)))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.16),transparent_34%)]" />
          <div className="relative max-w-2xl space-y-4">
            <span className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-brand-200">
              {eyebrow}
            </span>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="max-w-xl text-sm leading-7 text-ink-300">{description}</p>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03)))] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="block min-w-0 flex-1">
              <span className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-ink-400">
                Search {isPharmacy ? 'pharmacies' : 'laboratories'}
              </span>
              <Input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={isPharmacy ? 'Search by name, city, or medicine' : 'Search by name, city, or test'}
                className="w-full"
              />
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/12 hover:text-white"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <DataStatusBadge status={null} className="px-2 py-0.5" />
            <span>Provider records show their real data status — nothing is labelled live unless the database says so.</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4" role="status" aria-label="Loading provider results">
            {[0,1,2].map((n) => (
              <div key={n} className="h-40 animate-pulse rounded-[1.4rem] border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-6 text-sm text-rose-100">
            <p className="font-semibold text-white">Unable to load {isPharmacy ? 'pharmacy' : 'laboratory'} data</p>
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 rounded-full border border-rose-300/30 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-8 text-center text-sm">
            <p className="font-semibold text-white">{emptyTitle}</p>
            <p className="mt-1 text-ink-400">{emptyDescription}</p>
          </div>
        ) : (
          <>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-300">
              <span className="font-semibold text-white">{items.length} results</span>
              {' '}available — sourced from the configured data foundation;the UI never labels demo data as live.
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((provider) => (
                <ProviderDiscoveryCard key={provider.id} provider={provider} />
              ))}
            </div>
          </>
        )}
      </section>
    </Container>
  );
}
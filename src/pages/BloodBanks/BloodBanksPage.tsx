import { useCallback, useEffect, useMemo, useState } from 'react';
import { Container } from '../../components/ui/Container';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { BloodCentreCard } from './components/BloodCentreCard';
import {
  ERAKTKOSH_URL,
  bloodCentreFilterOptions,
  getBloodCentres,
  matchesBloodCentreFilters,
  matchesBloodCentreSearch,
  type BloodCentreFilters,
} from '../../services/bloodCentreService';
import { getHospitalName } from '../../services/providerDirectoryService';
import type { BloodCentre } from '../../types';

const initialFilters: BloodCentreFilters = { locality: '', ownership: '', hospitalAssociation: 'any' };

const associationOptions: Array<{ label: string; value: BloodCentreFilters['hospitalAssociation'] }> = [
  { label: 'All centres', value: 'any' },
  { label: 'Hospital-associated', value: 'hospital_linked' },
  { label: 'Standalone', value: 'standalone' },
];

export function BloodBanksPage() {
  const [centres, setCentres] = useState<BloodCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BloodCentreFilters>(initialFilters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCentres(await getBloodCentres());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load blood centres.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const options = useMemo(() => bloodCentreFilterOptions(centres), [centres]);

  const filtered = useMemo(
    () => centres.filter((centre) => matchesBloodCentreSearch(centre, search) && matchesBloodCentreFilters(centre, filters)),
    [centres, search, filters],
  );

  const updateFilter = <K extends keyof BloodCentreFilters>(key: K, value: BloodCentreFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    setSearch('');
    setFilters(initialFilters);
  };

  const hasActiveFilters = Boolean(search || filters.locality || filters.ownership || filters.hospitalAssociation !== 'any');

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-200">Blood centres</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Blood banks along the Machilipatnam–Vijayawada corridor</h1>
          <p className="max-w-3xl text-sm leading-7 text-ink-300">
            Sourced blood centres with their published contact details and directions. Live blood-group stock is not integrated,
            so confirm current availability and donor eligibility directly with the centre.
          </p>
        </header>

        <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-4 sm:p-5">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr]">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Search</span>
              <input
                id="blood-centre-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Centre name, locality or pincode"
                aria-label="Search blood centres by name, locality or pincode"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Locality</span>
              <select
                value={filters.locality}
                onChange={(event) => updateFilter('locality', event.target.value)}
                aria-label="Filter blood centres by locality"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">All localities</option>
                {options.localities.map((locality) => <option key={locality} value={locality}>{locality}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Ownership</span>
              <select
                value={filters.ownership}
                onChange={(event) => updateFilter('ownership', event.target.value)}
                aria-label="Filter blood centres by ownership"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">All ownership</option>
                {options.ownerships.map((ownership) => <option key={ownership} value={ownership}>{ownership}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Facility link</span>
              <select
                value={filters.hospitalAssociation}
                onChange={(event) => updateFilter('hospitalAssociation', event.target.value as BloodCentreFilters['hospitalAssociation'])}
                aria-label="Filter blood centres by hospital association"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {associationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-300">{filtered.length} centre{filtered.length === 1 ? '' : 's'} match your filters</p>
            <button
              type="button"
              onClick={reset}
              disabled={!hasActiveFilters}
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-ink-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Reset filters
            </button>
          </div>
        </div>

        <div role="note" className="rounded-[1.4rem] border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-6 text-amber-100">
          Live blood-group stock is not connected. e-RaktKosh is the official national stock service —{' '}
          <a href={ERAKTKOSH_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">check e-RaktKosh</a>{' '}
          or call the centre to confirm current availability before travelling.
        </div>

        {error ? (
          <ErrorState title="Unable to load blood centres" description={error} action={<button type="button" onClick={() => void load()} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>} />
        ) : loading ? (
          <div role="status" aria-live="polite" className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-ink-300">Loading blood centres…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No blood centres match those filters' : 'No blood centres are currently available'}
            description={hasActiveFilters ? 'Try a broader locality or clear the filters.' : 'No sourced blood centre is currently in the corridor directory.'}
            action={hasActiveFilters ? <button type="button" onClick={reset} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Reset filters</button> : undefined}
          />
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((centre) => (
              <BloodCentreCard key={centre.id} centre={centre} hospitalName={centre.hospital_id ? getHospitalName(centre.hospital_id) : undefined} />
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

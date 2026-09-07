/**
 * CareLink-AI — Global Admin Search (Step 17).
 *
 * A command-palette style search across patients/doctors/hospitals/pharmacies/
 * labs/appointments/reviews/blood donors. Every query rides the caller's own
 * Supabase JWT through the SECURITY DEFINER `carelink_admin_global_search` RPC,
 * which returns ONLY the categories the caller's permissions cover and redacts
 * blood-donor contact details. Debounced + paginated; never downloads the full
 * table; honest loading/empty/error states.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { adminGlobalSearch } from '../../services/health-data/adminRepository';
import type { AdminGlobalSearchRow } from '../../services/health-data/adminRepository';
import { isSupabaseConfigured } from '../../services/supabase/client';
import { ROUTES } from '../../routes/routeConstants';
import { cn } from '../../components/common/cn';

const KIND_LABEL: Record<string, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  lab: 'Lab',
  appointment: 'Appointment',
  review: 'Review',
  blood_donor: 'Blood donor',
};

const PAGE_SIZE = 10;

export function GlobalAdminSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminGlobalSearchRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const run = useCallback(async (q: string, p: number, append: boolean) => {
    if (!isSupabaseConfigured()) {
      setError('Admin backend is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await adminGlobalSearch(q, PAGE_SIZE, p);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRows((prev) => (append && prev ? [...prev, ...(res.data ?? [])] : (res.data ?? [])));
    setHasMore((res.data?.length ?? 0) >= PAGE_SIZE);
    setSearched(true);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setRows(null);
      setSearched(false);
      setHasMore(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setPage(0);
      void run(q, 0, false);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, run]);

  const openPalette = () => {
    setOpen(true);
    setQuery('');
    setRows(null);
    setSearched(false);
    setHasMore(false);
    setError(null);
  };

  const closePalette = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const goTo = (row: AdminGlobalSearchRow) => {
    closePalette();
    if (row.kind === 'patient') {
      navigate(`${ROUTES.adminUsers}?q=${encodeURIComponent(row.title || row.subtitle)}`);
      return;
    }
    if (row.kind === 'hospital' || row.kind === 'doctor' || row.kind === 'pharmacy' || row.kind === 'lab') {
      const slug = (row.extra?.slug as string) ?? '';
      if (slug) {
        navigate(row.kind === 'hospital' ? `${ROUTES.hospitals}/${slug}` : row.kind === 'doctor' ? `${ROUTES.doctors}/${slug}` : `${ROUTES.adminProviders}?kind=${row.kind}&q=${encodeURIComponent(row.title)}`);
        return;
      }
      navigate(`${ROUTES.adminProviders}?kind=${row.kind}&q=${encodeURIComponent(row.title)}`);
      return;
    }
    if (row.kind === 'appointment') {
      navigate(`${ROUTES.adminAppointments}?q=${encodeURIComponent(row.title || row.subtitle)}`);
      return;
    }
    if (row.kind === 'review') {
      navigate(ROUTES.adminReviews);
      return;
    }
    // blood_donor: super-admin only; land on data-quality (donors aren't a page).
    navigate(ROUTES.adminDataQuality);
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openPalette} aria-haspopup="dialog" aria-expanded={open}>
        <span aria-hidden>⌕</span> Search
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Global admin search"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={closePalette}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
                <span className="sr-only">Global admin search</span>
                <input
                  autoFocus
                  type="search"
                  placeholder="Search patients, doctors, hospitals, pharmacies, labs, appointments, reviews, blood donors…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Global admin search"
                  className="w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white shadow-inner outline-none transition-all duration-200 placeholder:text-ink-400 focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25"
                />
              </label>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-ink-300">
                  <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" aria-hidden />
                  Searching…
                </div>
              ) : error ? (
                <div className="px-4 py-8 text-center text-sm text-rose-200">{error}</div>
              ) : !searched ? (
                <div className="px-4 py-8 text-center text-sm text-ink-400">
                  Type at least one character to search the CareLink registry.
                </div>
              ) : rows && rows.length > 0 ? (
                <ul className="space-y-1">
                  {rows.map((row, i) => (
                    <li key={`${row.kind}-${row.id}-${i}`}>
                      <button
                        type="button"
                        onClick={() => goTo(row)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">{row.title || 'Untitled'}</span>
                          <span className="block truncate text-xs text-ink-400">{row.subtitle}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={cn('rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em]', row.status === 'active' || row.status === 'published' || row.status === 'verified' ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100' : row.status === 'suspended' || row.status === 'cancelled' || row.status === 'rejected' ? 'border-rose-400/25 bg-rose-500/12 text-rose-200' : 'border-white/10 bg-white/10 text-ink-300')}>
                            {row.status}
                          </span>
                          <span className="text-[0.62rem] uppercase tracking-[0.14em] text-ink-500">{KIND_LABEL[row.kind] ?? row.kind}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-ink-400">No results for “{query}”.</div>
              )}
            </div>

            {hasMore ? (
              <div className="border-t border-white/10 p-2 text-center">
                <Button variant="ghost" size="sm" loading={loading} onClick={() => { setPage((p) => p + 1); void run(query.trim(), page + 1, true); }}>
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
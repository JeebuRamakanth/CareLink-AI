import { cn } from '../common/cn';

export type DataStatusLabel = 'REAL' | 'MOCK' | 'FALLBACK' | 'UNAVAILABLE' | 'PENDING_VERIFICATION';

const STATUS_META: Record<DataStatusLabel, { label: string; className: string }> = {
  REAL: { label: 'Live', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
  MOCK: { label: 'Demo data', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  FALLBACK: { label: 'Limited data', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  UNAVAILABLE: { label: 'Source unavailable', className: 'border-rose-400/30 bg-rose-400/10 text-rose-200' },
  PENDING_VERIFICATION: { label: 'Pending verification', className: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
};

interface DataStatusBadgeProps {
  status?: DataStatusLabel | string | null;
  className?: string;
}

/**
 * Honest data-quality badge. NEVER replaces mock/fallback data with a "Live"
 * label; it renders the actual database/record status when known so the user can
 * tell real vs demo vs unavailable at a glance.

 * Maps the DB `data_status` values (REAL/MOCK/FALLBACK/UNAVAILABLE/
 * PENDING_VERIFICATION). Unknown/missing statuses fall back to a neutral
 * "Source unknown" chip rather than claiming verification.

 */
export function DataStatusBadge({ status, className }: DataStatusBadgeProps) {
  if (!status) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium', 'border-white/10 bg-white/5 text-ink-300', className)}>
        Source unknown
      </span>
    );
  }

  const meta = STATUS_META[status as DataStatusLabel] ?? { label: status.replace(/_/g, ' '), className: 'border-white/10 bg-white/5 text-ink-300' };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium', meta.className, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {meta.label}
    </span>
  );
}
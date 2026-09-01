/**
 * CareLink-AI — shared small admin UI atoms (status pill, loading, empty,
 * error banner, table wrapper). Kept deliberately thin so every module renders
 * the same honest loading/empty/error vocabulary.
 */

import type { ReactNode } from 'react';
import { cn } from '../../components/common/cn';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function AdminLoading() {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-white/10 bg-white/5">
      <span className="size-7 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
    </div>
  );
}

export function AdminEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 text-center">
      <span className="text-2xl" aria-hidden>◌</span>
      <p className="text-sm text-ink-400">{message}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-rose-400/25 bg-rose-500/10 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/15 text-lg text-rose-200">!</span>
        <p className="text-sm text-rose-100">{message}</p>
        {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
      </div>
    </Card>
  );
}

export function AdminNotConfigured({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full border border-amber-400/25 bg-amber-500/15 text-lg text-amber-200">ℹ</span>
        <p className="text-sm text-ink-300">
          The Supabase backend is not configured in this environment, so real admin data is not
          available. This view only renders server-authorized data when a backend is wired in.
        </p>
        {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Check again</Button> : null}
      </div>
    </Card>
  );
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
      <table className="w-full min-w-0 border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {headers.map((h) => (
              <th key={h} className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

const pillTone = (status?: string | null): string => {
  const s = (status ?? '').toLowerCase();
  if (['active','verified','published','sent','confirmed','upcoming','complete','completed'].includes(s)) return 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100';
  if (['suspended','disabled','hidden','removed','cancelled','failed','rejected','expired'].includes(s)) return 'border-rose-400/25 bg-rose-500/15 text-rose-200';
  if (['pending','scheduled','requested'].includes(s)) return 'border-amber-400/25 bg-amber-500/15 text-amber-100';
  return 'border-white/10 bg-white/10 text-ink-200';
};

export function AdminStatusPill({ status }: { status?: string | null }) {
  const s = status ?? 'unknown';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]', pillTone(s))}>
      {s}
    </span>
  );
}

export function AdminMuted({ children }: { children: ReactNode }) {
  return <span className="text-ink-400">{children}</span>;
}

export function AdminDate({ value }: { value?: string | null }) {
  if (!value) return <AdminMuted>—</AdminMuted>;
  try {
    return <span className="text-ink-300">{new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>;
  } catch {
    return <AdminMuted>—</AdminMuted>;
  }
}

export function AdminModuleHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-ink-400">{description}</p>
    </div>
  );
}
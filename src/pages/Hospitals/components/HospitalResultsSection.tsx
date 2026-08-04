import type { ReactNode } from 'react';
import type { Hospital } from '../../../types';
import { Section } from '../../../components/ui/Section';
import { EmptyState } from './EmptyState';
import { HospitalCard } from './HospitalCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Pagination } from './Pagination';

type ResultsViewState = 'loading' | 'empty' | 'error' | 'success';

type HospitalResultsSectionProps = {
  state?: ResultsViewState;
  title?: string;
  description?: string;
  eyebrow?: string;
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  resultCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  paginationEnabled?: boolean;
  infiniteScrollEnabled?: boolean;
  className?: string;
  children?: ReactNode;
  hospitals?: Hospital[];
};

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Section title={title} description={message} eyebrow="State">
      <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-8 text-sm text-rose-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">Unable to load results</p>
            <p className="mt-1 text-rose-100/90">Please try again or adjust your filters.</p>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-rose-300/30 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

export function HospitalResultsSection({
  state = 'success',
  title = 'Results',
  description = 'Hospital search results will appear here once the experience is connected to live data.',
  eyebrow = 'Results',
  errorTitle = 'Error',
  errorMessage = 'Something went wrong while loading the results.',
  onRetry,
  resultCount = 0,
  emptyTitle = 'No hospitals found',
  emptyDescription = 'Try broadening your filters or adjusting your search phrase to discover more options.',
  paginationEnabled = true,
  infiniteScrollEnabled = true,
  className = '',
  children,
  hospitals = [],
}: HospitalResultsSectionProps) {
  if (state === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state === 'empty') {
    return (
      <div className="space-y-4">
        <EmptyState />
        <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300">
          <p className="font-semibold text-white">{emptyTitle}</p>
          <p className="mt-1 text-ink-400">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return <ErrorState title={errorTitle} message={errorMessage} onRetry={onRetry} />;
  }

  return (
    <Section title={title} description={description} eyebrow={eyebrow} className={className}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-300">
          <div>
            <p className="font-semibold text-white">{resultCount} results available</p>
            <p className="mt-1 text-ink-400">Hospitals are rendered from the new data foundation and ready for future expansion.</p>
          </div>
          <div className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-100">
            Data driven
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)]">
          <div className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-3 sm:p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Results grid</p>
                <p className="mt-1 text-sm text-ink-300">The current experience now renders hospital cards from structured product data.</p>
              </div>
            </div>

            {children ? (
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">{children}</div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {hospitals.map((hospital) => (
                  <HospitalCard
                    key={hospital.id}
                    hospital={hospital}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {paginationEnabled ? (
          <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <Pagination />
          </div>
        ) : null}

        {infiniteScrollEnabled ? (
          <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-ink-400">
            <p className="font-semibold text-white">Infinite scroll area</p>
            <p className="mt-1">This reserved section will support progressive loading when real results are connected.</p>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

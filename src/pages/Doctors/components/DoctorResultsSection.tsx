import type { ReactNode } from 'react';
import type { Doctor } from '../../../types';
import { Section } from '../../../components/ui/Section';
import { DoctorCard } from './DoctorCard';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Pagination } from './Pagination';

type ResultsViewState = 'loading' | 'empty' | 'error' | 'success';

type DoctorResultsSectionProps = {
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
  doctors?: Doctor[];
  children?: ReactNode;
};

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Section title={title} description={message} eyebrow="State">
      <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-8 text-sm text-rose-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">Unable to load doctors</p>
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

export function DoctorResultsSection({
  state = 'success',
  title = 'Results',
  description = 'Doctors results infrastructure placeholder.',
  eyebrow = 'Doctors',
  errorTitle = 'Error',
  errorMessage = 'Something went wrong while loading the results.',
  onRetry,
  resultCount = 0,
  emptyTitle = 'No doctors found',
  emptyDescription = 'Try broadening your filters or adjusting your search phrase to discover more options.',
  doctors = [],
  children,
}: DoctorResultsSectionProps) {
  if (state === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state === 'empty') {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  if (state === 'error') {
    return <ErrorState title={errorTitle} message={errorMessage} onRetry={onRetry} />;
  }

  return (
    <Section title={title} description={description} eyebrow={eyebrow}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-300">
          <div>
            <p className="font-semibold text-white">{resultCount} results available</p>
            <p className="mt-1 text-ink-400">Doctors are now rendered from the structured CareLink.AI data foundation.</p>
          </div>
          <div className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-100">
            Data driven
          </div>
        </div>
        {children ? (
          <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">{children}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {doctors.map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} />
            ))}
          </div>
        )}
        <Pagination />
      </div>
    </Section>
  );
}

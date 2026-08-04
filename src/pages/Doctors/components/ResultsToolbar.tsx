import { Section } from '../../../components/ui/Section';

type ResultsToolbarProps = {
  resultCount?: number;
  summary?: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
};

export function ResultsToolbar({ resultCount = 0, summary = 'Showing available doctors', activeFilters = [], onClearFilters }: ResultsToolbarProps) {
  return (
    <Section>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300">
        <div>
          <p className="font-semibold text-white">{resultCount} doctors available</p>
          <p className="mt-1 text-ink-400">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.length > 0 ? (
            activeFilters.map((label) => (
              <span key={label} className="rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-100">
                {label}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-300">
              All specialists
            </span>
          )}
          {onClearFilters ? (
            <button type="button" onClick={onClearFilters} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-ink-200 transition hover:bg-white/10 hover:text-white">
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

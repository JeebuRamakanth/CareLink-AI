import type { ReactNode } from 'react';

type ResultsToolbarProps = {
  resultCount?: number;
  summary?: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
  sortValue?: string;
  onSortChange?: (value: string) => void;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  lastUpdated?: string;
  className?: string;
};

type ToolbarActionButtonProps = {
  label: string;
  onClick?: () => void;
  active?: boolean;
  icon?: ReactNode;
};

function ToolbarActionButton({ label, onClick, active = false, icon }: ToolbarActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition duration-200 ${
        active
          ? 'border-brand-400/35 bg-brand-400/12 text-brand-100'
          : 'border-white/10 bg-white/5 text-ink-200 hover:border-white/20 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon ? <span className="text-base">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

export function ResultsToolbar({
  resultCount = 0,
  summary = 'No active search applied',
  activeFilters = [],
  onClearFilters,
  sortValue = 'Recommended',
  onSortChange,
  viewMode = 'grid',
  onViewModeChange,
  lastUpdated = 'Just now',
  className = '',
}: ResultsToolbarProps) {
  return (
    <div className={`rounded-[1.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_12px_45px_rgba(0,0,0,0.16)] sm:p-5 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
              Results toolbar
            </span>
            <span className="text-sm text-ink-400">{resultCount} results</span>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-white">{summary}</p>
            <p className="text-sm text-ink-400">Last updated {lastUpdated}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarActionButton label="Refresh" icon="↻" />
          <ToolbarActionButton label="Grid" icon="▦" active={viewMode === 'grid'} onClick={() => onViewModeChange?.('grid')} />
          <ToolbarActionButton label="List" icon="☰" active={viewMode === 'list'} onClick={() => onViewModeChange?.('list')} />
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink-200">
            <span className="text-ink-400">Sort</span>
            <select
              value={sortValue}
              onChange={(event) => onSortChange?.(event.target.value)}
              className="bg-transparent text-sm font-medium text-white outline-none"
            >
              <option value="Recommended" className="bg-slate-900">Recommended</option>
              <option value="Highest Rated" className="bg-slate-900">Highest Rated</option>
              <option value="Nearest" className="bg-slate-900">Nearest</option>
              <option value="24x7 Access" className="bg-slate-900">24x7 Access</option>
            </select>
          </label>
          {activeFilters.length > 0 ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-ink-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {activeFilters.map((filter) => (
            <span key={filter} className="rounded-full border border-brand-400/20 bg-brand-400/10 px-2.75 py-1.5 text-sm text-brand-100">
              {filter}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

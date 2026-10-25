/**
 * CareLink-AI — Reviews page heading + primary search (Step 28).
 *
 * A compact, centered heading and ONE full-width search field. Suggestions are
 * drawn from the sourced provider directory (see reviewSearchSuggestions.ts), so
 * picking one always leads to a real facility/doctor — there is no fake "live
 * suggestions" service and no invented rating in the list.
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchSuggestions } from '../data/reviewSearchSuggestions';
import { SearchSuggestions } from './SearchSuggestions';

type ReviewsSearchHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
};

export function ReviewsSearchHeader({ query, onQueryChange, onClear }: ReviewsSearchHeaderProps) {
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => matchSuggestions(query), [query]);
  const panelOpen = focused && suggestions.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && panelOpen && suggestions[activeIndex]) {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      onQueryChange(chosen.label);
      setFocused(false);
    } else if (event.key === 'Escape') {
      inputRef.current?.blur();
      setFocused(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl text-center">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-brand-200">Patient reviews</p>
      <h1 className="mx-auto mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Reviews from real appointments
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-ink-300 sm:text-base">
        Search published patient reviews of hospitals, doctors, pharmacies and laboratories. Reviews appear only after a
        completed appointment, and every entry keeps its verification status.
      </p>

      <div className="relative mt-8 text-left">
        <label className="relative flex items-center gap-3 rounded-full border border-white/12 bg-slate-950/70 px-5 py-3.5 shadow-[0_20px_60px_-40px_rgba(77,132,255,0.9)] focus-within:border-brand-400/40 focus-within:ring-2 focus-within:ring-brand-400/25">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0 text-ink-300">
            <path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2l4.9 4.9a1 1 0 0 1-1.4 1.4l-4.9-4.9A7.44 7.44 0 0 1 10.5 18Z" fill="currentColor" />
          </svg>
          <input
            ref={inputRef}
            id="review-search-input"
            type="search"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActiveIndex(0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder="Search by hospital, doctor, pharmacy or laboratory"
            aria-label="Search reviews by hospital, doctor, pharmacy or laboratory"
            aria-autocomplete="list"
            aria-expanded={panelOpen}
            aria-controls="review-search-suggestions"
            autoComplete="off"
            className="w-full bg-transparent text-base text-white outline-none placeholder:text-ink-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5 text-ink-300 transition hover:border-brand-400/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
            >
              <svg viewBox="0 0 20 20" aria-hidden className="size-4">
                <path d="M11.4 10l3.3-3.3a1 1 0 0 0-1.4-1.4L10 8.6 6.7 5.3A1 1 0 0 0 5.3 6.7L8.6 10l-3.3 3.3a1 1 0 0 0 1.4 1.4L10 11.4l3.3 3.3a1 1 0 0 0 1.4-1.4L11.4 10Z" fill="currentColor" />
              </svg>
            </button>
          ) : null}
        </label>

        <SearchSuggestions
          suggestions={suggestions}
          isOpen={panelOpen}
          activeIndex={activeIndex}
          onHighlight={setActiveIndex}
          onSelect={(s) => {
            if (s.to && s.label.toLowerCase() === query.trim().toLowerCase()) {
              navigate(s.to);
              return;
            }
            onQueryChange(s.label);
            setFocused(false);
          }}
        />
      </div>
    </section>
  );
}

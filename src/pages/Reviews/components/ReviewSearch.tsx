import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { SearchSuggestionItem } from '../data/reviewDiscoveryData';
import { SearchSuggestions } from './SearchSuggestions';

const searchVariants = {
  rest: { boxShadow: '0px 0px 0px rgba(59,130,246,0)' },
  focus: { boxShadow: '0 0 0 0.75rem rgba(59,130,246,0.15)' },
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-ink-300">
    <path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2l4.9 4.9a1 1 0 0 1-1.4 1.4l-4.9-4.9A7.44 7.44 0 0 1 10.5 18Z" fill="currentColor" />
  </svg>
);

const ClearIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
    <path d="M11.4 10l3.3-3.3a1 1 0 0 0-1.4-1.4L10 8.6 6.7 5.3A1 1 0 0 0 5.3 6.7L8.6 10l-3.3 3.3a1 1 0 0 0 1.4 1.4L10 11.4l3.3 3.3a1 1 0 0 0 1.4-1.4L11.4 10Z" fill="currentColor" />
  </svg>
);

type ReviewSearchProps = {
  query: string;
  suggestions: SearchSuggestionItem[];
  isLoading: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onSuggestionSelect: (value: string) => void;
};

export function ReviewSearch({ query, suggestions, isLoading, onChange, onClear, onSuggestionSelect }: ReviewSearchProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasQuery = query.trim().length > 0;
  const normalisedQuery = query.trim().toLowerCase();
  const displaySuggestions = useMemo(
    () =>
      suggestions.filter((suggestion) =>
        suggestion.title.toLowerCase().includes(normalisedQuery) || suggestion.subtitle.toLowerCase().includes(normalisedQuery)
      ),
    [normalisedQuery, suggestions]
  );

  const isPanelOpen = isFocused || hasQuery;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!displaySuggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, displaySuggestions.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = displaySuggestions[activeIndex];
      if (selected) {
        onSuggestionSelect(selected.title);
      }
    }

    if (event.key === 'Escape') {
      inputRef.current?.blur();
      setIsFocused(false);
    }
  };

  return (
    <div className="relative space-y-4">
      <motion.div
        initial="rest"
        animate={hasQuery || isFocused ? 'focus' : 'rest'}
        variants={searchVariants}
        transition={{ type: 'spring', stiffness: 220, damping: 24, duration: shouldReduceMotion ? 0 : 0.4 }}
        className="relative rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-0.5"
      >
        <label className="relative flex items-center gap-3 rounded-[1.5rem] bg-slate-950/95 px-4 py-4 text-sm text-ink-200 focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/30">
          <span className="pointer-events-none"><SearchIcon /></span>
          <input
            ref={inputRef}
            className="w-full bg-transparent text-base leading-6 text-white placeholder:text-ink-400 outline-none"
            placeholder="Search hospitals, doctors, specialties or diseases..."
            aria-label="Search hospitals, doctors, specialties or diseases"
            value={query}
            onChange={(event) => {
              onChange(event.target.value);
              setActiveIndex(0);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 120)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={isPanelOpen}
            aria-controls="review-search-suggestions"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onClear();
                inputRef.current?.focus();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-ink-300 transition hover:border-brand-400/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </label>

        <SearchSuggestions
          suggestions={displaySuggestions.slice(0, 6)}
          isOpen={isPanelOpen}
          activeIndex={activeIndex}
          onHighlight={setActiveIndex}
          onSelect={(suggestion) => {
            onSuggestionSelect(suggestion.title);
            setIsFocused(false);
          }}
        />
      </motion.div>

      <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300 sm:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Search insight</p>
          <p className="mt-2 text-base leading-7 text-ink-300">Start typing to explore trusted reviews across providers, specialties, and care pathways.</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Live suggestions</p>
          <p className="mt-3 text-sm leading-6 text-ink-300">Search suggestions include hospitals, doctors, specialties, and conditions.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
            <span className="rounded-full bg-white/5 px-2 py-1">{isLoading ? 'Preparing reviews...' : 'Search ready'}</span>
            <span>{hasQuery ? 'Filtered by your query.' : 'Browse curated review categories.'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

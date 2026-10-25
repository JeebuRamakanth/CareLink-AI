/**
 * CareLink-AI — Reviews search suggestions (Step 28).
 *
 * Suggestions come from the sourced provider directory, so each row is a real
 * facility or listed doctor. No rating, review count or "verified" badge is
 * shown — a directory listing is not a review.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReviewSearchSuggestion } from '../data/reviewSearchSuggestions';

type SearchSuggestionsProps = {
  suggestions: ReviewSearchSuggestion[];
  isOpen: boolean;
  activeIndex: number;
  onSelect: (suggestion: ReviewSearchSuggestion) => void;
  onHighlight: (index: number) => void;
};

export function SearchSuggestions({ suggestions, isOpen, activeIndex, onSelect, onHighlight }: SearchSuggestionsProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && suggestions.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
          id="review-search-suggestions"
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/97 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="divide-y divide-white/5">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => onHighlight(index)}
                onFocus={() => onHighlight(index)}
                onClick={() => onSelect(suggestion)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                  index === activeIndex ? 'bg-brand-400/10 text-white' : 'text-ink-200 hover:bg-white/5'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{suggestion.label}</span>
                  {suggestion.meta ? <span className="mt-0.5 block truncate text-xs text-ink-400">{suggestion.meta}</span> : null}
                </span>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-[0.14em] text-ink-300">
                  {suggestion.kind === 'hospital' ? 'Hospital' : 'Doctor'}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

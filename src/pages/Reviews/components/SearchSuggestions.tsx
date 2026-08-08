import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SearchSuggestionItem } from '../data/reviewDiscoveryData';

type SearchSuggestionsProps = {
  suggestions: SearchSuggestionItem[];
  isOpen: boolean;
  activeIndex: number;
  onSelect: (suggestion: SearchSuggestionItem) => void;
  onHighlight: (index: number) => void;
};

const suggestionVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0 },
};

export function SearchSuggestions({ suggestions, isOpen, activeIndex, onSelect, onHighlight }: SearchSuggestionsProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && suggestions.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={suggestionVariants}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/95 shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
          role="listbox"
          aria-label="Search suggestions"
        >
          <div className="divide-y divide-white/5">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                onMouseEnter={() => onHighlight(index)}
                onFocus={() => onHighlight(index)}
                onClick={() => onSelect(suggestion)}
                className={`w-full px-4 py-3 text-left transition ${
                  index === activeIndex ? 'bg-brand-400/10 text-white' : 'bg-slate-950/95 text-ink-200 hover:bg-white/5'
                }`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{suggestion.title}</p>
                    <p className="mt-1 text-sm text-ink-400">{suggestion.subtitle}</p>
                  </div>
                  <div className="text-right text-sm text-ink-300">
                    <p>{suggestion.meta}</p>
                    {suggestion.rating ? <p className="mt-1 text-amber-300">★ {suggestion.rating}</p> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

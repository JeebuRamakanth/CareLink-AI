import type { ReactNode } from 'react';

type CardImageProps = {
  children?: ReactNode;
  className?: string;
  aspect?: string;
  placeholder?: boolean;
};

export function CardImage({ children, className = '', aspect = 'aspect-[16/10]', placeholder = false }: CardImageProps) {
  return (
    <div className={`overflow-hidden rounded-[1.1rem] border border-white/10 bg-slate-950/70 ${aspect} ${className}`}>
      {placeholder ? (
        <div className="flex h-full items-end justify-between bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.28),transparent_42%),linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] p-4">
          <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
            Placeholder
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

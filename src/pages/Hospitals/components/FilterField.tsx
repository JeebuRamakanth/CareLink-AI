import type { ReactNode } from 'react';

type FilterFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

export function FilterField({ label, hint, children }: FilterFieldProps) {
  return (
    <label className="group flex cursor-pointer flex-col gap-2 rounded-[1rem] border border-white/10 bg-slate-950/60 p-3.5 transition duration-200 hover:border-brand-400/25 hover:bg-slate-900/80 focus-within:border-brand-400/50 focus-within:bg-slate-900/90">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">{label}</span>
        {hint ? <span className="text-[0.7rem] text-ink-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

type FilterChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
};

export function FilterChip({ label, active, onClick, icon }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition duration-200 ${
        active
          ? 'border-brand-400/35 bg-brand-400/15 text-brand-100 shadow-[0_10px_30px_rgba(77,132,255,0.18)]'
          : 'border-white/10 bg-white/5 text-ink-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon ? <span className="text-base">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

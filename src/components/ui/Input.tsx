import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../common/cn";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, ...props },
  ref
) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
      {label ? <span className="text-sm font-medium text-ink-100">{label}</span> : null}
      <input
        ref={ref}
        className={cn(
          "w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white shadow-inner outline-none transition-all duration-200 placeholder:text-ink-400 focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25",
          error && "border-rose-400/60 focus:border-rose-400/80 focus:ring-rose-400/20",
          className
        )}
        {...props}
      />
      {hint && !error ? <span className="text-xs text-ink-400">{hint}</span> : null}
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
    </label>
  );
});

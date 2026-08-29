import { forwardRef, useId } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../common/cn";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label?: string;
  hint?: string;
  error?: string;
  /** Renderer slot absolutely positioned inside the right edge of the input. */
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, rightSlot, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
      {label ? <span className="text-sm font-medium text-ink-100">{label}</span> : null}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white shadow-inner outline-none transition-all duration-200 placeholder:text-ink-400 focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25",
            rightSlot ? "pr-12" : "",
            error ? "border-rose-400/60 focus:border-rose-400/80 focus:ring-rose-400/20" : "",
            className
          )}
          aria-describedby={describedBy || undefined}
          {...props}
        />
        {rightSlot ? (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2">
            {rightSlot}
          </span>
        ) : null}
      </div>
      {hint && !error ? <span id={hintId} className="text-xs text-ink-400">{hint}</span> : null}
      {error ? <span id={errorId} className="text-xs text-rose-300">{error}</span> : null}
    </label>
  );
});

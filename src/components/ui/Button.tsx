import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../common/cn";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "glass";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
}

const buttonStyles = {
  base: "inline-flex items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-transparent font-semibold tracking-[0.02em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:cursor-not-allowed disabled:opacity-60",
  variants: {
    primary: "bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-[0_20px_50px_-24px_rgba(77,132,255,0.7)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-20px_rgba(77,132,255,0.75)]",
    secondary: "border-white/10 bg-white/10 text-ink-50 shadow-[var(--shadow-soft)] hover:border-brand-400/40 hover:bg-white/15",
    ghost: "bg-transparent text-ink-200 hover:bg-white/10 hover:text-white",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
    glass: "border border-white/15 bg-slate-950/40 text-white backdrop-blur-xl hover:bg-slate-950/60"
  },
  sizes: {
    sm: "px-3.5 py-2 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base"
  }
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, children, variant = "primary", size = "md", fullWidth = false, loading = false, disabled, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonStyles.base,
        buttonStyles.variants[variant],
        buttonStyles.sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
});

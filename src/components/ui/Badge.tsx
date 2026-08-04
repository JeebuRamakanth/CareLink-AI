import type { ReactNode } from "react";
import { cn } from "../common/cn";

interface BadgeProps {
  children: ReactNode;
  tone?: "brand" | "accent" | "neutral" | "success" | "warning";
  className?: string;
}

const toneStyles = {
  brand: "border-brand-400/20 bg-brand-500/15 text-brand-100",
  accent: "border-accent-400/20 bg-accent-500/15 text-accent-100",
  neutral: "border-white/10 bg-white/10 text-ink-200",
  success: "border-emerald-400/20 bg-emerald-500/15 text-emerald-100",
  warning: "border-amber-400/20 bg-amber-500/15 text-amber-100"
} as const;

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.24em] uppercase", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

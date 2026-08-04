import type { ReactNode } from "react";
import { cn } from "../common/cn";

interface SectionProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  eyebrow?: string;
}

export function Section({ children, className, title, description, eyebrow }: SectionProps) {
  return (
    <section className={cn("space-y-6", className)}>
      {(title || description || eyebrow) && (
        <div className="space-y-2">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.34em] text-brand-200">{eyebrow}</p> : null}
          {title ? <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2> : null}
          {description ? <p className="max-w-2xl text-sm text-ink-300">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

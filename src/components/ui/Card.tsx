import type { ReactNode } from "react";
import { cn } from "../common/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  elevated?: boolean;
}

const paddingMap = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8"
} as const;

export function Card({ children, className, padding = "md", elevated = true }: CardProps) {
  return (
    <section
      className={cn(
        "surface-panel",
        paddingMap[padding],
        elevated && "shadow-[var(--shadow-soft)]",
        className
      )}
    >
      {children}
    </section>
  );
}

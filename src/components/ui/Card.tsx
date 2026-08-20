import type { ReactNode } from "react";
import { cn } from "../common/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  elevated?: boolean;
  id?: string;
}

const paddingMap = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8"
} as const;

export function Card({ children, className, padding = "md", elevated = true, id }: CardProps) {
  return (
    <section
      id={id}
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

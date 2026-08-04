import type { ElementType, ReactNode } from "react";
import { cn } from "../common/cn";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function Container({ children, className, as: Component = "div" }: ContainerProps) {
  return (
    <Component className={cn("container-shell py-8 sm:py-10 lg:py-14", className)}>
      {children}
    </Component>
  );
}

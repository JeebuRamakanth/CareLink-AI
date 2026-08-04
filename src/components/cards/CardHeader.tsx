import type { ElementType, ReactNode } from 'react';

type CardHeaderProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function CardHeader({ children, className = '', as: Component = 'div' }: CardHeaderProps) {
  return <Component className={`mb-3 flex items-start justify-between gap-3 ${className}`}>{children}</Component>;
}

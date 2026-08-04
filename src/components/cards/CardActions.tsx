import type { ReactNode } from 'react';

type CardActionsProps = {
  children: ReactNode;
  className?: string;
};

export function CardActions({ children, className = '' }: CardActionsProps) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
}

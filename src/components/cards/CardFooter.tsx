import type { ElementType, ReactNode } from 'react';

type CardFooterProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function CardFooter({ children, className = '', as: Component = 'div' }: CardFooterProps) {
  return <Component className={`mt-4 flex flex-wrap items-center gap-2 ${className}`}>{children}</Component>;
}

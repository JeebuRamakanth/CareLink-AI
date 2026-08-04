import type { ElementType, ReactNode } from 'react';
import { cn } from '../common/cn';

interface LayoutContainerProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function LayoutContainer({ children, className, as: Component = 'div' }: LayoutContainerProps) {
  return (
    <Component className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </Component>
  );
}

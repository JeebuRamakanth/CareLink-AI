import type { ElementType, ReactNode } from 'react';

type CardBodyProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function CardBody({ children, className = '', as: Component = 'div' }: CardBodyProps) {
  return <Component className={`space-y-3 ${className}`}>{children}</Component>;
}

import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  keyName?: string;
}

export function PageTransition({ children, keyName = 'page' }: PageTransitionProps) {
  return (
    <div key={keyName} className="min-h-screen animate-fade-in">
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

export interface AppRoute {
  path: string;
  label: string;
  element: ReactNode;
}

export const appRoutes: AppRoute[] = [];

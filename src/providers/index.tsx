import type { ReactNode } from 'react';
import { AppointmentProvider } from '../contexts/AppointmentContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return <AppointmentProvider>{children}</AppointmentProvider>;
}

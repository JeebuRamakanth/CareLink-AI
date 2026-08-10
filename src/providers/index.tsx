import type { ReactNode } from 'react';
import { AppointmentProvider } from '../contexts/AppointmentContext';
import { AgentProvider } from '../contexts/AgentContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AppointmentProvider>
      <AgentProvider>{children}</AgentProvider>
    </AppointmentProvider>
  );
}

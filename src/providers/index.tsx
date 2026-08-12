import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { AppointmentProvider } from '../contexts/AppointmentContext';
import { AgentProvider } from '../contexts/AgentContext';
import { NavigationProvider } from '../contexts/NavigationContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <AppointmentProvider>
        <NavigationProvider>
          <AgentProvider>{children}</AgentProvider>
        </NavigationProvider>
      </AppointmentProvider>
    </AuthProvider>
  );
}

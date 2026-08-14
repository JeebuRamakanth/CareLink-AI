import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { AppointmentProvider } from '../contexts/AppointmentContext';
import { AgentProvider } from '../contexts/AgentContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { LocationProvider } from '../contexts/LocationContext';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <AppointmentProvider>
        <LocationProvider>
          <NavigationProvider>
            <AgentProvider>{children}</AgentProvider>
          </NavigationProvider>
        </LocationProvider>
      </AppointmentProvider>
    </AuthProvider>
  );
}

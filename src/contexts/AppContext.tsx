import { createContext, useContext, useMemo, useState } from 'react';
import type { AppThemeMode, AppUser } from '../types';

interface AppContextValue {
  theme: AppThemeMode;
  user: AppUser | null;
  setTheme: (theme: AppThemeMode) => void;
  setUser: (user: AppUser | null) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppThemeMode>('dark');
  const [user, setUser] = useState<AppUser | null>(null);

  const value = useMemo(() => ({ theme, user, setTheme, setUser }), [theme, user]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}

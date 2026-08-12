/**
 * NavigationContext (Step 9 §7).
 *
 * Propagates structured agent context across navigation steps so pages like
 * Hospital details / Doctor search can show results relevant to the user's
 * original query instead of blindly showing every item.
 *
 * Example flow this enables:
 *   User: "I have severe fever and headache."
 *   Agent: detects symptoms + specialty (Internal Medicine).
 *   User selects Hospital.
 *   Hospital page: reads context, pre-selects the matching specialty / shows
 *   related doctors instead of every doctor.
 *
 * It does NOT replace AgentContext — it is a lightweight, navigation-scoped
 * context channel that the agent's CTA actions seed before navigating.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentNavigationContext } from '../features/health-agent/types';

export interface NavigationContextValue {
  context: AgentNavigationContext;
  setContext: (next: Partial<AgentNavigationContext>) => void;
  clearContext: () => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<AgentNavigationContext>({});

  const setContext = useCallback((next: Partial<AgentNavigationContext>) => {
    setContextState((current) => ({ ...current, ...next }));
  }, []);

  const clearContext = useCallback(() => setContextState({}), []);

  const value = useMemo<NavigationContextValue>(() => ({ context, setContext, clearContext }), [context, setContext, clearContext]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigationContext() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigationContext must be used within a NavigationProvider');
  }
  return ctx;
}

/** Optional hook that returns the context (or empty) without throwing. */
export function useOptionalNavigationContext(): AgentNavigationContext {
  const ctx = useContext(NavigationContext);
  return ctx?.context ?? {};
}

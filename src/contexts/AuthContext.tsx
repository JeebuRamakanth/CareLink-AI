/**
 * CareLink-AI — AuthContext (Step 10).
 *
 * Authenticated user state with loading/error/session-restoration. Real
 * Supabase Auth when configured; deterministic local mock when not — so the
 * auth UX and protected routes are fully exercisable in development without
 * credentials.
 *
 * SECURITY: never stores passwords/tokens in React state. The user object holds
 * only an id, email, display name, and source. Listens to auth state changes
 * so sign-out (real or mock) reflects across the app.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  onAuthStateChange,
  restoreSession,
  signIn as signInService,
  signOut as signOutService,
  signUp as signUpService,
  requestPasswordReset,
} from '../services/auth';
import type { AuthError, CareLinkUser } from '../services/auth';

export interface AuthState {
  user: CareLinkUser | null;
  source: 'supabase' | 'mock' | 'none';
  initializing: boolean;
  error: AuthError | null;
  isMockMode: boolean;
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: AuthError }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: AuthError }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: AuthError }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CareLinkUser | null>(null);
  const [source, setSource] = useState<AuthState['source']>('none');
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);

  // Restore session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await restoreSession();
      if (cancelled) return;
      setUser(session.user);
      setSource(session.source);
      setIsMockMode(session.source === 'mock');
      setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to auth state changes (real + mock).
  useEffect(() => {
    const unsubscribe = onAuthStateChange((nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setSource(nextUser.source);
        setIsMockMode(nextUser.source === 'mock');
      } else {
        setSource('none');
        setIsMockMode(false);
      }
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { result, error: err } = await signInService(email, password);
    if (err) {
      setError(err);
      return { ok: false, error: err };
    }
    if (result) {
      setUser(result.user);
      setSource(result.user.source);
      setIsMockMode(result.user.source === 'mock');
    }
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    const { result, error: err } = await signUpService(email, password);
    if (err) {
      setError(err);
      return { ok: false, error: err };
    }
    if (result) {
      setUser(result.user);
      setSource(result.user.source);
      setIsMockMode(result.user.source === 'mock');
    }
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await signOutService();
    setUser(null);
    setSource('none');
    setIsMockMode(false);
    setError(null);
  }, []);

  const requestReset = useCallback(async (email: string) => {
    setError(null);
    const { error: err } = await requestPasswordReset(email);
    if (err) {
      setError(err);
      return { ok: false, error: err };
    }
    return { ok: true };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      source,
      initializing,
      error,
      isMockMode,
      signIn,
      signUp,
      signOut,
      requestPasswordReset: requestReset,
      clearError,
    }),
    [user, source, initializing, error, isMockMode, signIn, signUp, signOut, requestReset, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/** Optional hook that returns the auth state without throwing. */
export function useOptionalAuth(): AuthState {
  const ctx = useContext(AuthContext);
  return ctx ?? { user: null, source: 'none', initializing: true, error: null, isMockMode: false };
}

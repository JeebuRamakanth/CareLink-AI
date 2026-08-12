/**
 * CareLink-AI — ProtectedRoute (Step 10).
 *
 * Guards routes that require an authenticated user. Shows a premium loading
 * state while session restoration is in flight, and redirects to the login page
 * (preserving the intended destination) when unauthenticated. Public browsing
 * of hospitals/doctors/reviews remains available outside protected routes.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../routes/routeConstants';
import { Card } from './ui/Card';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 py-20">
        <Card className="w-full text-center">
          <div className="flex flex-col items-center gap-4">
            <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
            <p className="text-sm text-ink-300">Restoring your secure session…</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

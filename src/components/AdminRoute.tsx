/**
 * CareLink-AI — AdminRoute guard.
 *
 * Admin-area availability is decided by the SERVER-side role resolved from the
 * database (carelink_current_user_roles) and loaded into the authenticated user.
 * Merely knowing the URL, selecting an admin login lane, or having a local demo
 * account never grants admin access.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../routes/routeConstants';
import { hasAdminRole, recordAdminAccessDenied } from '../services/auth/authorization';
import { Card } from './ui/Card';

interface AdminRouteProps {
  children: ReactNode;
  /** Require super_admin specifically (default: admin or super_admin). */
  superAdminOnly?: boolean;
}

export function AdminRoute({ children, superAdminOnly = false }: AdminRouteProps) {
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
    return <Navigate to={`${ROUTES.login}?intent=admin`} replace state={{ from: location.pathname }} />;
  }

  const roleOk = superAdminOnly
    ? Array.isArray(user.roles) && user.roles.includes('super_admin')
    : hasAdminRole(user);

  if (!roleOk) {
    // Persist the denied admin-area attempt server-side so auditors can see it.
    void recordAdminAccessDenied({
      path: location.pathname,
      requested: superAdminOnly ? 'super_admin' : 'admin',
    });
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 py-20">
        <Card className="w-full space-y-4 text-center">
          <p className="text-lg font-semibold text-ink-100">Administrative access denied</p>
          <p className="text-sm text-ink-300">
            Your current account is not authorized{superAdminOnly ? ' as Super Admin' : ' for the admin area'} on this server.
          </p>
          <a href={ROUTES.home} className="inline-block text-sm text-brand-300 hover:text-brand-200">
            Return to CareLink
          </a>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
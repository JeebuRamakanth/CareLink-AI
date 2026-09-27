/**
 * CareLink-AI — Login page (Step 10).
 *
 * Premium auth surface consistent with the CareLink design system. Supports
 * real Supabase Auth and the local mock fallback. Shows safe error states and a
 * "forgot password" foundation. Redirects authenticated users away.
 *
 * Public browsing is preserved: this page is reachable by everyone, but
 * protected routes redirect here when unauthenticated.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import { preventDefaultSubmit } from './authFormUtils';
import { isSupabaseConfigured } from '../../services/supabase/client';
import { hasAdminRole, isSuperAdmin, isSuspended, recordDeniedAdminAccess } from '../../services/auth/authorization';
import { cn } from '../../components/common/cn';

/** Login lanes are INTENT ONLY — never authorization. The server verifies the
 *  authenticated user's database roles; selecting a lane grants nothing. */
type LoginLane = 'patient' | 'admin' | 'super_admin';

const LANES: { id: LoginLane; label: string; hint: string }[] = [
  { id: 'patient', label: 'Patient', hint: 'Personal health' },
  { id: 'admin', label: 'Admin', hint: 'Operations' },
  { id: 'super_admin', label: 'Super Admin', hint: 'Restricted' },
];

interface LocationState {
  from?: string;
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {visible ? (
        <>
          <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M4 4l16 16" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M9.5 9.5a3 3 0 0 0 5 5" />
        </>
      )}
    </svg>
  );
}

export function LoginPage() {
  const { signIn, user, initializing, error, isMockMode, clearError, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const demoMode = isMockMode || !isSupabaseConfigured();
  const adminIntent = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const v = params.get('intent');
    if (v === 'super-admin' || v === 'super_admin') return 'super-admin';
    return v === 'admin' ? 'admin' : null;
  }, [location.search]);

  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [lane, setLane] = useState<LoginLane>(() =>
    adminIntent === 'super-admin' ? 'super_admin' : adminIntent === 'admin' ? 'admin' : 'patient'
  );
  const [laneDenied, setLaneDenied] = useState(false);

  // The URL may carry the intended admin lane; the UI just preselects it.
  const from = (location.state as LocationState | null)?.from ?? (adminIntent ? ROUTES.admin : ROUTES.profile);

  useEffect(() => {
    if (laneDenied) return; // A lane denial keeps the user on this page.
    if (!initializing && user) {
      // Suspended/disabled accounts never proceed into an administrative lane.
      if (isSuspended(user) && lane !== 'patient') {
        void recordDeniedAdminAccess(lane === 'super_admin' ? 'super_admin' : 'admin', { path: location.pathname, reason: 'suspended' });
        setLaneDenied(true);
        return;
      }
      if (lane === 'admin' && !hasAdminRole(user)) {
        // An authenticated account without an admin role: record the denial and
        // keep the user on the login page with an honest message —— selecting
        // the lane is never authorization.
        void recordDeniedAdminAccess('admin', { path: location.pathname });
        setLaneDenied(true);
        return;
      }
      if (lane === 'super_admin' && !isSuperAdmin(user)) {
        void recordDeniedAdminAccess('super_admin', { path: location.pathname });
        setLaneDenied(true);
        return;
      }
      // Destination is lane-driven for admin lanes (both land on /admin; the
      // console itself is server-gated by role). Patient lane honours `from`.
      const destination = lane === 'admin' || lane === 'super_admin' ? ROUTES.admin : from;
      navigate(destination, { replace: true });
    }
  }, [user, initializing, lane, from, navigate, location.pathname, laneDenied]);

  const onSubmit = preventDefaultSubmit(async () => {
    if (submitting) return;
    clearError();
    setLaneDenied(false);
    setSubmitting(true);
    // Role verification happens server-side (loadUserAuthorization) inside
    // signIn; the SELECTED lane determines the destination (Admin → /admin,
    // Super Admin → /admin, Patient → intended/from). Authorization (never the
    // lane) decides whether access is permitted. A denied administrative-lane
    // attempt is recorded lane-aware (admin_login_denied / super_admin_login_denied)
    // and keeps the user here — wrong credentials already fail auth.
    const result = await signIn(email, password, lane);
    setSubmitting(false);
    if (!result.ok) return;
    if (result.laneDenied) {
      setLaneDenied(true);
      return;
    }
    // Destination is lane-driven for admin lanes; the gate routes still enforce.
    const destination = lane === 'admin' || lane === 'super_admin' ? ROUTES.admin : from;
    navigate(destination, { replace: true });
  });

  const openForgot = () => {
    setShowForgot((v) => !v);
    setForgotSent(false);
    setResetEmail(email);
  };

  const onForgot = async () => {
    if (forgotSubmitting) return;
    clearError();
    setForgotSubmitting(true);
    const result = await requestPasswordReset(resetEmail);
    setForgotSubmitting(false);
    if (result.ok) setForgotSent(true);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <div className="relative mx-auto mb-5 flex size-14 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400/40 to-accent-400/30 blur-md" aria-hidden />
          <span className="relative flex size-12 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-base font-semibold text-white shadow-[var(--shadow-glow)]">
            C
          </span>
        </div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-brand-200">CareLink.AI</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-ink-300">Sign in to your CareLink account to continue.</p>
      </div>

      <Card className="w-full">
        {demoMode ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200"
          >
            <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-hidden />
            <span>
              <span className="font-semibold text-amber-100">Demo mode:</span>{' '}
              no backend configured — accounts and sessions are stored locally in this browser for evaluation only.
            </span>
          </div>
        ) : null}

        {/* Three login lanes — INTENT ONLY, never authorization. */}
        <div className="mb-5" role="group" aria-label="Login type">
          <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-lg)] border border-white/10 bg-white/5 p-1">
            {LANES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLane(l.id);
                  setLaneDenied(false);
                  clearError();
                }}
                aria-pressed={lane === l.id}
                className={cn(
                  'rounded-[calc(var(--radius-lg)-4px)] px-2 py-2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
                  lane === l.id
                    ? 'bg-gradient-to-br from-brand-500/30 to-accent-500/15 text-white shadow-[var(--shadow-glow)]'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <span className="block text-[0.82rem] font-semibold">{l.label}</span>
                <span className="block text-[0.62rem] uppercase tracking-[0.14em] text-ink-400">{l.hint}</span>
              </button>
            ))}
          </div>

          {lane === 'admin' ? (
            <div
              role="note"
              className="mt-3 flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200"
            >
              <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-hidden />
              <span>
                <span className="font-semibold text-amber-100">Admin access warning:</span>{' '}
                you are attempting to sign in to the administrative console. Access is granted only to accounts whose
                database roles authorize it — selecting this lane never grants access. Attempts by non-authorized
                accounts are monitored and audited.
              </span>
            </div>
          ) : null}

          {lane === 'super_admin' ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-3 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs leading-5 text-rose-200"
            >
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-rose-400/40 text-[0.65rem] font-bold" aria-hidden>
                !
              </span>
              <span>
                <span className="font-semibold text-rose-100">Restricted access:</span>{' '}
                Super Admin access is restricted to authorized personnel. Access attempts are monitored and audited.
                Your account must hold a server-verified super-admin role to proceed.
              </span>
            </div>
          ) : null}
        </div>

        {laneDenied ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
          >
            <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-300" aria-hidden />
            <span>
              {lane === 'super_admin'
                ? 'This account is not authorized for Super Admin access on this server. The attempt has been recorded.'
                : 'This account is not authorized for administrative access on this server. The attempt has been recorded.'}
            </span>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
          >
            <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-300" aria-hidden />
            {error.message}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="flex size-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              >
                <EyeIcon visible={showPassword} />
              </button>
            }
          />

          <div className="flex items-center justify-between gap-3 pt-1 text-xs">
            <button
              type="button"
              onClick={openForgot}
              aria-expanded={showForgot}
              className="rounded text-ink-300 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
            >
              Forgot password?
            </button>
            <Link
              to={ROUTES.register}
              className="rounded font-medium text-brand-200 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
            >
              Create account
            </Link>
          </div>

          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {showForgot ? (
          <div className="mt-4 space-y-3 rounded-[var(--radius-lg)] border border-white/10 bg-white/5 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink-100">Reset your password</p>
              <p className="text-xs leading-5 text-ink-300">
                Enter your account email and we&apos;ll send a reset link. No email is sent in demo mode..
              </p>
            </div>
            {forgotSent ? (
              <div role="status" className="rounded-[var(--radius-md)] border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-5 text-emerald-100">
                If an account exists, a reset link was sent..
              </div>
            ) : (
              <>
                <Input
                  label="Email for reset"
                  type="email"
                  name="reset-email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  loading={forgotSubmitting}
                  disabled={forgotSubmitting}
                  onClick={onForgot}
                >
                  {forgotSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>
              </>
            )}
          </div>
        ) : null}

        <div className="my-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-ink-500">or</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="text-center">
          <p className="mb-3 text-sm text-ink-300">New to CareLink.AI?</p>
          <Button variant="secondary" fullWidth>
            <Link to={ROUTES.register} className="flex w-full items-center justify-center">
              Create your account
            </Link>
          </Button>
        </div>
      </Card>

      <p className="mt-6 max-w-sm text-center text-xs leading-6 text-ink-400">
        CareLink provides navigational guidance, not medical advice. In an emergency, call your local emergency number..
      </p>
    </div>
  );
}
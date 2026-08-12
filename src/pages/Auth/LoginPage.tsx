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

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import { preventDefaultSubmit } from './authFormUtils';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { signIn, user, initializing, error, isMockMode, clearError, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const from = (location.state as LocationState | null)?.from ?? ROUTES.profile;

  useEffect(() => {
    if (!initializing && user) {
      navigate(from, { replace: true });
    }
  }, [user, initializing, from, navigate]);

  const onSubmit = preventDefaultSubmit(async () => {
    clearError();
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate(from, { replace: true });
    }
  });

  const onForgot = async () => {
    clearError();
    setForgotSent(false);
    const result = await requestPasswordReset(email);
    if (result.ok) setForgotSent(true);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-brand-400/30 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-sm font-semibold text-white">
          C
        </div>
        <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-ink-300">Sign in to your CareLink account to continue.</p>
      </div>

      <Card className="w-full">
        {isMockMode ? (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            Demo mode: no backend configured. Accounts are stored locally in this browser for evaluation only.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error ? <p className="text-sm text-rose-300">{error.message}</p> : null}

          <div className="flex items-center justify-between text-xs">
            <button type="button" className="text-ink-300 transition-colors hover:text-white" onClick={() => { setShowForgot((v) => !v); setForgotSent(false); }}>
              Forgot password?
            </button>
            <Link to={ROUTES.register} className="font-medium text-brand-200 transition-colors hover:text-white">
              Create account
            </Link>
          </div>

          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            Sign in
          </Button>
        </form>

        {showForgot ? (
          <div className="mt-4 rounded-[var(--radius-lg)] border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-xs text-ink-300">Enter your email and we'll send a reset link.</p>
            {forgotSent ? (
              <p className="text-xs text-brand-200">If an account exists, a reset link was sent.</p>
            ) : (
              <Button variant="secondary" size="sm" fullWidth onClick={onForgot}>
                Send reset link
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      <p className="mt-6 max-w-sm text-center text-xs leading-6 text-ink-400">
        CareLink provides navigational guidance, not medical advice. In an emergency, call your local emergency number.
      </p>
    </div>
  );
}

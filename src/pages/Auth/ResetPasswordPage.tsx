/**
 * CareLink-AI — password recovery completion page.
 *
 * The "forgot password" email links here (`/reset-password#...type=recovery`).
 * The Supabase client (`detectSessionInUrl`) exchanges the recovery token for a
 * short-lived session that authorizes exactly one password change; this page
 * then calls `updatePassword` (Supabase `auth.updateUser`).
 *
 * Honest states only: without a configured backend the page explains that the
 * recovery link requires a real backend and never pretends the password changed.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import { preventDefaultSubmit } from './authFormUtils';
import { isSupabaseConfigured } from '../../services/supabase/client';
import { isRecoveryRedirect } from '../../services/auth';

export function ResetPasswordPage() {
  const { updatePassword, signOut, user, initializing } = useAuth();
  const navigate = useNavigate();
  const backendConfigured = isSupabaseConfigured();
  const recoveryLink = isRecoveryRedirect();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate(ROUTES.profile, { replace: true }), 2000);
      return () => clearTimeout(t);
    }
  }, [done, navigate]);

  const onSubmit = preventDefaultSubmit(async () => {
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError('Password should be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error?.message ?? 'Could not update your password. Please try again.');
      return;
    }
    setDone(true);
  });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-16">
      <div className="mb-8 text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-brand-200">CareLink.AI</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">Set a new password</h1>
        <p className="mt-2 text-sm leading-6 text-ink-300">
          Choose a new password for your CareLink account.
        </p>
      </div>

      <Card className="w-full">
        {!backendConfigured ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200"
          >
            <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-hidden />
            <span>
              <span className="font-semibold text-amber-100">Demo mode:</span>{' '}
              no backend configured — password recovery needs a real Supabase backend. Sign in and use
              “Change password” to try the flow locally.
            </span>
          </div>
        ) : null}

        {done ? (
          <div role="status" className="space-y-4 text-center">
            <div className="rounded-[var(--radius-lg)] border border-brand-400/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
              Your password has been updated. Redirecting to your profile…
            </div>
            <Button variant="secondary" onClick={() => navigate(ROUTES.profile, { replace: true })}>
              Go to profile
            </Button>
          </div>
        ) : !initializing && !user && !recoveryLink ? (
          <div role="status" className="space-y-4 text-center">
            <div className="rounded-[var(--radius-lg)] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
              This page finishes a password reset. Open the reset link from your email, or sign in and
              use “Change password” on your profile.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => navigate(ROUTES.login, { replace: true })}>Sign in</Button>
              <Button variant="ghost" onClick={() => navigate(ROUTES.profile, { replace: true })}>Go to profile</Button>
            </div>
          </div>
        ) : (
          <>
            {error ? (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
              >
                <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-300" aria-hidden />
                {error}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Input
                label="New password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                hint="Use at least 8 characters."
                required
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="flex size-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                }
              />
              <Input
                label="Confirm new password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                required
              />
              <Button type="submit" fullWidth loading={submitting} disabled={submitting || !password || !confirm}>
                {submitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-400">
              <Link to={ROUTES.login} className="text-brand-200 hover:text-white">Back to sign in</Link>
              <button
                type="button"
                className="text-ink-400 transition-colors hover:text-white"
                onClick={async () => { await signOut(); navigate(ROUTES.login, { replace: true }); }}
              >
                Cancel and sign out
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

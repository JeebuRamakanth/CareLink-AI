/**
 * CareLink-AI — Register page (Step 10).
 *
 * Premium auth surface. Supports real Supabase Auth and the local mock
 * fallback. Validates email + password strength client-side and shows safe
 * error states. Redirects authenticated users away.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import { preventDefaultSubmit } from './authFormUtils';

export function RegisterPage() {
  const { signUp, user, initializing, error, isMockMode, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && user) {
      navigate(ROUTES.profile, { replace: true });
    }
  }, [user, initializing, navigate]);

  const onSubmit = preventDefaultSubmit(async () => {
    clearError();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('Password should be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const result = await signUp(email, password);
    setSubmitting(false);
    if (result.ok) navigate(ROUTES.profile, { replace: true });
  });

  const displayError = localError ? { message: localError } : error;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-brand-400/30 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-sm font-semibold text-white">
          C
        </div>
        <h1 className="text-2xl font-semibold text-white">Create your account</h1>
        <p className="mt-2 text-sm text-ink-300">Secure access to your CareLink health workspace.</p>
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            hint="Use at least 8 characters."
            required
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            required
          />

          {displayError ? <p className="text-sm text-rose-300">{displayError.message}</p> : null}

          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            Create account
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-ink-300">
          Already have an account?{' '}
          <Link to={ROUTES.login} className="font-medium text-brand-200 transition-colors hover:text-white">
            Sign in
          </Link>
        </div>
      </Card>

      <p className="mt-6 max-w-sm text-center text-xs leading-6 text-ink-400">
        By creating an account you acknowledge that CareLink provides navigational guidance, not medical advice.
      </p>
    </div>
  );
}

/**
 * CareLink-AI — Register page (Step 10).
 *
 * Premium auth surface. Supports real Supabase Auth and the local mock
 * fallback. Validates email + password strength client-side and shows safe
 * error states. Redirects authenticated users away. Styled to match the
 * Login page so both feel like one authentication system..
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { waitForAuthSession } from '../../services/auth';
import { writePendingProfileSave } from '../../services/auth/pendingProfileSave';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import { preventDefaultSubmit } from './authFormUtils';
import { isSupabaseConfigured } from '../../services/supabase/client';
import { createFamilyProfile, updateProfile } from '../../services/health-data';

export function RegisterPage() {
  const { signUp, user, initializing, error, isMockMode, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [familyLabel, setFamilyLabel] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const demoMode = isMockMode || !isSupabaseConfigured();

  useEffect(() => {
    if (!initializing && user) {
      navigate(ROUTES.profile, { replace: true });
    }
  }, [user, initializing, navigate]);

  const onSubmit = preventDefaultSubmit(async () => {
    if (submitting) return;
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
    if (!result?.ok) {
      setSubmitting(false);
      return;
    }
    // Persist every submitted field so registration never silently discards
    // user-entered profile details. Each field has a defined destination:
    //   profiles.display_name / emergency_contact_phone / location_preference.
    //   family_profiles.label (a "self" profile so the agent has a patient
    //   context immediately after signup). Both modes (real Supabase + demo
    //   local-store) persist via the shared health-data repositories.

    // In real Supabase mode, thee auth session may only become active after
    // email confirmation. Wait (briefly) for it so RLS-compliant writes can
    // succeed; if we genuinely cannot save yet, tell the user honestly instead
    // of claiming "Account created successfully" while discarding their fields.
    const session = await waitForAuthSession();

    if (!session) {
      setSubmitting(false);
      if (isSupabaseConfigured()) {
        // Real provider requires confirmation (or session latency). Queue the
        // entered profile fields so they are replayed the moment the session
        // becomes readable — AuthContext drains `pendingProfileSave` on restore.
        writePendingProfileSave({
          updatedAt: new Date().toISOString(),
          profile: {
            display_name: displayName.trim() || null,
            emergency_contact_phone: phone.trim() || null,
            location_preference: city.trim() || null,
          },
          family: familyLabel.trim()
            ? { relation: 'self' as const, label: familyLabel.trim() }
            : null,
        });
        setLocalError(
          'Account created. Please check your inbox to confirm your email — ' +
          'your profile details will be saved automatically after you confirm.',
        );
        navigate(ROUTES.profile, { replace: true });
      } else {
        setLocalError('Account created, but your profile details could not be saved. Please try again.');
      }
      return;
    }

    const saved = await updateProfile({
      display_name: displayName.trim() || null,
      emergency_contact_phone: phone.trim() || null,
      location_preference: city.trim() || null,
    });
    const familySaved = familyLabel.trim()
      ? await createFamilyProfile({
          relation: 'self',
          label: familyLabel.trim(),
        })
      : true;

    setSubmitting(false);
    if (!saved || !familySaved) {
      // Never show success when persistence failed — surface a safe error and
      // keep the form mounted so the user can retry (idempotent upserts).
      setProfileSaved(false);
      setLocalError(
        'Your account was created, but we could not save your profile details.' +
        ' Please try again.',
      );
      return;
    }
    setProfileSaved(true);
    navigate(ROUTES.profile, { replace: true });
  });

  const displayError = localError ? { message: localError } : error;

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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-ink-300">Secure access to your CareLink health workspace.</p>
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
              no backend configured — accounts are stored locally in this browser for evaluation only.
            </span>
          </div>
        ) : null}

        {displayError ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
          >
            <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-300" aria-hidden />
            {displayError.message}
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
                  {showPassword ? (
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
              </button>
            }
          />
          <Input
            label="Confirm password"
            name="confirm-password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            required
            rightSlot={
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirm}
                className="flex size-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              >
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
                  {showConfirm ? (
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
              </button>
            }
          />

          <div className="flex items-center gap-3 pt-2" aria-hidden>
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-ink-500">Profile — optional</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <Input
            label="Display name"
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 …"
          />
          <Input
            label="City / area"
            name="city"
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Machilipatnam"
          />
          <Input
            label="Patient label (optional)"
            name="patientLabel"
            value={familyLabel}
            onChange={(e) => setFamilyLabel(e.target.value)}
            placeholder="e.g. Me (primary)"
            hint="Creates a self family profile so the agent has patient context immediately."
          />

          <div className="pt-2">
            <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting} disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </div>
          {profileSaved ? (
            <p role="status" className="text-center text-xs text-brand-200">Profile details saved.</p>
          ) : null}
        </form>

        <div className="my-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-ink-500">or</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="text-center">
          <p className="mb-3 text-sm text-ink-300">Already have an account?</p>
          <Button variant="secondary" fullWidth>
            <Link to={ROUTES.login} className="flex w-full items-center justify-center">
              Sign in
            </Link>
          </Button>
        </div>
      </Card>

      <p className="mt-6 max-w-sm text-center text-xs leading-6 text-ink-400">
        By creating an account you acknowledge that CareLink provides navigational guidance, not medical advice..
      </p>
    </div>
  );
}
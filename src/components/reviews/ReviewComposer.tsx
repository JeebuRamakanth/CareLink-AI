/**
 * CareLink-AI — ReviewComposer (Step 15+).
 *
 * Writes a review for a provider target. When Supabase is configured the
 * review persists through the RLS-protected reviewsRepository (`createReview`)
 * as the authenticated author — status transitions / moderation are handled
 * server-side. When the backend is unavailable the composer is disabled with an
 * honest message — never fakes a submitted review.
 *
 * No optimistic "submitted" state: the button only reports success after the
 * server write returns a row.
 */

import { useState } from 'react';
import { createReview, listMyReviews } from '../../services/health-data';
import { isSupabaseConfigured } from '../../services/supabase/client';
import type { ReviewTarget } from '../../services/health-data/reviewsRepository';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuth } from '../../contexts/AuthContext';

interface ReviewComposerProps {
  target: ReviewTarget;
}

export function ReviewComposer({ target }: ReviewComposerProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'ok' | 'error' | 'already' | null>(null);
  const [errorText, setErrorText] = useState('');

  const configured = isSupabaseConfigured();

  const submit = async () => {
    if (submitting || !configured || !user) return;
    setSubmitting(true);
    setResult(null);
    setErrorText('');

    // Refuse duplicate reviews for the same provider target (repo-level guards
    // also apply server-side; this is a UX convenience, not the security boundary).
    const mine = await listMyReviews();
    const already = (mine ?? []).some((r) => {
      if (target.kind === 'hospital') return r.hospital_id === target.id;
      if (target.kind === 'doctor') return r.doctor_id === target.id;
      if (target.kind === 'pharmacy') return r.pharmacy_id === target.id;
      return r.lab_id === target.id;
    });
    if (already) {
      setSubmitting(false);
      setResult('already');
      return;
    }

    const { review, error } = await createReview({
      target,
      overallRating: rating,
      title: title.trim() || null,
      body: body.trim() || null,
    });
    setSubmitting(false);
    if (review) {
      setTitle('');
      setBody('');
      setRating(5);
      setResult('ok');
    } else {
      setErrorText(error ?? 'We could not save your review. Please try again.');
      setResult('error');
    }
  };

  if (!configured) {
    return (
      <p className="text-xs leading-6 text-ink-400">
        Review submission requires a configured backend. This page is showing demo provider data.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-100 transition hover:bg-brand-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
      >
        {open ? 'Cancel' : 'Write a review'}
      </button>
      {open ? (
        <div className="mt-4 space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
          {result === 'ok' ? (
            <p role="status" className="rounded-[1rem] border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Review submitted and saved. Thank you.
            </p>
          ) : result === 'already' ? (
            <p role="status" className="rounded-[1rem] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              You have already reviewed this provider on the server.
            </p>
          ) : result === 'error' ? (
            <p role="alert" className="rounded-[1rem] border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {errorText}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-ink-200">
              <span>Rating (1–5)</span>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25"
              >
                {[5,4,3,2,1].map((n) => (
                  <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>
                ))}
              </select>
            </label>
            <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline of your review" />
          </div>
          <label className="block text-sm text-ink-200">
            <span>Review</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Share your experience (no private health data)."
              className="mt-2 w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25"
            />
          </label>
          <div>
            <Button type="button" variant="primary" size="sm" loading={submitting} disabled={submitting || !user} onClick={() => void submit()}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </Button>
            {!user ? <p className="mt-2 text-xs text-ink-400">Sign in to submit a review.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
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

import { useCallback, useEffect, useState } from 'react';
import { createReview, deleteMyReview, listMyReviews, updateMyReview } from '../../services/health-data';
import { isSupabaseConfigured } from '../../services/supabase/client';
import type { ReviewTarget } from '../../services/health-data/reviewsRepository';
import type { ReviewRow } from '../../services/health-data/types';
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
  const [existing, setExisting] = useState<ReviewRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const configured = isSupabaseConfigured();

  const loadMine = useCallback(async () => {
    if (!configured) return;
    const mine = await listMyReviews();
    const found = (mine ?? []).find((r) => {
      if (target.kind === 'hospital') return r.hospital_id === target.id;
      if (target.kind === 'doctor') return r.doctor_id === target.id;
      if (target.kind === 'pharmacy') return r.pharmacy_id === target.id;
      return r.lab_id === target.id;
    }) ?? null;
    setExisting(found);
    if (found) {
      setTitle(found.title ?? '');
      setBody(found.body ?? '');
      setRating(found.overall_rating);
    }
  }, [configured, target]);

  useEffect(() => {
    if (open) void loadMine();
  }, [open, loadMine]);

  const submit = async () => {
    if (submitting || !configured || !user) return;
    setSubmitting(true);
    setResult(null);
    setErrorText('');

    if (existing) {
      // Edit own review in place (server enforces author-only RLS).
      const updated = await updateMyReview(existing.id, {
        title: title.trim() || null,
        body: body.trim() || null,
        overallRating: rating,
      });
      setSubmitting(false);
      if (updated) {
        setExisting(updated);
        setEditing(false);
        setResult('ok');
      } else {
        setErrorText('We could not update your review. Please try again.');
        setResult('error');
      }
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
      setExisting(review);
      setResult('ok');
    } else {
      setErrorText(error ?? 'We could not save your review. Please try again.');
      setResult('error');
    }
  };

  const remove = async () => {
    if (!existing || deleting) return;
    setDeleting(true);
    setResult(null);
    setErrorText('');
    const ok = await deleteMyReview(existing.id);
    setDeleting(false);
    if (ok) {
      setExisting(null);
      setTitle('');
      setBody('');
      setRating(5);
      setEditing(false);
      setResult('ok');
    } else {
      setErrorText('We could not delete your review. Please try again.');
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
        onClick={() => { setOpen((v) => !v); setEditing(false); setResult(null); }}
        aria-expanded={open}
        className="rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-100 transition hover:bg-brand-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
      >
        {open ? 'Cancel' : existing ? 'Manage your review' : 'Write a review'}
      </button>
      {open ? (
        <div className="mt-4 space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
          {result === 'ok' ? (
            <p role="status" className="rounded-[1rem] border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {existing && !editing ? 'Review updated and saved.' : 'Review submitted and saved. Thank you.'}
            </p>
          ) : result === 'error' ? (
            <p role="alert" className="rounded-[1rem] border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {errorText}
            </p>
          ) : null}

          {existing && !editing ? (
            <div className="rounded-[1rem] border border-white/10 bg-slate-950/70 p-3 text-sm text-ink-200">
              <p className="font-semibold text-white">Your review</p>
              <p className="mt-1 text-ink-300">{title || 'Untitled'} · {rating} star{rating === 1 ? '' : 's'}</p>
              {body ? <p className="mt-1 text-ink-300">{body}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button type="button" variant="danger" size="sm" loading={deleting} disabled={deleting} onClick={() => void remove()}>
                  Delete
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-400">
                You can only edit or delete your own review. Changes are saved server-side.
              </p>
            </div>
          ) : (
            <>
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
                  {submitting ? 'Saving…' : existing ? 'Save changes' : 'Submit review'}
                </Button>
                {existing ? (
                  <Button type="button" variant="ghost" size="sm" className="ml-2" onClick={() => { setEditing(false); void loadMine(); }}>
                    Back
                  </Button>
                ) : null}
                {!user ? <p className="mt-2 text-xs text-ink-400">Sign in to submit a review.</p> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
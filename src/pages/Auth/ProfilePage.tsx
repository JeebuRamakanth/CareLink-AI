/**
 * CareLink-AI — Profile page (Step 10).
 *
 * Protected page for the authenticated user's own (non-sensitive) profile and
 * family-member patient contexts. Uses the health-data repositories when
 * Supabase is available; falls back to a local mock profile derived from the
 * session otherwise.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ROUTES } from '../../routes/routeConstants';
import {
  createFamilyProfile,
  deleteFamilyProfile,
  getProfile,
  listFamilyProfiles,
  listNotifications,
  markNotificationRead,
  updateProfile,
} from '../../services/health-data';
import type { FamilyProfileRow, FamilyRelation, NotificationRow } from '../../services/health-data';
import { cn } from '../../components/common/cn';

const RELATIONS: { value: FamilyRelation; label: string }[] = [
  { value: 'self', label: 'Self' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'other', label: 'Other' },
];

export function ProfilePage() {
  const { user, isMockMode, signOut } = useAuth();
  const navigate = useNavigate();
  const [family, setFamily] = useState<FamilyProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Family form state.
  const [relation, setRelation] = useState<FamilyRelation>('child');
  const [label, setLabel] = useState('');
  const [contextSummary, setContextSummary] = useState('');
  const [addingFamily, setAddingFamily] = useState(false);

  // Editable profile fields.
  const [displayName, setDisplayName] = useState('');
  const [locationPref, setLocationPref] = useState('');
  const [languagePref, setLanguagePref] = useState('en');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const n = await listNotifications({ limit: 20 });
      setNotifications(n ?? []);
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const onMarkRead = async (id: string) => {
    const ok = await markNotificationRead(id);
    if (ok) {
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, status: 'read' } : n));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, f] = await Promise.all([getProfile(), listFamilyProfiles()]);
      setFamily(f);
      if (p) {
        setDisplayName(p.display_name ?? '');
        setLocationPref(p.location_preference ?? '');
        setLanguagePref(p.language_preference ?? 'en');
        setEmergencyName(p.emergency_contact_name ?? '');
        setEmergencyPhone(p.emergency_contact_phone ?? '');
      }
    } catch {
      // Repositories return null on failure; non-fatal.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadNotifications();
  }, [load, loadNotifications]);

  const onSaveProfile = async () => {
    setSaving(true);
    setSaved(false);
    const updated = await updateProfile({
      display_name: displayName || null,
      location_preference: locationPref || null,
      language_preference: languagePref || null,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: emergencyPhone || null,
    });
    setSaving(false);
    if (updated) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('Could not save profile. Please try again.');
    }
  };

  const onAddFamily = async () => {
    if (!label.trim()) return;
    setAddingFamily(true);
    const created = await createFamilyProfile({
      relation,
      label: label.trim(),
      context_summary: contextSummary.trim() || null,
    });
    setAddingFamily(false);
    if (created) {
      setLabel('');
      setContextSummary('');
      await load();
    } else {
      setError('Could not add family member. Please try again.');
    }
  };

  const onDeleteFamily = async (id: string) => {
    const ok = await deleteFamilyProfile(id);
    if (ok) await load();
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 py-20">
        <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-200">Account</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Your profile</h1>
          <p className="mt-1 text-sm text-ink-300">
            {user?.email ? `Signed in as ${user.email}` : 'Signed in'}
            {isMockMode ? ' · demo mode' : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={async () => { await signOut(); navigate(ROUTES.home, { replace: true }); }}>
          Sign out
        </Button>
      </div>

      {error ? (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="space-y-8">
        <Card>
          <h2 className="text-lg font-semibold text-white">Basic information</h2>
          <p className="mt-1 text-sm text-ink-300">Non-sensitive preferences. We do not store medical conditions here.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            <Input label="Location preference" value={locationPref} onChange={(e) => setLocationPref(e.target.value)} placeholder="City, area" />
            <Input label="Language preference" value={languagePref} onChange={(e) => setLanguagePref(e.target.value)} placeholder="en" />
            <Input label="Emergency contact name" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Contact name" />
            <Input label="Emergency contact phone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+1 …" />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={onSaveProfile} loading={saving}>Save changes</Button>
            {saved ? <span className="text-sm text-brand-200">Saved.</span> : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Family members</h2>
          <p className="mt-1 text-sm text-ink-300">Patient contexts the agent can use for scoped recommendations (self, child, elder, family).</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
              <span className="text-sm font-medium text-ink-100">Relation</span>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value as FamilyRelation)}
                className="w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25"
              >
                {RELATIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My daughter" />
            <div className="sm:col-span-2">
              <Input label="Context summary (optional)" value={contextSummary} onChange={(e) => setContextSummary(e.target.value)} placeholder="e.g. Age 4, allergic to penicillin" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={onAddFamily} loading={addingFamily} disabled={!label.trim()}>Add family member</Button>
          </div>

          {family.length > 0 ? (
            <ul className="mt-5 divide-y divide-white/5">
              {family.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{f.label}</p>
                    <p className="text-xs text-ink-400">
                      {RELATIONS.find((r) => r.value === f.relation)?.label ?? f.relation}
                      {f.context_summary ? ` · ${f.context_summary}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onDeleteFamily(f.id)}>Remove</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-ink-400">No family members added yet.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Notifications</h2>
              <p className="mt-1 text-sm text-ink-300">Recent CareLink notifications for your account (appointment, safety, account events).</p>
            </div>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4">
            {notificationsLoading ? (
              <p className="py-3 text-sm text-ink-400">Loading notifications…</p>
            ) : notifications.length === 0 ? (
              <p className="py-3 text-sm text-ink-400">
                No notifications yet.{' '}
                {isMockMode ? 'In demo mode dispatch requires a real backend, so this stays empty here.' : 'They will appear here when CareLink dispatches them.'}
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={['text-sm font-medium', n.status === 'read' ? 'text-ink-400' : 'text-white'].join(' ')}>{n.title}</p>
                      {n.body ? <p className="mt-0.5 text-xs leading-5 text-ink-400">{n.body}</p> : null}
                      {n.scheduled_for ? <p className="mt-0.5 text-xs text-ink-500">{new Date(n.scheduled_for).toLocaleString()}</p> : null}
                    </div>
                    {n.status === 'sent' ? (
                      <Button variant="ghost" size="sm" onClick={() => void onMarkRead(n.id)}>Mark read</Button>
                    ) : (
                      <span className="mt-0.5 shrink-0 text-[0.66rem] uppercase tracking-[0.16em] text-ink-500">{n.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link to={ROUTES.appointments} className={cn('rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-ink-200 transition-all hover:bg-white/10 hover:text-white')}>
            My appointments
          </Link>
          <Link to={ROUTES.agent} className={cn('rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-ink-200 transition-all hover:bg-white/10 hover:text-white')}>
            Open command center
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * CareLink-AI — persistent urgency banner for a document analysis.
 *
 * Renders the DETERMINISTIC triage result near the top of the analysis, above
 * secondary detail, and is never hidden at the bottom of an AI response.
 *
 * SAFETY / HONESTY:
 * - The exact extracted finding that triggered the alert is shown.
 * - Whether the finding was confidently extracted is stated.
 * - Severity is conveyed by icon + label + text, never by colour alone.
 * - Emergency actions are real `tel:` links plus a navigation link; the banner
 *   states plainly that CareLink cannot place the call or dispatch an ambulance.
 * - This is triage guidance, not a diagnosis.
 */

import { cn } from '../../../../components/common/cn';
import { IconEmergency, IconPhone, IconRoute, IconShield } from '../../../../components/agent/AgentIcons';
import type { TriageResult } from '../../services/clinical/triage';
import { EMERGENCY_DISCLAIMER } from '../../services/clinical/emergencyConfig';
import type { EmergencyContact } from '../../services/clinical/emergencyConfig';

const TONE: Record<TriageResult['level'], { wrap: string; label: string; badge: string }> = {
  emergency: {
    wrap: 'border-rose-400/50 bg-rose-500/15',
    label: 'text-rose-100',
    badge: 'border-rose-300/40 bg-rose-500/25 text-rose-50',
  },
  urgent: {
    wrap: 'border-amber-400/45 bg-amber-500/12',
    label: 'text-amber-100',
    badge: 'border-amber-300/40 bg-amber-500/25 text-amber-50',
  },
  'needs-follow-up': {
    wrap: 'border-sky-400/35 bg-sky-500/10',
    label: 'text-sky-100',
    badge: 'border-sky-300/35 bg-sky-500/20 text-sky-50',
  },
  informational: {
    wrap: 'border-white/12 bg-white/5',
    label: 'text-ink-200',
    badge: 'border-white/15 bg-white/10 text-ink-100',
  },
};

interface Props {
  triage: TriageResult;
  /** Verified emergency contacts for the user's region. */
  contacts?: EmergencyContact[];
  /** A directions URL to the nearest suitable facility, when known. */
  directionsUrl?: string | null;
  /** Label of the destination the directions link points to. */
  destinationLabel?: string | null;
}

export function AnalysisUrgencyBanner({ triage, contacts = [], directionsUrl, destinationLabel }: Props) {
  const tone = TONE[triage.level];
  const isEmergency = triage.level === 'emergency';

  return (
    <section
      role={isEmergency ? 'alert' : 'status'}
      aria-live={isEmergency ? 'assertive' : 'polite'}
      aria-labelledby="analysis-urgency-heading"
      className={cn('overflow-hidden rounded-[1.1rem] border p-3.5 sm:p-4', tone.wrap)}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border', tone.badge)}>
          <IconEmergency width={17} height={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="analysis-urgency-heading" className={cn('text-[0.95rem] font-bold', tone.label)}>
              {triage.label}
            </h3>
            <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', tone.badge)}>
              Triage guidance, not a diagnosis
            </span>
          </div>

          <p className={cn('text-[0.85rem] leading-6', tone.label)}>{triage.reason}</p>

          {triage.triggers.length > 0 ? (
            <ul className="space-y-1.5">
              {triage.triggers.slice(0, 4).map((t, i) => (
                <li key={`${t.source}-${i}`} className="flex items-start gap-2 text-[0.8rem] leading-6">
                  <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', isEmergency ? 'bg-rose-300' : 'bg-amber-300')} aria-hidden />
                  <span className={tone.label}>
                    <span className="font-semibold">{t.label}:</span> {t.detail}{' '}
                    {!t.confident ? (
                      <span className="italic opacity-90">(extraction confidence is low — confirm this against the original document)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {isEmergency ? (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-2">
                {contacts.map((c) => (
                  <a
                    key={c.phone}
                    href={c.href}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70',
                      c.primary ? 'bg-rose-500 text-white hover:bg-rose-600' : 'border border-rose-300/40 bg-rose-500/15 text-rose-50 hover:bg-rose-500/25'
                    )}
                  >
                    <IconPhone width={13} height={13} aria-hidden />
                    {c.label} · {c.phone}
                  </a>
                ))}
                {directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-500/15 px-3 py-1.5 text-[0.78rem] font-semibold text-rose-50 transition hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                  >
                    <IconRoute width={13} height={13} aria-hidden />
                    {destinationLabel ? `Directions to ${destinationLabel}` : 'Open directions'}
                  </a>
                ) : null}
              </div>
              <p className="flex items-start gap-1.5 text-[0.72rem] italic text-rose-100/90">
                <IconShield width={12} height={12} className="mt-0.5 shrink-0" aria-hidden />
                {EMERGENCY_DISCLAIMER}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * AIChatPage — the dedicated CareLink AI conversation experience.
 *
 * A premium, ChatGPT-inspired healthcare command center (NOT a generic chatbot):
 * persistent conversation area, user message bubbles, structured AI result cards,
 * typing state, sticky composer, attachment previews, quick follow-ups, action
 * cards, emergency banners, scroll-to-latest, and context memory.
 *
 * Reached by:
 *   - Pressing SEND in the Home hero (pending handoff is drained on mount).
 *   - Direct navigation to /ai (shows a premium welcome + suggested prompts).
 *
 * Built on the typed health-agent architecture (orchestrator + ranking engine +
 * context manager). Results carry explainability ("Recommended #1 because…").
 *
 * SAFETY: the agent never diagnoses or prescribes. Emergency intents surface a
 * prominent banner with tel: links and never claim certainty.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { Badge } from '../../../components/ui/Badge';
import { ROUTES } from '../../../routes/routeConstants';
import {
  IconArrowRight,
  IconCamera,
  IconClose,
  IconEmergency,
  IconFamily,
  IconGlobe,
  IconHeart,
  IconHospital,
  IconLab,
  IconLocation,
  IconMic,
  IconPaperclip,
  IconPhone,
  IconPharmacy,
  IconPlus,
  IconReport,
  IconRoute,
  IconSend,
  IconShield,
  IconSparkle,
  IconStar,
} from '../../../components/agent/AgentIcons';
import { useAgentConversation } from '../hooks/useAgentConversation';
import type { AIToolSuggestion } from '../services/ai/aiTools';
import { AgentDocumentAnalysisPanel } from './AgentDocumentAnalysisPanel';
import { primaryEmergencyContact } from '../../documents/services/clinical/emergencyConfig';
import { useOptionalLocationContext } from '../../../contexts/LocationContext';
import { useOptionalNavigationContext } from '../../../contexts/NavigationContext';
import { GlobalNavigation } from '../../../components/layout/GlobalNavigation';
import { directionsUrl } from '../../../services/maps/mapsService';
import { buildDirectionsUrl, buildPlaceSearchUrl } from '../../../services/maps/directionsService';
import {
  ACCEPT_ATTR,
  LANGUAGE_LABELS,
  formatBytes,
  kindLabel,
  statusLabel,
} from '../utils/helpers';
import { explainRecommendation } from '../services/recommendationRanking';
import { hospitalFocusTopic } from '../services/contextManager';
import { resultProvenance } from '../services/agentOrchestrator';
import '../../../components/agent/agent.css';
import type {
  AgentAction,
  AgentLanguage,
  AgentMessage,
  AgentResult,
  HealthDocument,
  HospitalRecommendation,
  RecoveryTrend,
} from '../types';

/* ----------------------------------------------------------------------------
 * Small presentational pieces
 * ------------------------------------------------------------------------- */

/**
 * Quick prompts offered by the three-dot menu. Each label is a real instruction
 * the orchestrator already understands (intent router + adapters), so selecting
 * one performs the same work as typing it and pressing Send. `hint` explains the
 * outcome so the menu is not a list of mystery buttons.
 */
const QUICK_PROMPT_ACTIONS: { label: string; hint: string }[] = [
  { label: 'Find hospitals near me', hint: 'Sourced facilities on the corridor' },
  { label: 'Find a cardiologist', hint: 'Doctors by specialty' },
  { label: 'Find pharmacies near me', hint: 'Sourced pharmacy directory' },
  { label: 'Find pharmacies along Machilipatnam–Vijayawada', hint: 'Corridor-wide pharmacy search' },
  { label: 'Find a laboratory', hint: 'Diagnostics from the directory' },
  { label: 'Find a blood centre', hint: 'Blood banks and contact details' },
  { label: 'Check my appointment requests', hint: 'Reads your saved requests' },
  { label: 'Upload and review a report', hint: 'Attach a file in the composer' },
  { label: 'Upload a prescription', hint: 'Attach a prescription file' },
  { label: 'Help me understand a blood report', hint: 'Explains values, not a diagnosis' },
  { label: 'Explain a medicine label', hint: 'Reads a label you attach' },
  { label: 'Help with symptom navigation', hint: 'Safety-aware next steps' },
  { label: 'Find hospitals for diabetes care', hint: 'Facilities for a condition' },
  { label: 'Get directions to a facility', hint: 'Opens Google Maps directions' },
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ActionIcon({ type }: { type: AgentAction['type'] }) {
  switch (type) {
    case 'view-hospital': case 'find-hospital': return <IconHospital width={15} height={15} aria-hidden />;
    case 'view-doctor': case 'find-doctor': return <IconSparkle width={15} height={15} aria-hidden />;
    case 'view-pharmacy': case 'find-pharmacy': return <IconPharmacy width={15} height={15} aria-hidden />;
    case 'view-lab': return <IconLab width={15} height={15} aria-hidden />;
    case 'call-emergency': return <IconPhone width={15} height={15} aria-hidden />;
    case 'view-appointments': case 'book-appointment': return <IconReport width={15} height={15} aria-hidden />;
    case 'get-directions': return <IconRoute width={15} height={15} aria-hidden />;
    case 'upload-prescription': case 'upload-report': return <IconPaperclip width={15} height={15} aria-hidden />;
    case 'track-recovery': return <IconHeart width={15} height={15} aria-hidden />;
    default: return <IconArrowRight width={15} height={15} aria-hidden />;
  }
}

function ResultAction({ action }: { action: AgentAction }) {
  const toneClasses =
    action.type === 'call-emergency'
      ? 'agent-emergency-ring bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:opacity-90'
      : action.type === 'open-command-center' || action.type === 'book-appointment'
        ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:opacity-90'
        : 'border border-white/12 bg-white/8 text-ink-100 hover:bg-white/15';
  if (!action.href) return null;
  const external = action.href.startsWith('http') || action.href.startsWith('tel:') || action.href.startsWith('mailto:');
  const classes = cn('inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50', toneClasses);
  if (external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={classes} aria-label={action.label}>
        <ActionIcon type={action.icon ?? action.type} />
        <span>{action.label}</span>
      </a>
    );
  }
  return (
    <Link to={action.href} className={classes} aria-label={action.label}>
      <ActionIcon type={action.icon ?? action.type} />
      <span>{action.label}</span>
    </Link>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'text-emerald-200' : score >= 60 ? 'text-brand-200' : 'text-ink-300';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em]', tone)}>
      <IconSparkle width={11} height={11} aria-hidden /> {score}/100
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Document / attachment chips
 * ------------------------------------------------------------------------- */

function DocumentChips({ documents, onRemove }: { documents: HealthDocument[]; onRemove?: (id: string) => void }) {
  if (documents.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {documents.map((d) => (
        <div key={d.id} className="group relative flex max-w-[14rem] items-center gap-2 overflow-hidden rounded-[0.7rem] border border-white/10 bg-white/5 p-2">
          {d.previewUrl ? (
            <img src={d.previewUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-brand-500/15 text-brand-200"><IconReport width={14} height={14} aria-hidden /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.72rem] font-medium text-ink-100">{d.fileName}</p>
            <p className="text-[0.62rem] text-ink-400">{kindLabel[d.kind]} · {formatBytes(d.fileSize)}</p>
            {d.status !== 'ready' && d.status !== 'error' ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-400 transition-all duration-500" style={{ width: `${d.progress}%` }} />
              </div>
            ) : (
              <p className={cn('text-[0.6rem]', d.status === 'ready' ? 'text-emerald-200' : 'text-amber-200')}>{statusLabel[d.status]}</p>
            )}
          </div>
          {onRemove ? (
            <button type="button" onClick={() => onRemove(d.id)} aria-label={`Remove ${d.fileName}`} className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-white/10 hover:text-white">
              <IconClose width={12} height={12} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Result card — renders the structured AgentResult inside a chat bubble
 * ------------------------------------------------------------------------- */

interface ResultCardProps {
  result: AgentResult;
  onReply: (r: string) => void;
  focusTopic?: string;
  patientOrigin?: { label: string; lat?: number; lng?: number };
}

function ResultCard({ result, onReply, focusTopic, patientOrigin }: ResultCardProps) {
  const isEmergency = result.urgency === 'emergency';

  const hospitalDirectionsHref = (h: HospitalRecommendation): string =>
    directionsUrl({
      destination: `${h.name}, ${h.address}, ${h.city}`,
      origin: patientOrigin && typeof patientOrigin.lat === 'number'
        ? { label: patientOrigin.label, lat: patientOrigin.lat, lng: patientOrigin.lng }
        : undefined,
      mode: 'driving',
    });

  return (
    <div className={cn(
      'mt-2 overflow-hidden rounded-[1.1rem] border backdrop-blur-xl',
      isEmergency ? 'border-rose-400/40 bg-gradient-to-br from-rose-500/12 to-amber-500/8' : 'border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]'
    )}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <Badge tone={isEmergency ? 'warning' : result.urgency === 'attention' ? 'brand' : 'neutral'}>{result.urgency}</Badge>
        <button
          type="button"
          onClick={() => {
            const text = [result.summary, result.explanation, ...result.recommendedNextSteps.map((s, i) => `${i + 1}. ${s}`)].filter(Boolean).join('\n\n');
            void navigator.clipboard?.writeText(text).catch(() => undefined);
          }}
          aria-label="Copy response"
          title="Copy response"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-300 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          Copy
        </button>
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink-400">{result.meta.confidence} confidence</span>
        {(() => {
          const recordProvenance = resultProvenance(result);
          if (recordProvenance === 'live') return null;
          return (
            <span
              title={recordProvenance === 'sourced_directory'
                ? 'Bundled source-attributed directory (government/provider records) — no live provider configured.'
                : 'No external provider configured — these records are illustrative sample data.'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]',
                recordProvenance === 'sourced_directory'
                  ? 'border-sky-400/30 bg-sky-500/12 text-sky-200'
                  : 'border-amber-400/25 bg-amber-500/12 text-amber-200'
              )}
            >
              {recordProvenance === 'sourced_directory' ? 'Sourced directory' : 'Demo data'}
            </span>
          );
        })()}
        {result.provenance ? (
          <span
            title={`AI source: ${result.provenance.provider} · ${new Date(result.provenance.fetchedAt).toLocaleString()}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]',
              result.provenance.mode === 'real'
                ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200'
                : result.provenance.mode === 'unavailable'
                  ? 'border-amber-400/25 bg-amber-500/12 text-amber-200'
                  : result.provenance.mode === 'refused'
                    ? 'border-rose-400/25 bg-rose-500/12 text-rose-200'
                    : 'border-white/12 bg-white/6 text-ink-300'
            )}
          >
            {result.provenance.mode === 'real'
              ? 'Live AI'
              : result.provenance.mode === 'unavailable'
                ? 'Temporarily unavailable'
                : result.provenance.mode === 'refused'
                  ? 'Security policy'
                  : 'CareLink demo response'}
          </span>
        ) : null}
        {result.meta.disclaimer ? (
          <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-400"><IconShield width={12} height={12} aria-hidden /> Guidance, not a diagnosis</span>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        {/* Recommended next steps */}
        {result.recommendedNextSteps.length > 0 ? (
          <div className="space-y-1.5">
            {result.recommendedNextSteps.map((step, i) => (
              <p key={i} className="flex items-start gap-2 text-[0.84rem] leading-6 text-ink-200">
                <IconArrowRight width={13} height={13} className="mt-1 shrink-0 text-brand-300" aria-hidden /> <span>{step}</span>
              </p>
            ))}
          </div>
        ) : null}

        {/* Emergency banner */}
        {result.emergency ? (
          <div className="space-y-2">
            {result.emergency.contacts.map((c) => (
              <a key={c.label} href={c.href} className="agent-emergency-ring flex items-center justify-between gap-2 rounded-[0.85rem] border border-rose-400/40 bg-gradient-to-r from-rose-500/90 to-amber-500/90 px-4 py-3 text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60">
                <span className="flex items-center gap-2 text-sm font-semibold"><IconPhone width={16} height={16} aria-hidden /> {c.label}</span>
                {c.phone ? <span className="text-sm font-bold">{c.phone}</span> : null}
              </a>
            ))}
            <ul className="space-y-1 px-1">
              {result.emergency.immediateGuidance.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-[0.8rem] leading-6 text-rose-100"><IconEmergency width={13} height={13} className="mt-1 shrink-0" aria-hidden /> <span>{g}</span></li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Hospitals */}
        {result.hospitals.length > 0 ? (
          <div className="space-y-2">
            {result.hospitals.map((h, i) => (
              <article key={h.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5 transition hover:border-brand-400/25">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{h.name}</h4>
                    <p className="truncate text-xs text-ink-400">{h.address}, {h.city}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em]', h.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300')}>
                    {h.availabilityLabel ?? (h.isOpen ? 'Open' : 'Closed')}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span className="inline-flex items-center gap-1"><IconStar width={12} height={12} className="text-amber-300" aria-hidden /> <span className="font-semibold text-white">{h.rating > 0 ? h.rating.toFixed(1) : '—'}</span> · {h.reviewCount > 0 ? `${h.reviewCount} reviews` : 'No verified ratings yet'}</span>
                  {h.route && h.distanceAvailable !== false ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {h.distanceKm.toFixed(1)} km · ~{h.estimatedTravelTimeMin} min</span> : <span className="text-ink-500">Distance unavailable</span>}
                  {h.hasEmergency ? <span className="inline-flex items-center gap-1 text-rose-200"><IconEmergency width={12} height={12} aria-hidden /> Emergency</span> : null}
                </div>
                {h.recommendationScore != null ? (
                  <p className="mt-2 text-[0.72rem] leading-5 text-ink-300">{explainRecommendation(i + 1, { recommendationScore: h.recommendationScore, matchedReasons: h.matchedReasons ?? [], topReason: h.topReason })}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`${ROUTES.hospitals}/${h.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Hospital</Link>
                    <Link to={`${ROUTES.hospitals}/${h.detailSlug}?focus=${encodeURIComponent(focusTopic ?? 'All')}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">{focusTopic && focusTopic !== 'All' ? 'View Relevant Doctors' : 'View Doctors'}</Link>
                    <a href={hospitalDirectionsHref(h)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Directions</a>
                    <Link to={`${ROUTES.appointments}?hosp=${h.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book</Link>
                  </div>
                  {h.recommendationScore != null ? <ScoreBadge score={h.recommendationScore} /> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Doctors */}
        {result.doctors.length > 0 ? (
          <div className="space-y-2">
            {result.doctors.map((d, i) => (
              <article key={d.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5 transition hover:border-brand-400/25">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{d.fullName}</h4>
                    <p className="truncate text-xs text-ink-400">{d.specialty} · {d.hospitalName}</p>
                  </div>
                  {d.consultationFee ? <span className="shrink-0 text-xs font-semibold text-brand-200">{d.consultationFee}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span className="inline-flex items-center gap-1"><IconStar width={12} height={12} className="text-amber-300" aria-hidden /> <span className="font-semibold text-white">{d.rating > 0 ? d.rating.toFixed(1) : '—'}</span> · {d.yearsOfExperience > 0 ? `${d.yearsOfExperience} yrs` : 'Experience unlisted'}</span>
                  <span className="text-ink-400">{d.availabilityLabel ?? d.nextAvailableSlot ?? 'Availability unlisted'}</span>
                  {d.acceptsNewPatients ? <span className="text-ink-400">Accepts new patients</span> : null}
                </div>
                {d.recommendationScore != null ? (
                  <p className="mt-2 text-[0.72rem] leading-5 text-ink-300">{explainRecommendation(i + 1, { recommendationScore: d.recommendationScore, matchedReasons: d.matchedReasons ?? [], topReason: d.topReason })}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`${ROUTES.doctors}/${d.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Profile</Link>
                    <Link to={`${ROUTES.appointments}?doc=${d.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book Appointment</Link>
                  </div>
                  {d.recommendationScore != null ? <ScoreBadge score={d.recommendationScore} /> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Pharmacies */}
        {result.pharmacies.length > 0 ? (
          <div className="space-y-2">
            {result.pharmacies.map((p) => (
              <article key={p.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{p.name}</h4>
                    <p className="truncate text-xs text-ink-400">{p.address}</p>
                  </div>
                  {p.distanceAvailable && p.distanceKm > 0 ? (
                    <span className="shrink-0 rounded-full border border-brand-400/25 bg-brand-400/10 px-2 py-0.5 text-[0.6rem] font-semibold text-brand-100">{p.distanceKm.toFixed(1)} km</span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-ink-300">Distance unavailable</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span>{p.hoursLabel ? `Hours: ${p.hoursLabel}` : 'Opening hours not published'}</span>
                </div>
                <p className="mt-1.5 text-[0.7rem] text-ink-400">{p.availabilityPlaceholder}</p>
                {p.sourceLabel ? (
                  <p className="mt-1 text-[0.68rem] text-ink-500">
                    Source: {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{p.sourceLabel}</a> : p.sourceLabel}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.route ? (
                    <a href={directionsUrl({ destination: p.address || p.name, origin: patientOrigin && typeof patientOrigin.lat === 'number' ? { label: patientOrigin.label, lat: patientOrigin.lat, lng: patientOrigin.lng } : undefined, mode: 'driving' })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Directions</a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.78rem] text-ink-400">Directions unavailable</span>
                  )}
                  <Link to={ROUTES.pharmacies} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Browse pharmacies</Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Labs — real sourced records, no invented tests */}
        {result.labs.length > 0 ? (
          <div className="space-y-2">
            {result.labs.map((l) => (
              <article key={l.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{l.name}</h4>
                    <p className="truncate text-xs text-ink-400">{l.address}</p>
                  </div>
                  {l.distanceAvailable && l.distanceKm > 0 ? (
                    <span className="shrink-0 rounded-full border border-brand-400/25 bg-brand-400/10 px-2 py-0.5 text-[0.6rem] font-semibold text-brand-100">{l.distanceKm.toFixed(1)} km</span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold text-ink-300">Distance unavailable</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span>{l.hoursLabel ? `Hours: ${l.hoursLabel}` : 'Opening hours not published'}</span>
                  {l.homeCollectionAvailable ? <span className="text-brand-200">Home collection</span> : null}
                </div>
                {l.testsOffered.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.testsOffered.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.66rem] text-ink-300">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[0.7rem] text-ink-400">Test menu and home collection are not published for this facility.</p>
                )}
                {l.sourceLabel ? (
                  <p className="mt-1 text-[0.68rem] text-ink-500">
                    Source: {l.sourceUrl ? <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{l.sourceLabel}</a> : l.sourceLabel}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.route ? (
                    <a href={directionsUrl({ destination: l.address || l.name, origin: patientOrigin && typeof patientOrigin.lat === 'number' ? { label: patientOrigin.label, lat: patientOrigin.lat, lng: patientOrigin.lng } : undefined, mode: 'driving' })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Directions</a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.78rem] text-ink-400">Directions unavailable</span>
                  )}
                  <Link to={ROUTES.labs} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Browse labs</Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Blood centres — real sourced records, no invented stock */}
        {result.bloodCentres.length > 0 ? (
          <div className="space-y-2">
            {result.bloodCentres.map((b) => (
              <article key={b.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="break-words text-sm font-semibold text-white">{b.name}</h4>
                    <p className="break-words text-xs text-ink-400">{b.address}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-rose-400/25 bg-rose-500/12 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-rose-100">Blood centre</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  {b.ownership ? <span>{b.ownership}</span> : null}
                  {b.phone ? <span>Phone: {b.phone}</span> : null}
                  {b.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {b.route.distanceKm.toFixed(1)} km</span> : null}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-ink-400">
                  {b.stockSource === 'live' ? 'Live stock available' : 'Live stock not integrated — confirm current availability with the centre.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.phone ? <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90">Call centre</a> : null}
                  <a href={buildDirectionsUrl({ name: b.name, address: b.address, locality: b.locality }) ?? buildPlaceSearchUrl({ name: b.name, address: b.address, locality: b.locality }) ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15">Directions</a>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Medicines */}
        {result.medicines.length > 0 ? (
          <div className="space-y-2">
            {result.medicines.map((m) => (
              <article key={m.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">{m.name}</h4>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', m.prescriptionRequired ? 'border-amber-400/30 bg-amber-500/12 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200')}>
                    {m.prescriptionRequired ? 'Prescription' : 'OTC'}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-6 text-ink-200">{m.commonPurpose}</p>
                <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/8 p-2.5 text-[0.74rem] leading-5 text-amber-100">
                  <span className="font-semibold">Safety:</span> {m.importantSafetyInfo}
                </p>
              </article>
            ))}
          </div>
        ) : null}

        {/* Medical report */}
        {result.medicalReport ? (
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
            <h4 className="text-sm font-semibold text-white">{result.medicalReport.reportTitle}</h4>
            <p className="mt-1.5 text-[0.8rem] leading-6 text-ink-200">{result.medicalReport.summary}</p>
            {result.medicalReport.importantObservations.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {result.medicalReport.importantObservations.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.78rem] leading-5 text-ink-300"><IconArrowRight width={11} height={11} className="mt-1 shrink-0 text-brand-300" aria-hidden /> <span>{o}</span></li>
                ))}
              </ul>
            ) : null}
            {result.medicalReport.valuesRequiringAttention.length > 0 ? (
              <div className="mt-2.5 space-y-1.5">
                {result.medicalReport.valuesRequiringAttention.map((v) => (
                  <div key={v.label} className="flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-500/8 px-2.5 py-1.5 text-[0.76rem]">
                    <span className="text-ink-200">{v.label}</span>
                    <span className="font-semibold text-amber-100">{v.value} <span className="text-ink-400">({v.range})</span></span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-[0.7rem] italic text-ink-400">{result.medicalReport.recommendedNextAction}</p>
          </div>
        ) : null}

        {/* Recovery tracker */}
        {result.recovery ? (
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">{result.recovery.conditionLabel}</h4>
              <span className="text-[0.72rem] text-ink-300">Streak: {result.recovery.streakDays} days</span>
            </div>
            <p className="mt-1 text-[0.76rem] text-ink-400">{result.recovery.followUpReminderPlaceholder}</p>
          </div>
        ) : null}

        {/* Warnings */}
        {result.warnings.length > 0 ? (
          <div className="space-y-1">
            {result.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/8 p-2.5 text-[0.76rem] leading-5 text-amber-100"><IconShield width={13} height={13} className="mt-0.5 shrink-0" aria-hidden /> <span>{w}</span></p>
            ))}
          </div>
        ) : null}

        {/* Actions */}
        {result.actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {result.actions.map((a, i) => <ResultAction key={i} action={a} />)}
          </div>
        ) : null}

        {/* Suggested replies */}
        {result.suggestedReplies.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-white/8 pt-3">
            {result.suggestedReplies.map((r) => (
              <button key={r} type="button" onClick={() => onReply(r)} className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1.5 text-[0.76rem] font-medium text-brand-100 transition hover:-translate-y-0.5 hover:bg-brand-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                {r} <IconArrowRight width={11} height={11} aria-hidden />
              </button>
            ))}
          </div>
        ) : null}

        {/* Sources */}
        {result.sources.length > 0 ? (
          <p className="text-[0.66rem] text-ink-400">Source: {result.sources.join(' · ')}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Message bubble
 * ------------------------------------------------------------------------- */

function MessageBubble({ message, onReply, focusTopic, patientOrigin }: { message: AgentMessage; onReply: (r: string) => void; focusTopic?: string; patientOrigin?: { label: string; lat?: number; lng?: number } }) {
  const isUser = message.role === 'user';
  if (message.id === 'welcome') {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[85%] gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-gradient-to-br from-brand-500/35 to-accent-500/20 text-white">
            <IconSparkle width={15} height={15} aria-hidden />
          </span>
          <div className="rounded-[1.1rem] rounded-tl-md border border-white/10 bg-white/5 px-4 py-2.5">
            <p className="text-[0.86rem] leading-6 text-ink-200">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('flex max-w-[88%] gap-2.5', isUser && 'flex-row-reverse')}>
        <span className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border text-white',
          isUser ? 'border-brand-400/30 bg-gradient-to-br from-brand-500 to-accent-500' : 'border-brand-400/30 bg-gradient-to-br from-brand-500/35 to-accent-500/20'
        )}>
          {isUser ? <span className="text-[0.7rem] font-bold">You</span> : <IconSparkle width={15} height={15} aria-hidden />}
        </span>
        <div className={cn('min-w-0', isUser && 'flex flex-col items-end')}>
          <div className={cn(
            'rounded-[1.1rem] border px-4 py-2.5',
            isUser ? 'rounded-tr-md border-brand-400/20 bg-gradient-to-br from-brand-500/20 to-accent-500/12' : 'rounded-tl-md border-white/10 bg-white/5'
          )}>
            {message.documents.length > 0 ? <div className="mb-2"><DocumentChips documents={message.documents} /></div> : null}
            <p className="text-[0.86rem] leading-6 text-ink-100">{message.content}</p>
          </div>
          {message.result ? <ResultCard result={message.result} onReply={onReply} focusTopic={focusTopic} patientOrigin={patientOrigin} /> : null}
          <span className="mt-1 px-1 text-[0.62rem] text-ink-400">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
 * Welcome state with suggested prompts
 * ------------------------------------------------------------------------- */

function WelcomeState({ prompts, onPick }: { prompts: { label: string }[]; onPick: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-brand-400/30 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-white">
        <IconSparkle width={26} height={26} aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-white">CareLink AI Command Center</h2>
        <p className="mx-auto max-w-md text-[0.86rem] leading-6 text-ink-300">
          Ask about symptoms, medicines, reports, doctors or nearby care. CareLink helps you understand what to do next — guidance, never a diagnosis.
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button key={p.label} type="button" onClick={() => onPick(p.label)} className="surface-panel group flex items-center justify-between gap-2 rounded-[1rem] border border-white/10 px-4 py-3 text-left text-[0.84rem] font-medium text-ink-100 transition hover:-translate-y-0.5 hover:border-brand-400/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
            <span>{p.label}</span>
            <IconArrowRight width={14} height={14} className="shrink-0 text-brand-300 transition group-hover:translate-x-0.5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Sticky composer
 * ------------------------------------------------------------------------- */

function ChatComposer({
  value, onChange, onSubmit, disabled, busy, documents, onFiles, onRemoveDoc, recoveryCheckIn,
  locationLabel, locationState, onUseLocation, onClearLocation, onPickPrompt,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Disables the Send button (empty/invalid draft). */
  disabled: boolean;
  /** True only while a request is in flight — the real gate for the prompt menu. */
  busy: boolean;
  documents: HealthDocument[];
  onFiles: (files: FileList | null) => void;
  onRemoveDoc: (id: string) => void;
  recoveryCheckIn: (trend: RecoveryTrend, note?: string) => void;
  locationLabel: string;
  locationState: { permission: string; isResolving: boolean; hasCoordinates: boolean };
  onUseLocation: () => void;
  onClearLocation: () => void;
  /** Runs the SAME submit pipeline as Send/Enter — a prompt is executed, not just inserted. */
  onPickPrompt: (prompt: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="sticky bottom-0 z-20 border-t border-white/8 bg-slate-950/80 px-3 py-3 backdrop-blur-2xl sm:px-4"
    >
      {documents.length > 0 ? (
        <div className="mb-2 max-h-32 overflow-y-auto"><DocumentChips documents={documents} onRemove={onRemoveDoc} /></div>
      ) : null}
      <div className="mx-auto flex max-w-3xl items-end gap-1.5 rounded-[1.1rem] border border-white/12 bg-slate-950/55 p-2 focus-within:border-brand-400/45">
        <div className="flex shrink-0 items-center gap-1.5 pl-1">
          <label className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40">
            <IconPaperclip width={16} height={16} aria-hidden />
            <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} aria-label="Upload report, prescription, or image" />
          </label>
          <label className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40">
            <IconCamera width={16} height={16} aria-hidden />
            <input ref={cameraRef} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} aria-label="Scan or capture document" />
          </label>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything about your health…"
          rows={1}
          aria-label="Ask CareLink AI"
          className="agent-composer max-h-[120px] min-h-[2.75rem] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm text-white placeholder:text-ink-400 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => recoveryCheckIn('better')} aria-label="Mark feeling better" title="Recovery: better" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
            <IconHeart width={16} height={16} aria-hidden />
          </button>
          <button type="button" disabled aria-label="Voice input (not yet available)" title="Voice input is not yet available" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 disabled:cursor-not-allowed disabled:opacity-40">
            <IconMic width={16} height={16} aria-hidden />
          </button>
          <QuickPromptMenu onPick={onPickPrompt} disabled={busy} />
          <button type="submit" disabled={disabled} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:cursor-not-allowed disabled:opacity-40">
            <IconSend width={16} height={16} />
          </button>
        </div>
      </div>
      <p className="mx-auto mt-1.5 flex max-w-3xl flex-wrap items-center justify-center gap-1.5 text-[0.62rem] text-ink-400">
        <button
          type="button"
          onClick={locationState.hasCoordinates ? onClearLocation : onUseLocation}
          disabled={locationState.isResolving}
          title={locationState.hasCoordinates ? 'Using your current location — click to reset' : 'Share my location for nearby care'}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 font-semibold text-ink-200 transition hover:border-brand-400/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50"
        >
          <IconLocation width={11} height={11} aria-hidden />
          {locationState.isResolving ? 'Locating…' : locationLabel}
        </button>
        <span className="mx-1 opacity-40">·</span>
        <span className="inline-flex items-center gap-1.5">
          <IconShield width={11} height={11} aria-hidden /> Guidance, not a diagnosis · In an emergency, call your local emergency number.
        </span>
      </p>
    </form>
  );
}

/* ----------------------------------------------------------------------------
 * Suggested AI tools (controlled, Step 17 §25–§28)
 * ------------------------------------------------------------------------- */

function ToolSuggestions({
  suggestions,
  pending,
  onRun,
  onConfirm,
  onCancel,
  error,
}: {
  suggestions: AIToolSuggestion[];
  pending: AIToolSuggestion | null;
  onRun: (s: AIToolSuggestion) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  if (suggestions.length === 0 && !pending) return null;
  return (
    <div className="space-y-2 px-3 pb-2 sm:px-4">
      {error ? (
        <p role="alert" className="rounded-[0.8rem] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[0.76rem] text-rose-100">
          {error}
        </p>
      ) : null}

      {pending ? (
        <div className="rounded-[1rem] border border-brand-400/30 bg-brand-500/10 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">Confirm with CareLink</p>
          <p className="mt-1 text-sm font-medium text-white">{pending.label}</p>
          <p className="mt-1 text-[0.82rem] leading-5 text-ink-200">{pending.summary}</p>
          {pending.kind === 'createAppointment' ? (
            <p className="mt-1 text-[0.7rem] leading-5 text-ink-400">
              Your account will receive a real appointment record only if you confirm. Please verify the doctor, date,
              and time before proceeding.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onConfirm} className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-1.5 text-[0.8rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50">
              Confirm
            </button>
            <button type="button" onClick={onCancel} className="rounded-full border border-white/12 bg-white/8 px-4 py-1.5 text-[0.8rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {pending ? null : (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => onRun(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              <IconSparkle width={12} height={12} aria-hidden />
              {s.label}
              {s.requiresConfirmation ? <span className="text-[0.6rem] uppercase tracking-[0.14em] text-brand-200">Confirm</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Quick-prompt (three-dot) menu
 * ------------------------------------------------------------------------- */

/**
 * The chatbot quick-prompt menu, opened from the three-dot button near the
 * composer. Separate from the global navigation hamburger.
 *
 * Accessibility: it is a real `menu` with `menuitem` children (each one performs
 * an action rather than navigating), closes on outside click / Escape /
 * selection, and keeps focus on the trigger when dismissed.
 *
 * Selecting a prompt runs the SAME submission pipeline as the composer — the
 * parent hands `onPick` straight to `sendMessage`, so the user never has to press
 * Send again and a request is never sent twice.
 */
function QuickPromptMenu({ onPick, disabled }: { onPick: (prompt: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open quick prompts"
        title="Quick prompts"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
      >
        <span className="flex flex-col gap-[3px]" aria-hidden>
          <span className="size-1 rounded-full bg-current" />
          <span className="size-1 rounded-full bg-current" />
          <span className="size-1 rounded-full bg-current" />
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Quick prompts"
          className="absolute bottom-full right-0 z-50 mb-2 max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-[1rem] border border-white/12 bg-slate-950/95 p-1.5 shadow-[0_24px_60px_-20px_rgba(2,6,23,0.8)] backdrop-blur-2xl"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Quick prompts</p>
          {QUICK_PROMPT_ACTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onPick(item.label);
              }}
              className="flex w-full items-start gap-2.5 rounded-[0.7rem] px-2.5 py-2 text-left text-[0.82rem] text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconArrowRight width={13} height={13} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                <span className="mt-0.5 block text-[0.7rem] text-ink-400">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Page header
 * ------------------------------------------------------------------------- */

function ChatHeader({
  language, onLanguage, profiles, activeProfileId, onProfile, onClear,
}: {
  language: AgentLanguage;
  onLanguage: (l: AgentLanguage) => void;
  profiles: { id: string; label: string }[];
  activeProfileId: string;
  onProfile: (id: string) => void;
  onClear: () => void;
}) {
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    if (!langOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setLangOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [langOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/8 bg-slate-950/80 px-3 py-2.5 backdrop-blur-2xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Shared global navigation — identical entry point to every other route. */}
        <GlobalNavigation />
        <Link to={ROUTES.home} aria-label="CareLink.AI home" className="flex min-w-0 items-center gap-2.5 rounded-full pr-1 transition hover:opacity-90">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-brand-400/30 bg-gradient-to-br from-brand-500/35 to-accent-500/20 text-white">
            <IconSparkle width={17} height={17} aria-hidden />
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-[0.92rem] font-semibold text-white">CareLink.AI</span>
            <span className="block truncate text-[0.68rem] text-ink-300">Your healthcare command center</span>
          </span>
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Family profile */}
        <div className="relative hidden sm:block">
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.72rem] font-semibold text-ink-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
              <IconFamily width={12} height={12} aria-hidden /> {profiles.find((p) => p.id === activeProfileId)?.label ?? 'Self'}
              <IconArrowRight width={10} height={10} className="rotate-90" aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-[0.7rem] border border-white/10 bg-slate-950/95 p-1 backdrop-blur-xl">
              {profiles.map((p) => (
                <button key={p.id} type="button" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); onProfile(p.id); }} className={cn('block w-full rounded-[0.5rem] px-3 py-1.5 text-left text-[0.78rem] transition hover:bg-white/8', activeProfileId === p.id ? 'text-brand-200' : 'text-ink-200')}>{p.label}</button>
              ))}
            </div>
          </details>
        </div>
        {/* Language */}
        <div className="relative">
          <button type="button" onClick={() => setLangOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={langOpen} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.72rem] font-semibold text-ink-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
            <IconGlobe width={12} height={12} aria-hidden /> {LANGUAGE_LABELS[language]}
            <IconArrowRight width={10} height={10} className="rotate-90" aria-hidden />
          </button>
          {langOpen ? (
            <div role="listbox" className="absolute right-0 top-full z-40 mt-1 w-36 overflow-hidden rounded-[0.7rem] border border-white/10 bg-slate-950/95 p-1 backdrop-blur-xl">
              {(Object.keys(LANGUAGE_LABELS) as AgentLanguage[]).map((l) => (
                <button key={l} role="option" aria-selected={language === l} type="button" onClick={() => { onLanguage(l); setLangOpen(false); }} className={cn('block w-full rounded-[0.5rem] px-3 py-1.5 text-left text-[0.78rem] transition hover:bg-white/8', language === l ? 'text-brand-200' : 'text-ink-200')}>{LANGUAGE_LABELS[l]}</button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onClear} aria-label="Start new conversation" title="New conversation" className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
          <IconPlus width={16} height={16} aria-hidden />
        </button>
        <Link to={ROUTES.agent} aria-label="Open full command center workspace" className="hidden size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 lg:flex">
          <IconHospital width={16} height={16} aria-hidden />
        </Link>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------------------
 * AIChatPage
 * ------------------------------------------------------------------------- */

export function AIChatPage() {
  const conv = useAgentConversation();
  const locationCtx = useOptionalLocationContext();
  const navContext = useOptionalNavigationContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Disease/specialty topic propagated from the conversation context so hospital
  // deep-links pre-filter to relevant doctors. Coordinates are passed only when a
  // real location is available — never fabricated.
  const focusTopic = navContext.diseaseTopic ?? navContext.requestedSpecialty ?? hospitalFocusTopic(conv.context);
  const patientOrigin = locationCtx?.location && typeof locationCtx.location.lat === 'number'
    ? { label: locationCtx.location.label, lat: locationCtx.location.lat, lng: locationCtx.location.lng }
    : undefined;

  // Drain any pending handoff from the Home hero on mount.
  useEffect(() => {
    conv.drainHandoff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link prompts from the navigation drawer (e.g. /ai?prompt=recovery).
  // The prompt is EXECUTED through the real conversation pipeline, then the
  // parameter is removed so a refresh or Back does not replay it.
  const deepLinkPrompt = searchParams.get('prompt');
  useEffect(() => {
    if (!deepLinkPrompt) return;
    void conv.sendMessage(deepLinkPrompt);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('prompt');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPrompt]);

  // Scroll to the latest message whenever messages/status change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv.messages, conv.status]);

  const showWelcome = conv.messages.length <= 1 && conv.status !== 'thinking';
  const latestMessage = conv.messages[conv.messages.length - 1];
  const latestUserMessage = [...conv.messages].reverse().find((message) => message.role === 'user');
  const canRetryLastMessage = latestMessage?.role === 'assistant'
    && latestMessage.result?.provenance?.mode === 'unavailable'
    && latestUserMessage?.documents.length === 0;

  const handleSubmit = () => {
    const value = text.trim();
    if (!value && conv.documents.length === 0) return;
    setText('');
    void conv.sendMessage(value || 'uploaded document');
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added = conv.addDocuments(Array.from(files));
    added.forEach((d) => conv.runDocumentPipeline(d.id));
  };

  const handlePickPrompt = (prompt: string) => {
    setText('');
    void conv.sendMessage(prompt);
  };

  // Controlled AI tools: reads run immediately via the RLS repository, and
  // mutations are parked for explicit user confirmation (never auto-executed).
  const handleToolRun = (suggestion: AIToolSuggestion) => {
    conv.requestTool(suggestion);
  };

  const isEmergency = conv.status === 'emergency';

  return (
    <MotionConfig reducedMotion="user">
    <div className={cn('agent-shell flex h-[100dvh] flex-col overflow-hidden bg-transparent', isEmergency && 'ring-1 ring-inset ring-rose-500/30')}>
      <a
        href="#ai-chat-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:border focus:border-white/15 focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to conversation
      </a>

      <ChatHeader
        language={conv.language}
        onLanguage={conv.setLanguage}
        profiles={conv.patientProfiles}
        activeProfileId={conv.activeProfileId}
        onProfile={conv.setActiveProfileId}
        onClear={conv.clearConversation}
      />

      {/* Emergency banner */}
      <AnimatePresence>
        {isEmergency && conv.result ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            aria-live="assertive"
            className="agent-emergency-ring overflow-hidden border-b border-rose-400/30 bg-gradient-to-r from-rose-500/20 to-amber-500/15"
          >
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <IconEmergency width={18} height={18} className="shrink-0 text-rose-200" aria-hidden />
              <p className="text-[0.82rem] font-semibold text-rose-100">{conv.result.summary} — treat this as urgent. Call your local emergency number now.</p>
              <a href={primaryEmergencyContact('in').href} className="ml-auto shrink-0 rounded-full bg-rose-500 px-3 py-1.5 text-[0.78rem] font-bold text-white transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60">Call {primaryEmergencyContact('in').phone}</a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div id="ai-chat-main" className="agent-scroll min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
          {/* Context memory chip */}
          {conv.context.hasContext ? (
            <div className="mb-3 flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-500/8 px-3 py-1.5 text-[0.7rem] text-brand-100">
              <IconSparkle width={12} height={12} aria-hidden />
              <span>Remembered context: {conv.context.summary || 'previous conversation'}</span>
            </div>
          ) : null}

          {showWelcome ? (
            <WelcomeState prompts={conv.suggestedPrompts} onPick={handlePickPrompt} />
          ) : (
            <div className="space-y-4">
              {conv.messages.map((m) => (
                <MessageBubble key={m.id} message={m} onReply={handlePickPrompt} focusTopic={focusTopic} patientOrigin={patientOrigin} />
              ))}
              {canRetryLastMessage && latestUserMessage ? (
                <button
                  type="button"
                  onClick={() => void conv.sendMessage(latestUserMessage.content)}
                  disabled={conv.isThinking}
                  className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50"
                >
                  Retry last message
                </button>
              ) : null}
              {conv.isThinking ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="flex items-center gap-2.5 rounded-[1.1rem] rounded-tl-md border border-white/10 bg-white/5 px-4 py-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-white"><IconSparkle width={13} height={13} aria-hidden /></span>
                    <span className="flex gap-1">
                      <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
                      <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
                      <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
                    </span>
                    <span className="text-sm text-ink-300">CareLink is thinking…</span>
                    <button
                      type="button"
                      onClick={conv.stop}
                      className="ml-1 inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.7rem] font-semibold text-ink-200 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
                    >
                      Stop
                    </button>
                  </div>
                </motion.div>
              ) : null}
              {conv.error ? (
                <div role="alert" className="rounded-[0.85rem] border border-amber-400/25 bg-amber-500/8 p-3.5">
                  <p className="text-sm text-amber-100">{conv.error}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Step 17 — controlled AI tools (reads + confirmable mutations) */}
      <ToolSuggestions
        suggestions={conv.toolSuggestions}
        pending={conv.pendingTool}
        onRun={handleToolRun}
        onConfirm={() => void conv.confirmTool()}
        onCancel={conv.cancelTool}
        error={conv.toolError}
      />

      {/* Step 11 — secure document analysis (additive, non-breaking) */}
      <div className="border-t border-white/10 bg-slate-950/40 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <AgentDocumentAnalysisPanel
            activeProfileId={conv.activeProfileId === 'self' ? null : conv.activeProfileId}
            onFollowUp={(q) => void conv.sendMessage(q)}
          />
        </div>
      </div>

      <ChatComposer
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        disabled={conv.isThinking || (!text.trim() && conv.documents.length === 0)}
        busy={conv.isThinking}
        documents={conv.documents}
        onFiles={handleFiles}
        onRemoveDoc={conv.removeDocument}
        recoveryCheckIn={conv.recoveryCheckIn}
        onPickPrompt={handlePickPrompt}
        locationLabel={locationCtx?.location?.label ?? 'Set your location'}
        locationState={{
          permission: locationCtx?.permission ?? 'unknown',
          isResolving: locationCtx?.isResolving ?? false,
          hasCoordinates: !!(locationCtx?.location && typeof locationCtx.location.lat === 'number'),
        }}
        onUseLocation={() => locationCtx?.requestCurrentLocation()}
        onClearLocation={() => locationCtx?.clearLocation()}
      />
    </div>
    </MotionConfig>
  );
}

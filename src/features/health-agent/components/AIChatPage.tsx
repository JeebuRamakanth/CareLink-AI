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
import { Link } from 'react-router-dom';
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
import { AgentDocumentAnalysisPanel } from './AgentDocumentAnalysisPanel';
import {
  ACCEPT_ATTR,
  LANGUAGE_LABELS,
  formatBytes,
  kindLabel,
  statusLabel,
} from '../utils/helpers';
import { explainRecommendation } from '../services/recommendationRanking';
import '../../../components/agent/agent.css';
import type {
  AgentAction,
  AgentLanguage,
  AgentMessage,
  AgentResult,
  HealthDocument,
  RecoveryTrend,
} from '../types';

/* ----------------------------------------------------------------------------
 * Small presentational pieces
 * ------------------------------------------------------------------------- */

const LOCATION_LABEL = 'Hyderabad · 500032';

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
  const classes =
    action.type === 'call-emergency'
      ? 'agent-emergency-ring bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:opacity-90'
      : action.type === 'open-command-center' || action.type === 'book-appointment'
        ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:opacity-90'
        : 'border border-white/12 bg-white/8 text-ink-100 hover:bg-white/15';
  if (!action.href) return null;
  const external = action.href.startsWith('http') || action.href.startsWith('tel:') || action.href.startsWith('mailto:');
  return (
    <a
      href={action.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50', classes)}
      aria-label={action.label}
    >
      <ActionIcon type={action.icon ?? action.type} />
      <span>{action.label}</span>
    </a>
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

function ResultCard({ result, onReply }: { result: AgentResult; onReply: (r: string) => void }) {
  const isEmergency = result.urgency === 'emergency';
  return (
    <div className={cn(
      'mt-2 overflow-hidden rounded-[1.1rem] border backdrop-blur-xl',
      isEmergency ? 'border-rose-400/40 bg-gradient-to-br from-rose-500/12 to-amber-500/8' : 'border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]'
    )}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <Badge tone={isEmergency ? 'warning' : result.urgency === 'attention' ? 'brand' : 'neutral'}>{result.urgency}</Badge>
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink-400">{result.meta.confidence} confidence</span>
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
                    {h.isOpen ? 'Open' : 'Closed'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  <span className="inline-flex items-center gap-1"><IconStar width={12} height={12} className="text-amber-300" aria-hidden /> <span className="font-semibold text-white">{h.rating.toFixed(1)}</span> · {h.reviewCount} reviews</span>
                  {h.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {h.distanceKm.toFixed(1)} km · ~{h.estimatedTravelTimeMin} min</span> : null}
                  {h.hasEmergency ? <span className="inline-flex items-center gap-1 text-rose-200"><IconEmergency width={12} height={12} aria-hidden /> Emergency</span> : null}
                </div>
                {h.recommendationScore != null ? (
                  <p className="mt-2 text-[0.72rem] leading-5 text-ink-300">{explainRecommendation(i + 1, { recommendationScore: h.recommendationScore, matchedReasons: h.matchedReasons ?? [], topReason: h.topReason })}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <a href={`${ROUTES.hospitals}/${h.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Hospital</a>
                    <a href={`${ROUTES.hospitals}/${h.detailSlug}?focus=All`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Doctors</a>
                    <a href={`${ROUTES.appointments}?hosp=${h.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book</a>
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
                  <span className="inline-flex items-center gap-1"><IconStar width={12} height={12} className="text-amber-300" aria-hidden /> <span className="font-semibold text-white">{d.rating.toFixed(1)}</span> · {d.yearsOfExperience} yrs</span>
                  <span className="text-emerald-200">{d.nextAvailableSlot}</span>
                  {d.acceptsNewPatients ? <span className="text-ink-400">Accepts new patients</span> : null}
                </div>
                {d.recommendationScore != null ? (
                  <p className="mt-2 text-[0.72rem] leading-5 text-ink-300">{explainRecommendation(i + 1, { recommendationScore: d.recommendationScore, matchedReasons: d.matchedReasons ?? [], topReason: d.topReason })}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <a href={`${ROUTES.doctors}/${d.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Profile</a>
                    <a href={`${ROUTES.appointments}?doc=${d.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book Appointment</a>
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
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', p.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300')}>{p.isOpen ? 'Open' : 'Closed'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  {p.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {p.distanceKm.toFixed(1)} km</span> : null}
                  {p.estimatedPrice ? <span className="text-brand-200">{p.estimatedPrice}</span> : null}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-ink-400">{p.availabilityPlaceholder}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={ROUTES.hospitals} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Pharmacy</a>
                  <a href={`tel:`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Call</a>
                  <a href={ROUTES.hospitals} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Directions</a>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Labs */}
        {result.labs.length > 0 ? (
          <div className="space-y-2">
            {result.labs.map((l) => (
              <article key={l.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{l.name}</h4>
                    <p className="truncate text-xs text-ink-400">{l.address}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', l.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300')}>{l.isOpen ? 'Open' : 'Closed'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  {l.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {l.distanceKm <= 0 ? 'Home collection' : `${l.distanceKm.toFixed(1)} km`}</span> : null}
                  {l.homeCollectionAvailable ? <span className="text-brand-200">Home collection</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.testsOffered.slice(0, 4).map((t) => (
                    <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.66rem] text-ink-300">{t}</span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={ROUTES.hospitals} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Lab</a>
                  <a href={`${ROUTES.appointments}?lab=${l.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book Test</a>
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

function MessageBubble({ message, onReply }: { message: AgentMessage; onReply: (r: string) => void }) {
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
          {message.result ? <ResultCard result={message.result} onReply={onReply} /> : null}
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
  value, onChange, onSubmit, disabled, documents, onFiles, onRemoveDoc, recoveryCheckIn,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  documents: HealthDocument[];
  onFiles: (files: FileList | null) => void;
  onRemoveDoc: (id: string) => void;
  recoveryCheckIn: (trend: RecoveryTrend, note?: string) => void;
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
          <button type="button" disabled aria-label="Voice input (coming soon)" title="Voice input (coming soon)" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 disabled:opacity-40">
            <IconMic width={16} height={16} aria-hidden />
          </button>
          <button type="submit" disabled={disabled} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:cursor-not-allowed disabled:opacity-40">
            <IconSend width={16} height={16} />
          </button>
        </div>
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl text-center text-[0.62rem] text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <IconLocation width={11} height={11} aria-hidden /> {LOCATION_LABEL}
          <span className="mx-1 opacity-40">·</span>
          <IconShield width={11} height={11} aria-hidden /> Guidance, not a diagnosis · In an emergency, call your local emergency number.
        </span>
      </p>
    </form>
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
        <Link to={ROUTES.home} aria-label="Back to home" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
          <IconArrowRight width={16} height={16} className="rotate-180" aria-hidden />
        </Link>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-brand-400/30 bg-gradient-to-br from-brand-500/35 to-accent-500/20 text-white">
          <IconSparkle width={17} height={17} aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-1 text-[0.92rem] font-semibold text-white"><span aria-hidden>✦</span> CareLink AI</p>
          <p className="truncate text-[0.68rem] text-ink-300">Your healthcare command center</p>
        </div>
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
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drain any pending handoff from the Home hero on mount.
  useEffect(() => {
    conv.drainHandoff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to the latest message whenever messages/status change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv.messages, conv.status]);

  const showWelcome = conv.messages.length <= 1 && conv.status !== 'thinking';

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
              <a href="tel:911" className="ml-auto shrink-0 rounded-full bg-rose-500 px-3 py-1.5 text-[0.78rem] font-bold text-white transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60">Call 911</a>
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
                <MessageBubble key={m.id} message={m} onReply={handlePickPrompt} />
              ))}
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

      {/* Step 11 — secure document analysis (additive, non-breaking) */}
      <div className="border-t border-white/10 bg-slate-950/40 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <AgentDocumentAnalysisPanel activeProfileId={conv.activeProfileId === 'self' ? null : conv.activeProfileId} />
        </div>
      </div>

      <ChatComposer
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        disabled={conv.isThinking || (!text.trim() && conv.documents.length === 0)}
        documents={conv.documents}
        onFiles={handleFiles}
        onRemoveDoc={conv.removeDocument}
        recoveryCheckIn={conv.recoveryCheckIn}
      />
    </div>
    </MotionConfig>
  );
}

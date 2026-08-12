/**
 * HealthCommandCenter — the interactive CareLink AI agent surface.
 *
 * A real (mock-backed) search experience embedded directly in the Home hero:
 * text input, attachment/upload, camera + voice placeholders, quick actions,
 * loading/result/error/emergency states, and CTA actions that deep-link into
 * the existing Reviews → Hospital → Doctor → Appointment flow.
 *
 * Renders as a single premium command-center card so it drops cleanly into the
 * hero (mobile below the headline, desktop right column). Exposes an imperative
 * ref (`focus()` + `ask(prompt)`) so hero CTAs can drive the agent.
 *
 * The full workspace lives at /agent and reuses the same health-agent services.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { Badge } from '../../../components/ui/Badge';
import { ROUTES } from '../../../routes/routeConstants';
import {
  IconArrowRight,
  IconCamera,
  IconClose,
  IconEmergency,
  IconGlobe,
  IconHeart,
  IconHospital,
  IconLab,
  IconLocation,
  IconMic,
  IconPaperclip,
  IconPharmacy,
  IconPhone,
  IconPlus,
  IconReport,
  IconRoute,
  IconSend,
  IconShield,
  IconSparkle,
  IconStar,
} from '../../../components/agent/AgentIcons';
import {
  ACCEPT_ATTR,
  LANGUAGE_LABELS,
  formatBytes,
} from '../utils/helpers';
import { useHealthAgent } from '../hooks/useHealthAgent';
import type { HealthAgentStatus } from '../hooks/useHealthAgent';
import type { AgentAction, AgentLanguage, AgentResult } from '../types';

/**
 * Imperative handle the Hero exposes via ref so its CTAs can drive the agent
 * without lifting state. Keeps the agent self-contained and reusable.
 */
export interface HealthCommandCenterHandle {
  focus: () => void;
  ask: (prompt: string) => void;
}

/* ----------------------------------------------------------------------------
 * Small presentational pieces
 * ------------------------------------------------------------------------- */

function IconButton({ label, children, onClick, disabled }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition-all duration-200 hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ResultAction({ action }: { action: AgentAction }) {
  const classes =
    action.type === 'call-emergency'
      ? 'agent-emergency-ring bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:opacity-90'
      : action.type === 'open-command-center' || action.type === 'book-appointment'
        ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:opacity-90'
        : 'border border-white/12 bg-white/8 text-ink-100 hover:bg-white/15';
  const inner = (
    <>
      <ActionIcon type={action.icon ?? action.type} />
      <span>{action.label}</span>
    </>
  );
  if (action.href) {
    const external = action.href.startsWith('http') || action.href.startsWith('tel:') || action.href.startsWith('mailto:');
    return external ? (
      <a href={action.href} className={cn('inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50', classes)} aria-label={action.label}>
        {inner}
      </a>
    ) : (
      <a href={action.href} className={cn('inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50', classes)} aria-label={action.label}>
        {inner}
      </a>
    );
  }
  return null;
}

function ActionIcon({ type }: { type: AgentAction['type'] }) {
  switch (type) {
    case 'view-hospital': case 'find-hospital': return <IconHospital width={15} height={15} aria-hidden />;
    case 'view-doctor': case 'find-doctor': return <IconSparkle width={15} height={15} aria-hidden />;
    case 'call-emergency': return <IconPhone width={15} height={15} aria-hidden />;
    case 'view-appointments': case 'book-appointment': return <IconReport width={15} height={15} aria-hidden />;
    case 'get-directions': return <IconRoute width={15} height={15} aria-hidden />;
    case 'track-recovery': return <IconHeart width={15} height={15} aria-hidden />;
    default: return <IconArrowRight width={15} height={15} aria-hidden />;
  }
}

/* ----------------------------------------------------------------------------
 * Thinking state
 * ------------------------------------------------------------------------- */

function ThinkingState() {
  return (
    <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3">
      <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-white">
        <IconSparkle width={14} height={14} />
      </span>
      <span className="flex gap-1">
        <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
        <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
        <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" />
      </span>
      <span className="text-sm text-ink-300">CareLink is thinking…</span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Result card (compact home preview of the agent result)
 * ------------------------------------------------------------------------- */

function ResultPreview({ result, onReply, onReset }: { result: AgentResult; onReply: (r: string) => void; onReset: () => void }) {
  const isEmergency = result.urgency === 'emergency';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      role={isEmergency ? 'alert' : undefined}
      aria-live={isEmergency ? 'assertive' : 'polite'}
      className={cn(
        'overflow-hidden rounded-[1.25rem] border backdrop-blur-xl',
        isEmergency ? 'border-rose-400/40 bg-gradient-to-br from-rose-500/12 to-amber-500/8' : 'border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]'
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[0.8rem] border', isEmergency ? 'border-rose-400/30 bg-rose-500/15 text-rose-200' : 'border-brand-400/25 bg-brand-500/15 text-brand-100')}>
            {isEmergency ? <IconEmergency width={18} height={18} /> : <IconSparkle width={18} height={18} />}
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold leading-snug text-white">{result.summary}</h3>
            {result.explanation ? <p className="text-sm leading-6 text-ink-300">{result.explanation}</p> : null}
          </div>
        </div>
        {isEmergency ? (
          <span className="agent-emergency-ring shrink-0 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.2em] text-rose-200">
            Emergency
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <Badge tone={isEmergency ? 'warning' : result.urgency === 'attention' ? 'brand' : 'neutral'}>
          {result.urgency}
        </Badge>
        <span className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink-400">{result.meta.confidence} confidence</span>
        {result.isDemoData ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-amber-200" title="No external provider configured — results are illustrative demo data.">
            Demo data
          </span>
        ) : null}
        {result.meta.disclaimer ? (
          <span className="inline-flex items-center gap-1 text-[0.7rem] text-ink-400">
            <IconShield width={12} height={12} aria-hidden /> Guidance, not a diagnosis
          </span>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {/* Emergency contacts */}
        {result.emergency ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {result.emergency.contacts.map((c) => (
              <a key={c.label} href={c.href} className="agent-emergency-ring flex items-center justify-between gap-2 rounded-[0.85rem] border border-rose-400/40 bg-gradient-to-r from-rose-500/90 to-amber-500/90 px-4 py-3 text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60">
                <span className="flex items-center gap-2 text-sm font-semibold"><IconPhone width={16} height={16} aria-hidden /> {c.label}</span>
                {c.phone ? <span className="text-sm font-bold">{c.phone}</span> : null}
              </a>
            ))}
          </div>
        ) : null}

        {/* Hospitals */}
        {result.hospitals.length > 0 ? (
          <div className="space-y-2">
            {result.hospitals.slice(0, 2).map((h) => (
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
                  <span className="inline-flex items-center gap-1"><IconStar width={12} height={12} className="text-amber-300" aria-hidden /> <span className="font-semibold text-white">{h.rating.toFixed(1)}</span></span>
                  {h.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {h.distanceKm.toFixed(1)} km · ~{h.estimatedTravelTimeMin} min</span> : null}
                </div>
                {h.rank && h.rank.reasons.length > 0 ? (
                  <p className="mt-1.5 text-[0.68rem] leading-4 text-ink-400" title="Why this result?">
                    <span className="font-semibold text-ink-300">Why: </span>{h.rank.reasons.map((r) => r.label).join(' · ')}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`${ROUTES.hospitals}/${h.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Hospital</a>
                  <a href={ROUTES.appointments} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book</a>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Doctors */}
        {result.doctors.length > 0 ? (
          <div className="space-y-2">
            {result.doctors.slice(0, 2).map((d) => (
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
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`${ROUTES.doctors}/${d.detailSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">View Profile</a>
                  <a href={ROUTES.appointments} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">Book Appointment</a>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Pharmacies */}
        {result.pharmacies.length > 0 ? (
          <div className="space-y-2">
            {result.pharmacies.slice(0, 2).map((p) => (
              <article key={p.id} className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white">{p.name}</h4>
                    <p className="truncate text-xs text-ink-400">{p.address}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]', p.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300')}>{p.isOpen ? 'Open' : 'Closed'}</span>
                </div>
                <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-xs text-ink-300">
                  {p.route ? <span className="inline-flex items-center gap-1"><IconRoute width={12} height={12} aria-hidden /> {p.distanceKm.toFixed(1)} km</span> : null}
                  {p.estimatedPrice ? <span className="font-semibold text-brand-200">{p.estimatedPrice}</span> : null}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-ink-400">{p.availabilityPlaceholder}</p>
              </article>
            ))}
          </div>
        ) : null}

        {/* Next steps */}
        {result.recommendedNextSteps.length > 0 ? (
          <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/50 p-3.5">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Next step</p>
            <p className="mt-1 text-sm text-ink-100">{result.recommendedNextSteps[0]}</p>
          </div>
        ) : null}

        {/* Actions */}
        {result.actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {result.actions.slice(0, 4).map((a, i) => <ResultAction key={`${a.type}-${i}`} action={a} />)}
          </div>
        ) : null}

        {/* Suggested replies */}
        {result.suggestedReplies.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {result.suggestedReplies.slice(0, 3).map((r) => (
              <button key={r} type="button" onClick={() => onReply(r)} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-[0.76rem] font-medium text-ink-200 transition hover:-translate-y-0.5 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                {r}<IconArrowRight width={12} height={12} aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-white/8 px-4 py-2.5">
        <span className="text-[0.66rem] text-ink-400">{result.sources[0] ?? 'CareLink AI'}</span>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[0.72rem] font-semibold text-brand-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 rounded-full">
          Clear <IconClose width={12} height={12} aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
 * Attachment chips
 * ------------------------------------------------------------------------- */

function DocumentChips() {
  const { documents, removeDocument } = useHealthAgent();
  if (documents.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {documents.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/8 py-1 pl-1.5 pr-2">
          {d.kind === 'image' && d.previewUrl ? (
            <img src={d.previewUrl} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-white/8 text-ink-300"><IconReport width={12} height={12} /></span>
          )}
          <span className="max-w-[120px] truncate text-[0.72rem] text-ink-200">{d.fileName}</span>
          <span className="text-[0.6rem] text-ink-400">{formatBytes(d.fileSize)}</span>
          <button type="button" onClick={() => removeDocument(d.id)} aria-label={`Remove ${d.fileName}`} className="text-ink-400 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 rounded-full">
            <IconClose width={12} height={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------------- */

const QUICK_ACTIONS: { label: string; prompt: string; icon: typeof IconHospital }[] = [
  { label: 'Find a hospital', prompt: 'Find a hospital near me', icon: IconHospital },
  { label: 'Find a doctor', prompt: 'Find a doctor near me', icon: IconSparkle },
  { label: 'Explain my report', prompt: 'Explain this blood report', icon: IconReport },
  { label: 'Identify medicine', prompt: 'What is this tablet?', icon: IconPharmacy },
  { label: 'Find pharmacy', prompt: 'Find a pharmacy near me', icon: IconPharmacy },
  { label: 'Find lab', prompt: 'Find a diagnostic lab near me', icon: IconLab },
  { label: 'Book appointment', prompt: 'Book a doctor', icon: IconReport },
  { label: 'What should I do next?', prompt: 'What should I do next?', icon: IconHeart },
];

const LOCATION_LABEL = 'Hyderabad · 500032';

const STATUS_LABEL: Record<HealthAgentStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  processing: 'Processing',
  result: 'Guidance ready',
  error: 'Try again',
  emergency: 'Urgent',
};

function StateDot({ status }: { status: HealthAgentStatus }) {
  const tone = status === 'emergency'
    ? 'bg-rose-400'
    : status === 'error'
      ? 'bg-amber-400'
      : status === 'result'
        ? 'bg-emerald-400'
        : status === 'thinking' || status === 'processing'
          ? 'bg-brand-300'
          : 'bg-ink-400';
  return (
    <span className="relative flex size-2.5">
      {(status === 'thinking' || status === 'processing' || status === 'emergency') ? (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', tone)} />
      ) : null}
      <span className={cn('relative inline-flex size-2.5 rounded-full', tone)} />
    </span>
  );
}

export const HealthCommandCenter = forwardRef<HealthCommandCenterHandle>(function HealthCommandCenter(_props, ref) {
  const agent = useHealthAgent();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isEmergency = agent.status === 'emergency';
  const isThinking = agent.status === 'thinking' || agent.status === 'processing';
  const showResult = (agent.status === 'result' || agent.status === 'emergency') && agent.result;

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value && agent.documents.length === 0) return;
    void agent.submit(value || 'uploaded document');
    setText('');
  }, [text, agent]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added = agent.addDocuments(Array.from(files));
    added.forEach((d) => agent.runDocumentPipeline(d.id));
  };

  const handlePrompt = (prompt: string) => {
    setText('');
    void agent.submit(prompt);
  };

  const focus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Imperative handle: hero CTAs drive the agent without lifting state.
  useImperativeHandle(ref, () => ({
    focus,
    ask: (prompt: string) => {
      void agent.submit(prompt);
    },
  }), [focus, agent]);

  // Close the language menu on outside click / Escape (keyboard accessible).
  useEffect(() => {
    if (!langOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setLangOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [langOpen]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const visibleActions = actionsExpanded ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'agent-shell surface-panel relative w-full min-w-0 flex flex-col overflow-hidden rounded-[1.5rem] border p-4 backdrop-blur-2xl transition-colors duration-300 sm:p-5',
        isEmergency ? 'border-rose-400/40' : focused ? 'border-brand-400/40' : 'border-white/12'
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-500',
          isEmergency
            ? 'bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.18),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.12),transparent_40%)]'
            : 'bg-[radial-gradient(circle_at_top_right,rgba(77,132,255,0.16),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(22,182,166,0.1),transparent_40%)]'
        )}
      />

      {/* Header: ✦ CARELINK AI · "Your healthcare command center" · Guidance */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-[0.85rem] border text-white',
            isEmergency ? 'border-rose-400/30 bg-gradient-to-br from-rose-500/40 to-amber-500/25' : 'border-brand-400/30 bg-gradient-to-br from-brand-500/35 to-accent-500/20'
          )}>
            {isEmergency ? <IconEmergency width={17} height={17} aria-hidden /> : <IconSparkle width={17} height={17} aria-hidden />}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-1 text-[0.95rem] font-semibold tracking-wide text-white">
              <span aria-hidden>✦</span> CareLink AI
            </p>
            <p className="truncate text-[0.7rem] font-medium text-ink-300">Your healthcare command center</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-300 sm:inline-flex">
            <StateDot status={agent.status} /> {STATUS_LABEL[agent.status]}
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Guidance
          </span>
        </div>
      </div>

      {/* Main input: text · mic · attach · camera · send */}
      <form onSubmit={handleSubmit} className="relative mt-4 space-y-2.5">
        <div className={cn(
          'rounded-[1.1rem] border bg-slate-950/55 p-2 transition-colors duration-200',
          isEmergency ? 'border-rose-400/40' : focused ? 'border-brand-400/45' : 'border-white/12 focus-within:border-brand-400/45'
        )}>
          {agent.documents.length > 0 ? <div className="px-1 pb-2"><DocumentChips /></div> : null}
          <div className="flex items-end gap-1.5">
            <div className="flex shrink-0 items-center gap-1.5 pl-1">
              <label className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40">
                <IconPaperclip width={16} height={16} aria-hidden />
                <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple className="sr-only" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} aria-label="Upload report, prescription, or image" />
              </label>
              <label className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40">
                <IconCamera width={16} height={16} aria-hidden />
                <input ref={cameraRef} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} aria-label="Scan or capture document" />
              </label>
            </div>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about your health…"
              rows={1}
              aria-label="Ask CareLink AI"
              className="agent-composer max-h-[120px] min-h-[2.75rem] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm text-white placeholder:text-ink-400 focus:outline-none"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton label="Voice input (coming soon)" disabled><IconMic width={16} height={16} /></IconButton>
              <button type="submit" disabled={isThinking || (!text.trim() && agent.documents.length === 0)} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:cursor-not-allowed disabled:opacity-40">
                <IconSend width={16} height={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Location indicator + language + supported types */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.7rem] font-medium text-ink-200">
            <IconLocation width={12} height={12} className="text-brand-300" aria-hidden /> {LOCATION_LABEL}
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button type="button" onClick={() => setLangOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={langOpen} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.72rem] font-semibold text-ink-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                <IconGlobe width={12} height={12} aria-hidden /> {LANGUAGE_LABELS[agent.language]}
                <IconArrowRight width={10} height={10} className="rotate-90" aria-hidden />
              </button>
              {langOpen ? (
                <div role="listbox" className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-[0.7rem] border border-white/10 bg-slate-950/95 p-1 backdrop-blur-xl">
                  {(Object.keys(LANGUAGE_LABELS) as AgentLanguage[]).map((l) => (
                    <button key={l} role="option" aria-selected={agent.language === l} type="button" onClick={() => { agent.setLanguage(l); setLangOpen(false); }} className={cn('block w-full rounded-[0.5rem] px-3 py-1.5 text-left text-[0.78rem] transition hover:bg-white/8', agent.language === l ? 'text-brand-200' : 'text-ink-200')}>
                      {LANGUAGE_LABELS[l]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="hidden text-[0.62rem] text-ink-400 sm:block">JPG · PNG · PDF · DOC · max 10 MB</p>
          </div>
        </div>
      </form>

      {/* Quick actions: intelligently arranged chips with compact "More" */}
      <div className="relative mt-3">
        <div className="flex flex-wrap gap-2">
          {visibleActions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.label} type="button" onClick={() => handlePrompt(a.prompt)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.76rem] font-medium text-ink-200 transition hover:-translate-y-0.5 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                <Icon width={13} height={13} aria-hidden /> {a.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setActionsExpanded((v) => !v)} aria-expanded={actionsExpanded} className="inline-flex items-center gap-1 rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1.5 text-[0.76rem] font-semibold text-brand-100 transition hover:-translate-y-0.5 hover:bg-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
            {actionsExpanded ? 'Less' : 'More'} <IconPlus width={12} height={12} aria-hidden />
          </button>
        </div>
      </div>

      {/* Result / state panel — grows naturally without breaking the hero */}
      <div className={cn(
        'relative mt-3 overflow-hidden rounded-[1rem] border bg-slate-950/40 p-3 transition-all duration-300 sm:p-4',
        isEmergency ? 'border-rose-400/30' : 'border-white/10'
      )}>
        <AnimatePresence mode="wait">
          {agent.error ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert" className="rounded-[0.85rem] border border-amber-400/25 bg-amber-500/8 p-3.5">
              <p className="text-sm text-amber-100">{agent.error}</p>
              <button type="button" onClick={agent.reset} className="mt-2 text-[0.72rem] font-semibold text-brand-200 hover:text-white">Try again</button>
            </motion.div>
          ) : isThinking ? (
            <ThinkingState key="thinking" />
          ) : showResult && agent.result ? (
            <ResultPreview key={agent.result.id} result={agent.result} onReply={handlePrompt} onReset={agent.reset} />
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5" aria-live="polite">
              <p className="text-[0.78rem] leading-6 text-ink-300">
                Describe a symptom, upload a report, or ask for nearby care. CareLink returns structured, trustworthy guidance — never a diagnosis, always a clear next action.
              </p>
              <a href={ROUTES.agent} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3.5 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                Open full command center <IconArrowRight width={13} height={13} aria-hidden />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="relative mt-2 text-center text-[0.64rem] text-ink-400">
        <span className="inline-flex items-center gap-1"><IconShield width={11} height={11} aria-hidden /> Guidance, not a diagnosis · In an emergency, call your local emergency number.</span>
      </p>
    </motion.div>
  );
});

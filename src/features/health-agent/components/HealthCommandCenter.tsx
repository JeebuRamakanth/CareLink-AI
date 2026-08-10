/**
 * HealthCommandCenter — the interactive Home command-center entry point.
 *
 * Replaces the previous static CTA with a real (mock-backed) search experience:
 * text input, attachment/upload, camera + voice placeholders, quick prompts,
 * loading/result/error/emergency states, and CTA actions that deep-link into the
 * existing Reviews → Hospital → Doctor → Appointment flow.
 *
 * This is the compact Home surface. The full workspace lives at /agent and
 * reuses the same health-agent services.
 */

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { Section } from '../../../components/ui/Section';
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
  IconMic,
  IconPaperclip,
  IconPhone,
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
  QUICK_PROMPTS,
  formatBytes,
} from '../utils/helpers';
import { useHealthAgent } from '../hooks/useHealthAgent';
import type { AgentAction, AgentLanguage, AgentResult } from '../types';

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

function QuickPrompt({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
    >
      {label}
      <IconArrowRight width={12} height={12} aria-hidden />
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

export function HealthCommandCenter() {
  const agent = useHealthAgent();
  const [text, setText] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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

  const isThinking = agent.status === 'thinking' || agent.status === 'processing';
  const showResult = (agent.status === 'result' || agent.status === 'emergency') && agent.result;

  const capabilities = [
    { icon: IconHospital, label: 'Find hospitals' },
    { icon: IconSparkle, label: 'Match specialists' },
    { icon: IconReport, label: 'Explain reports' },
    { icon: IconHeart, label: 'Track recovery' },
  ];

  return (
    <Section
      title="Your AI healthcare command center"
      description="One intelligent interface for symptoms, doctors, hospitals, pharmacies, labs, reports, medicines, and recovery — with safe, action-oriented next steps."
      eyebrow="CareLink AI agent"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="surface-panel relative overflow-hidden border border-white/10 p-6 sm:p-8 lg:p-10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(77,132,255,0.14),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(22,182,166,0.1),transparent_38%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          {/* Left: interactive search */}
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
              <IconSparkle width={13} height={13} aria-hidden /> Command center
            </div>
            <h3 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">Ask anything. Get guided next steps.</h3>
            <p className="max-w-xl text-sm leading-7 text-ink-300 sm:text-base">
              Describe a symptom, upload a report, or ask CareLink to find care near you. The agent returns structured, trustworthy guidance — never a diagnosis, always a clear next action.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className={cn('rounded-[1.1rem] border bg-slate-950/50 p-2 transition-colors', agent.status === 'emergency' ? 'border-rose-400/40' : 'border-white/12 focus-within:border-brand-400/40')}>
                {agent.documents.length > 0 ? <div className="px-1.5 pb-2"><DocumentChips /></div> : null}
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-1.5 pl-1.5">
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
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                    placeholder="Describe your symptoms, upload a report, or ask CareLink anything…"
                    rows={1}
                    aria-label="Ask CareLink AI"
                    className="agent-composer max-h-[140px] min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-ink-400 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <IconButton label="Voice input (coming soon)" disabled><IconMic width={16} height={16} /></IconButton>
                    <button type="submit" disabled={isThinking || (!text.trim() && agent.documents.length === 0)} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:cursor-not-allowed disabled:opacity-40">
                      <IconSend width={16} height={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Language selector + supported types */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative">
                  <button type="button" onClick={() => setLangOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.74rem] font-semibold text-ink-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                    <IconGlobe width={13} height={13} aria-hidden /> {LANGUAGE_LABELS[agent.language]}
                    <IconArrowRight width={11} height={11} className="rotate-90" aria-hidden />
                  </button>
                  {langOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-[0.7rem] border border-white/10 bg-slate-950/95 p-1 backdrop-blur-xl">
                      {(Object.keys(LANGUAGE_LABELS) as AgentLanguage[]).map((l) => (
                        <button key={l} type="button" onClick={() => { agent.setLanguage(l); setLangOpen(false); }} className={cn('block w-full rounded-[0.5rem] px-3 py-1.5 text-left text-[0.78rem] transition hover:bg-white/8', agent.language === l ? 'text-brand-200' : 'text-ink-200')}>
                          {LANGUAGE_LABELS[l]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className="text-[0.66rem] text-ink-400">JPG · PNG · WEBP · PDF · DOC · DOCX · max 10 MB</p>
              </div>
            </form>

            {/* Quick prompts */}
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => <QuickPrompt key={p.label} label={p.label} onClick={() => handlePrompt(p.label)} />)}
            </div>

            <div className="flex flex-wrap gap-2">
              {capabilities.map((cap) => {
                const Icon = cap.icon;
                return (
                  <span key={cap.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200">
                    <Icon width={14} height={14} aria-hidden /> {cap.label}
                  </span>
                );
              })}
            </div>
            <p className="text-[0.7rem] text-ink-400">
              CareLink provides navigational guidance, not a medical diagnosis. In an emergency, call your local emergency number.
            </p>
          </div>

          {/* Right: result / state panel */}
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-4 sm:p-5">
            <div className="space-y-3 rounded-[1rem] border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-white">
                    <IconSparkle width={13} height={13} />
                  </span>
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-200">CareLink AI</span>
                </div>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">Guidance</span>
              </div>

              <AnimatePresence mode="wait">
                {agent.error ? (
                  <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-[0.9rem] border border-amber-400/25 bg-amber-500/8 p-3.5">
                    <p className="text-sm text-amber-100">{agent.error}</p>
                    <button type="button" onClick={agent.reset} className="mt-2 text-[0.72rem] font-semibold text-brand-200 hover:text-white">Try again</button>
                  </motion.div>
                ) : isThinking ? (
                  <ThinkingState key="thinking" />
                ) : showResult && agent.result ? (
                  <ResultPreview key={agent.result.id} result={agent.result} onReply={handlePrompt} onReset={agent.reset} />
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <div className="rounded-[0.7rem] border border-brand-400/20 bg-brand-500/10 px-3 py-2 text-sm text-white">Try: “I have severe chest pain”</div>
                    <div className="space-y-2 rounded-[0.7rem] border border-white/10 bg-white/5 p-3">
                      <div className="h-2 w-24 rounded-full bg-white/15" />
                      <div className="h-2 w-full rounded-full bg-white/10" />
                      <div className="h-2 w-4/5 rounded-full bg-white/10" />
                    </div>
                    <a href={ROUTES.agent} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50">
                      Open full command center <IconArrowRight width={14} height={14} aria-hidden />
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className="mt-3 text-center text-[0.66rem] text-ink-400">Mock preview — guided, safety-first responses with real next steps.</p>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

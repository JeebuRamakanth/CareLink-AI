/**
 * Shared building blocks for agent response cards.
 * Keeps every card visually consistent and avoids re-implementing badges,
 * disclaimers, and action buttons across the 14 card types.
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../common/cn';
import { Badge } from '../ui/Badge';
import { IconArrowRight, IconShield } from './AgentIcons';
import type { ConfidenceLevel, UrgencyLevel } from '../../services/agent/agentTypes';

/* ----------------------------------------------------------------------------
 * Card shell — framer-motion entrance, glass surface, header + optional meta
 * ------------------------------------------------------------------------- */

interface ResponseCardShellProps {
  children: ReactNode;
  accent?: 'brand' | 'accent' | 'neutral' | 'warning' | 'danger';
  className?: string;
  title: string;
  explanation?: string;
  icon?: ReactNode;
  meta?: {
    confidence?: ConfidenceLevel;
    urgency?: UrgencyLevel;
    disclaimer?: string;
  };
  /** Optional floating urgency indicator (used by symptom/emergency cards). */
  urgentBadge?: string;
}

const accentBorder: Record<NonNullable<ResponseCardShellProps['accent']>, string> = {
  brand: 'border-brand-400/25',
  accent: 'border-accent-400/25',
  neutral: 'border-white/10',
  warning: 'border-amber-400/30',
  danger: 'border-rose-400/35',
};

const accentGlow: Record<NonNullable<ResponseCardShellProps['accent']>, string> = {
  brand: 'shadow-[0_22px_70px_-28px_rgba(77,132,255,0.5)]',
  accent: 'shadow-[0_22px_70px_-28px_rgba(22,182,166,0.45)]',
  neutral: 'shadow-[var(--shadow-soft)]',
  warning: 'shadow-[0_22px_70px_-28px_rgba(245,158,11,0.45)]',
  danger: 'shadow-[0_22px_70px_-28px_rgba(239,68,68,0.5)]',
};

const iconWrap: Record<NonNullable<ResponseCardShellProps['accent']>, string> = {
  brand: 'border-brand-400/25 bg-brand-500/15 text-brand-100',
  accent: 'border-accent-400/25 bg-accent-500/15 text-accent-100',
  neutral: 'border-white/10 bg-white/10 text-ink-200',
  warning: 'border-amber-400/25 bg-amber-500/15 text-amber-200',
  danger: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
};

const urgencyTone: Record<NonNullable<UrgencyLevel>, 'neutral' | 'brand' | 'warning' | 'success'> = {
  routine: 'neutral',
  attention: 'brand',
  urgent: 'warning',
  emergency: 'warning',
};

const confidenceLabel: Record<ConfidenceLevel, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const urgencyLabel: Record<NonNullable<UrgencyLevel>, string> = {
  routine: 'Routine',
  attention: 'Worth attention',
  urgent: 'Urgent',
  emergency: 'Emergency',
};

export function ResponseCardShell({
  children,
  accent = 'neutral',
  className,
  title,
  explanation,
  icon,
  meta,
  urgentBadge,
}: ResponseCardShellProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className={cn(
        'overflow-hidden rounded-[1.5rem] border bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] backdrop-blur-xl',
        accentBorder[accent],
        accentGlow[accent],
        className
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/8 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-[0.85rem] border', iconWrap[accent])} aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-[1.06rem] font-semibold leading-snug text-white">{title}</h3>
            {explanation ? <p className="text-sm leading-6 text-ink-300">{explanation}</p> : null}
          </div>
        </div>
        {urgentBadge ? (
          <span className="agent-emergency-ring shrink-0 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.24em] text-rose-200">
            {urgentBadge}
          </span>
        ) : null}
      </header>

      {(meta?.urgency || meta?.confidence || meta?.disclaimer) ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-5 py-3 sm:px-6">
          {meta.urgency ? <Badge tone={urgencyTone[meta.urgency]}>{urgencyLabel[meta.urgency]}</Badge> : null}
          {meta.confidence ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-ink-300">
              {confidenceLabel[meta.confidence]}
            </span>
          ) : null}
          {meta.disclaimer ? (
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-ink-400">
              <IconShield width={14} height={14} aria-hidden />
              <span>Guidance, not a diagnosis</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 p-5 sm:p-6">{children}</div>

      {meta?.disclaimer ? (
        <p className="border-t border-white/8 bg-slate-950/40 px-5 py-3 text-[0.72rem] leading-5 text-ink-400 sm:px-6">
          {meta.disclaimer}
        </p>
      ) : null}
    </motion.article>
  );
}

/* ----------------------------------------------------------------------------
 * Action button — used inside cards (view profile, get directions, etc.)
 * ------------------------------------------------------------------------- */

interface CardActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const actionVariant: Record<NonNullable<CardActionButtonProps['variant']>, string> = {
  primary: 'bg-gradient-to-r from-brand-500 to-accent-500 text-white hover:opacity-90',
  secondary: 'border border-white/12 bg-white/8 text-ink-100 hover:bg-white/15',
  ghost: 'border border-transparent bg-transparent text-brand-200 hover:bg-white/8',
  danger: 'bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:opacity-90',
};

export function CardActionButton({ children, onClick, to, variant = 'secondary', icon, className, ariaLabel }: CardActionButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold tracking-[0.02em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
    actionVariant[variant],
    className
  );

  if (to) {
    return (
      <a href={to} className={classes} aria-label={ariaLabel}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-label={ariaLabel}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Next-step row — consistent "recommended next action" footer across cards
 * ------------------------------------------------------------------------- */

export function NextStepRow({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[0.9rem] border border-white/10 bg-slate-950/50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-200">
        <span className="font-semibold text-brand-200">Next step: </span>
        {label}
      </p>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Suggested replies — quick chips rendered below a card to keep convo moving
 * ------------------------------------------------------------------------- */

export function SuggestedReplies({ replies, onPick }: { replies: string[]; onPick: (reply: string) => void }) {
  if (replies.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          {reply}
          <IconArrowRight width={13} height={13} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Section label — small uppercase eyebrow inside cards
 * ------------------------------------------------------------------------- */

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">{children}</p>;
}

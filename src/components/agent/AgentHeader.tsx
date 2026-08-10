/**
 * Step 2 — Agent header.
 * Sticky top bar: sidebar toggle (mobile), command-center identity, active
 * patient pill, and a highly visible emergency quick-action.
 */

import { Link } from 'react-router-dom';
import { cn } from '../common/cn';
import { ROUTES } from '../../routes/routeConstants';
import { useAgent } from '../../contexts/AgentContext';
import { IconFamily, IconEmergency, IconPlus } from './AgentIcons';

interface Props {
  onToggleSidebar: () => void;
  onToggleContext: () => void;
}

export function AgentHeader({ onToggleSidebar, onToggleContext }: Props) {
  const { activeProfile, status } = useAgent();
  const isEmergency = status.status === 'emergency';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-slate-950/70 px-4 py-3 backdrop-blur-xl transition-colors duration-300 sm:px-6',
        isEmergency ? 'border-rose-400/40 bg-rose-950/30' : 'border-white/10'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle conversation list"
          className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 lg:hidden"
        >
          <span className="flex flex-col gap-1">
            <span className="h-0.5 w-4 rounded-full bg-current" />
            <span className="h-0.5 w-4 rounded-full bg-current" />
          </span>
        </button>

        <Link to={ROUTES.home} className="flex items-center gap-2.5 rounded-full pr-1 transition hover:opacity-90" aria-label="Back to home">
          <span className="flex size-9 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/25 to-accent-500/15 text-sm font-semibold text-white">
            C
          </span>
          <span className="hidden leading-none sm:block">
            <span className="block text-[0.92rem] font-semibold tracking-[0.18em] text-white uppercase">CareLink.AI</span>
            <span className="mt-0.5 block text-[0.66rem] font-medium text-brand-200">Healthcare Command Center</span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleContext}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
          aria-label="Toggle context panel"
        >
          <IconFamily width={15} height={15} aria-hidden />
          <span className="max-w-[100px] truncate">{activeProfile.label}</span>
        </button>

        {isEmergency ? (
          <span className="agent-emergency-ring inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-rose-100">
            <IconEmergency width={14} height={14} aria-hidden />
            Emergency
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onToggleSidebar()}
            className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.78rem] font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 sm:inline-flex lg:hidden"
          >
            <IconPlus width={14} height={14} aria-hidden />
            New
          </button>
        )}
      </div>
    </header>
  );
}

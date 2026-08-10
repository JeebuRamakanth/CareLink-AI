/**
 * Step 15 — Recovery tracker card.
 * Self-reported wellness tracking ONLY. Never claims clinical monitoring.
 * Interactive: Better / Same / Worse check-ins update AgentContext recovery state.
 */

import { ResponseCardShell, SectionLabel, SuggestedReplies } from '../ResponseCardShell';
import { IconHeart } from '../AgentIcons';
import { useAgent } from '../../../contexts/AgentContext';
import type { RecoveryStatus, RecoveryTrend } from '../../../services/agent/agentTypes';

interface Props {
  data: RecoveryStatus;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

const trendConfig: Record<RecoveryTrend, { label: string; emoji: string; tone: string }> = {
  better: { label: 'Better', emoji: '😊', tone: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20' },
  same: { label: 'Same', emoji: '😐', tone: 'border-amber-400/30 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20' },
  worse: { label: 'Worse', emoji: '😞', tone: 'border-rose-400/30 bg-rose-500/12 text-rose-200 hover:bg-rose-500/20' },
};

const formatRelative = (iso?: string): string => {
  if (!iso) return 'No check-ins yet';
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export function RecoveryTrackerCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  const { addRecoveryCheckIn } = useAgent();

  const handleCheckIn = (trend: RecoveryTrend) => {
    addRecoveryCheckIn(trend, undefined);
  };

  const current = trendConfig[data.currentTrend];

  return (
    <ResponseCardShell
      accent="accent"
      title={title}
      explanation={explanation}
      icon={<IconHeart width={20} height={20} />}
      meta={{
        confidence: 'high',
        urgency: 'routine',
        disclaimer: 'Recovery tracking is self-reported and mock only. It does not replace clinical monitoring by your care team.',
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/45 p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Current</p>
          <p className="mt-1 flex items-center gap-1 text-base font-semibold text-white">
            <span aria-hidden>{current.emoji}</span>
            <span>{current.label}</span>
          </p>
        </div>
        <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/45 p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Last check-in</p>
          <p className="mt-1 text-base font-semibold text-white">{formatRelative(data.lastCheckInAt)}</p>
        </div>
        <div className="col-span-2 rounded-[0.9rem] border border-white/10 bg-slate-950/45 p-3 sm:col-span-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Streak</p>
          <p className="mt-1 text-base font-semibold text-white">{data.streakDays} day{data.streakDays === 1 ? '' : 's'} of tracking</p>
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>How are you feeling today?</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {(['better', 'same', 'worse'] as RecoveryTrend[]).map((trend) => {
            const cfg = trendConfig[trend];
            const isActive = data.currentTrend === trend;
            return (
              <button
                key={trend}
                type="button"
                onClick={() => handleCheckIn(trend)}
                aria-pressed={isActive}
                aria-label={`Mark as feeling ${cfg.label}`}
                className={`flex flex-col items-center gap-1 rounded-[0.9rem] border px-3 py-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 ${cfg.tone} ${isActive ? 'ring-2 ring-brand-400/40' : ''}`}
              >
                <span className="text-xl" aria-hidden>{cfg.emoji}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {data.checkIns.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Recent check-ins</SectionLabel>
          <ul className="space-y-1.5">
            {data.checkIns.slice(0, 4).map((checkIn) => (
              <li key={checkIn.id} className="flex items-center justify-between gap-2 rounded-[0.7rem] border border-white/8 bg-white/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-ink-200">
                  <span aria-hidden>{trendConfig[checkIn.trend].emoji}</span>
                  <span>{trendConfig[checkIn.trend].label}</span>
                  {checkIn.note ? <span className="text-ink-400">· {checkIn.note}</span> : null}
                </span>
                <span className="text-[0.72rem] text-ink-400">{formatRelative(checkIn.recordedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] italic text-ink-300">
        {data.followUpReminderPlaceholder}
      </p>

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

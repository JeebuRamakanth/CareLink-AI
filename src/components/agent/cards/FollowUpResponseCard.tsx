/**
 * Step 12 — Follow-up reminder card.
 * Reminder is a PLACEHOLDER until calendar/notifications are connected.
 */

import { ResponseCardShell, CardActionButton, SuggestedReplies } from '../ResponseCardShell';
import { IconClock, IconCalendar } from '../AgentIcons';
import type { FollowUpCardData } from '../../../services/agent/agentTypes';

interface Props {
  data: FollowUpCardData;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

const formatDate = (iso?: string): string => {
  if (!iso) return 'Soon';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Soon';
  }
};

export function FollowUpResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconClock width={20} height={20} />}
      meta={{ confidence: 'high', urgency: 'routine', disclaimer: 'Reminders are placeholders until calendar integration is connected.' }}
    >
      <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
        <p className="text-sm leading-7 text-ink-200">{data.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[0.9rem] border border-brand-400/20 bg-brand-500/8 p-3.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-100">
          <IconCalendar width={16} height={16} aria-hidden />
          {data.reminderLabel}
        </span>
        {data.suggestedDate ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.72rem] font-medium text-ink-200">
            Suggested: {formatDate(data.suggestedDate)}
          </span>
        ) : null}
      </div>

      <CardActionButton variant="primary" onClick={() => window.alert('Reminder set (mock). Connect your calendar to enable real reminders.')} ariaLabel={data.suggestedAction}>
        {data.suggestedAction}
      </CardActionButton>

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

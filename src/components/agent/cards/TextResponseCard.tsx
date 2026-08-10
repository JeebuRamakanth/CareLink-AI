/**
 * Step 4 — General text response (fallback) card.
 * Used when no structured recommendation applies. Keeps suggested replies.
 */

import { ResponseCardShell, SuggestedReplies } from '../ResponseCardShell';
import { IconSparkle } from '../AgentIcons';

interface Props {
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function TextResponseCard({ title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <ResponseCardShell
      accent="neutral"
      title={title}
      explanation={explanation}
      icon={<IconSparkle width={20} height={20} />}
      meta={{ confidence: 'low', urgency: 'routine', disclaimer: 'CareLink.AI provides navigational guidance, not a medical diagnosis.' }}
    >
      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

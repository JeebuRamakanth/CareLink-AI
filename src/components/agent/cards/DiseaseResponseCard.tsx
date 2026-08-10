/**
 * Step 4 — Disease response card.
 * Care navigation overview, never clinical claims.
 */

import { ResponseCardShell, NextStepRow, SuggestedReplies, SectionLabel } from '../ResponseCardShell';
import { IconActivity } from '../AgentIcons';
import type { DiseaseInsight } from '../../../services/agent/agentTypes';

interface Props {
  data: DiseaseInsight;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function DiseaseResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <ResponseCardShell
      accent="neutral"
      title={title}
      explanation={explanation}
      icon={<IconActivity width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'routine', disclaimer: 'Always confirm specifics with your doctor — this is navigational, not clinical advice.' }}
    >
      <p className="text-sm leading-7 text-ink-200">{data.overview}</p>

      <div className="space-y-2 rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
        <SectionLabel>Relevant specialties</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {data.relevantSpecialties.map((s) => (
            <span key={s} className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.78rem] font-semibold text-brand-100">
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>Care navigation</SectionLabel>
        <ul className="space-y-2">
          {data.careNavigation.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-sm leading-6 text-ink-200">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-[0.66rem] font-semibold text-ink-200">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>

      <NextStepRow label={data.recommendedNextAction} />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

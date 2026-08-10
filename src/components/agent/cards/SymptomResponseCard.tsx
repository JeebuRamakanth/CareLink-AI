/**
 * Step 4 — Symptom response card.
 * Navigational guidance only — NEVER a diagnosis. Urgency surfaced via meta badge.
 */

import { ResponseCardShell, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconStethoscope } from '../AgentIcons';
import type { SymptomInsight } from '../../../services/agent/agentTypes';

interface Props {
  data: SymptomInsight;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function SymptomResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconStethoscope width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'attention', disclaimer: 'CareLink.AI provides navigational guidance, not a medical diagnosis. Consult a licensed healthcare professional.' }}
      urgentBadge="Worth attention"
    >
      <div className="space-y-3">
        <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">What you described</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.symptoms.map((s) => (
              <span key={s} className="rounded-full border border-brand-400/20 bg-brand-400/10 px-2.5 py-1 text-[0.78rem] font-medium text-brand-100">
                {s}
              </span>
            ))}
          </div>
        </div>

        <p className="text-sm leading-7 text-ink-200">{data.guidance}</p>

        {data.possibleSpecialties.length > 0 ? (
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Possible specialties</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.possibleSpecialties.map((s) => (
                <span key={s} className="rounded-full border border-accent-400/25 bg-accent-400/10 px-2.5 py-1 text-[0.78rem] font-semibold text-accent-100">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <NextStepRow label={data.recommendedNextAction} />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

/**
 * Step 35 — Health summary card.
 * Personal health dashboard snapshot. Mock metrics only.
 */

import { ResponseCardShell, NextStepRow, SuggestedReplies, SectionLabel } from '../ResponseCardShell';
import { IconActivity } from '../AgentIcons';
import type { HealthSummaryCardData } from '../../../services/agent/agentTypes';

interface Props {
  data: HealthSummaryCardData;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

const metricTone: Record<NonNullable<HealthSummaryCardData['metrics'][number]['status']>, string> = {
  normal: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  attention: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  abnormal: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

export function HealthSummaryResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconActivity width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'routine', disclaimer: 'Health summary values are illustrative mock data, not clinical readings.' }}
    >
      <p className="text-sm leading-7 text-ink-200">{data.summary}</p>

      <div className="space-y-2">
        <SectionLabel>Snapshot</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.metrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between gap-2 rounded-[0.8rem] border border-white/10 bg-slate-950/45 px-3 py-2.5">
              <span className="text-sm text-ink-300">{metric.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{metric.value}</span>
                {metric.status ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] ${metricTone[metric.status]}`}>
                    {metric.status}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <NextStepRow label={data.recommendedNextAction} />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

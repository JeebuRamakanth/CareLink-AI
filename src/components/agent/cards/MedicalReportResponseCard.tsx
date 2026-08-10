/**
 * Step 9 — Medical report response card.
 * Clearly labelled MOCK interpretation. No real medical analysis yet.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies, SectionLabel } from '../ResponseCardShell';
import { IconReport } from '../AgentIcons';
import type { MedicalReportResult, MedicalReportValue } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';

interface Props {
  data: MedicalReportResult;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

const valueStatusTone: Record<MedicalReportValue['status'], string> = {
  normal: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  attention: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  abnormal: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

const valueStatusLabel: Record<MedicalReportValue['status'], string> = {
  normal: 'Normal',
  attention: 'Attention',
  abnormal: 'Abnormal',
};

export function MedicalReportResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  const navigate = useNavigate();

  return (
    <ResponseCardShell
      accent="warning"
      title={title}
      explanation={explanation}
      icon={<IconReport width={20} height={20} />}
      meta={{
        confidence: 'low',
        urgency: 'attention',
        disclaimer:
          'Mock interpretation only. CareLink.AI has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
      }}
      urgentBadge="Mock interpretation"
    >
      <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.78rem] italic text-amber-100">
        This is a demo interpretation. No real medical interpretation has been performed yet.
      </p>

      <p className="text-sm leading-7 text-ink-200">{data.summary}</p>

      {data.importantObservations.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Important observations</SectionLabel>
          <ul className="space-y-1.5">
            {data.importantObservations.map((obs) => (
              <li key={obs} className="flex gap-2 text-sm leading-6 text-ink-200">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.valuesRequiringAttention.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Values requiring attention</SectionLabel>
          <div className="space-y-2">
            {data.valuesRequiringAttention.map((v) => (
              <div key={v.label} className="flex flex-wrap items-center justify-between gap-2 rounded-[0.8rem] border border-white/10 bg-slate-950/45 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{v.label}</p>
                  <p className="text-[0.72rem] text-ink-400">Reference: {v.range ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{v.value}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] ${valueStatusTone[v.status]}`}>
                    {valueStatusLabel[v.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.normalValues.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Within normal range</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.normalValues.map((v) => (
              <div key={v.label} className="flex items-center justify-between gap-2 rounded-[0.8rem] border border-white/10 bg-slate-950/45 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{v.label}</p>
                  <p className="text-[0.72rem] text-ink-400">{v.range}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-200">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] italic text-ink-300">
        {data.trendComparisonPlaceholder}
      </p>

      {data.questionsToAskYourDoctor.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Questions to ask your doctor</SectionLabel>
          <ul className="space-y-1.5">
            {data.questionsToAskYourDoctor.map((q) => (
              <li key={q} className="flex gap-2 text-sm leading-6 text-ink-200">
                <span className="text-brand-200" aria-hidden>?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CardActionButton variant="primary" onClick={() => navigate(ROUTES.doctors)} ariaLabel="Find a specialist to discuss this report">
          Find a specialist
        </CardActionButton>
        <CardActionButton variant="secondary" onClick={() => navigate(ROUTES.appointments)} ariaLabel="Book a follow-up appointment">
          Book follow-up
        </CardActionButton>
      </div>

      <NextStepRow label={data.recommendedNextAction} />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

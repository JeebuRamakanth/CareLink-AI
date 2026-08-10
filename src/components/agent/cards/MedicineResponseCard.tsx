/**
 * Step 10 — Medicine response card.
 * Safety-first: NO autonomous prescription or dosage changes.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies, SectionLabel } from '../ResponseCardShell';
import { IconPill, IconShield } from '../AgentIcons';
import type { MedicineResult } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';

interface Props {
  data: MedicineResult;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function MedicineResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  const navigate = useNavigate();

  return (
    <ResponseCardShell
      accent="warning"
      title={title}
      explanation={explanation}
      icon={<IconPill width={20} height={20} />}
      meta={{
        confidence: 'medium',
        urgency: 'routine',
        disclaimer:
          'Never change your dosage or stop a prescribed medicine without consulting your doctor. Confirm interactions with a pharmacist using your full medication list.',
      }}
    >
      <div className="space-y-2">
        <SectionLabel>Common purpose</SectionLabel>
        <p className="text-sm leading-7 text-ink-200">{data.commonPurpose}</p>
      </div>

      <div className="rounded-[1rem] border border-amber-400/25 bg-amber-500/8 p-4">
        <p className="flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-amber-200">
          <IconShield width={14} height={14} aria-hidden />
          Important safety information
        </p>
        <p className="mt-2 text-sm leading-7 text-ink-100">{data.importantSafetyInfo}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {data.prescriptionRequired ? (
          <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-rose-200">
            Prescription required
          </span>
        ) : (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Over-the-counter
          </span>
        )}
      </div>

      <p className="rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] italic text-ink-300">
        {data.interactionWarningPlaceholder}
      </p>

      <div className="flex flex-wrap gap-2">
        <CardActionButton variant="secondary" onClick={() => navigate(ROUTES.doctors)} ariaLabel="Find a pharmacy for this medicine">
          Find a pharmacy
        </CardActionButton>
        <CardActionButton variant="secondary" onClick={() => navigate(ROUTES.appointments)} ariaLabel="Add to medication tracking">
          Track medication
        </CardActionButton>
      </div>

      <NextStepRow label="Confirm any interactions with your pharmacist before starting or changing this medicine." />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

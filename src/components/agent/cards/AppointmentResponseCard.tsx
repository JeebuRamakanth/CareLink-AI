/**
 * Step 12 — Appointment action card.
 * Connects to the EXISTING appointment system routes — no duplicate booking UI.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, SuggestedReplies } from '../ResponseCardShell';
import { IconCalendar } from '../AgentIcons';
import type { AppointmentAction } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';

interface Props {
  data: AppointmentAction;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function AppointmentResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  const navigate = useNavigate();

  const handleAction = () => {
    if (data.kind === 'book' && data.doctorDetailSlug) {
      navigate(`${ROUTES.doctors}/${data.doctorDetailSlug}`);
    } else if (data.hospitalDetailSlug) {
      navigate(`${ROUTES.hospitals}/${data.hospitalDetailSlug}`);
    } else {
      navigate(ROUTES.appointments);
    }
  };

  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconCalendar width={20} height={20} />}
      meta={{ confidence: 'high', urgency: 'routine' }}
    >
      <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
        <p className="text-sm leading-7 text-ink-200">{data.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <CardActionButton variant="primary" icon={<IconCalendar width={15} height={15} />} onClick={handleAction} ariaLabel={data.label}>
          {data.label}
        </CardActionButton>
        <CardActionButton variant="secondary" to={ROUTES.appointments} ariaLabel="View all appointments">
          View appointments
        </CardActionButton>
      </div>

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

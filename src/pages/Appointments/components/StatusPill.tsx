import { Badge } from '../../../components/ui/Badge';
import type { AppointmentStatus } from '../data/appointmentsData';

type StatusPillProps = {
  status: AppointmentStatus;
};

const toneMap: Record<AppointmentStatus, 'brand' | 'success' | 'warning' | 'neutral'> = {
  confirmed: 'brand',
  upcoming: 'success',
  completed: 'neutral',
  cancelled: 'warning',
  rescheduled: 'warning',
};

export function StatusPill({ status }: StatusPillProps) {
  return <Badge tone={toneMap[status]} className="uppercase tracking-[0.24em]">{status}</Badge>;
}

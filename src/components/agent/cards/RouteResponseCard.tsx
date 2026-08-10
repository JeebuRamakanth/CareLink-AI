/**
 * Step 16 — Route card.
 * Clean abstraction so Google Maps / Mapbox / etc. can be plugged in later.
 */

import { ResponseCardShell, CardActionButton, SuggestedReplies } from '../ResponseCardShell';
import { IconRoute, IconClock, IconLocation } from '../AgentIcons';
import type { RouteResult } from '../../../services/agent/agentTypes';

interface Props {
  data: RouteResult;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
  onGetDirections?: (route: RouteResult) => void;
}

const transportLabel: Record<RouteResult['transportMode'], string> = {
  driving: 'Driving',
  walking: 'Walking',
  transit: 'Transit',
};

export function RouteResponseCard({ data, title, explanation, suggestedReplies, onPickReply, onGetDirections }: Props) {
  const handleDirections = () => {
    if (onGetDirections) {
      onGetDirections(data);
    } else {
      // Abstracted hook for a real maps provider.
      window.alert(`Directions to ${data.destinationName} (mock): ${data.distanceKm} km · ~${data.estimatedTravelTimeMin} min via ${transportLabel[data.transportMode]}`);
    }
  };

  return (
    <ResponseCardShell
      accent="accent"
      title={title}
      explanation={explanation}
      icon={<IconRoute width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'routine', disclaimer: 'Travel time is an estimate and may vary with traffic. Connect a maps provider for live navigation.' }}
    >
      <div className="rounded-[1rem] border border-white/10 bg-slate-950/45 p-4">
        <h4 className="flex items-center gap-2 text-base font-semibold text-white">
          <IconLocation width={16} height={16} className="text-accent-200" aria-hidden />
          {data.destinationName}
        </h4>
        <p className="mt-1 text-sm text-ink-300">{data.destinationAddress}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[0.8rem] border border-white/10 bg-white/5 p-3">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Distance</p>
            <p className="mt-1 text-lg font-semibold text-white">{data.distanceKm.toFixed(1)} km</p>
          </div>
          <div className="rounded-[0.8rem] border border-white/10 bg-white/5 p-3">
            <p className="flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">
              <IconClock width={12} height={12} aria-hidden /> Travel time
            </p>
            <p className="mt-1 text-lg font-semibold text-white">~{data.estimatedTravelTimeMin} min</p>
          </div>
          <div className="col-span-2 rounded-[0.8rem] border border-white/10 bg-white/5 p-3 sm:col-span-1">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">Mode</p>
            <p className="mt-1 text-lg font-semibold text-white">{transportLabel[data.transportMode]}</p>
          </div>
        </div>
      </div>

      <CardActionButton variant="primary" icon={<IconRoute width={15} height={15} />} onClick={handleDirections} ariaLabel={`Get directions to ${data.destinationName}`}>
        Get Directions
      </CardActionButton>

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}

/**
 * Step 11 — Emergency response card.
 * HIGHLY VISIBLE emergency state. Never buries guidance in normal chat bubbles.
 * Never hard-codes medical diagnosis claims — only safe escalation actions.
 *
 * Visually distinct (rose/amber gradient + pulsing ring) so it cannot be missed.
 */

import { motion } from 'framer-motion';
import { ResponseCardShell, CardActionButton, SuggestedReplies } from '../ResponseCardShell';
import { IconEmergency, IconPhone, IconRoute, IconHospital, IconLocation } from '../AgentIcons';
import type { EmergencyResponse as EmergencyResponseData } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';

interface Props {
  data: EmergencyResponseData;
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
}

export function EmergencyResponseCard({ data, title, explanation, suggestedReplies, onPickReply }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      role="alert"
      aria-live="assertive"
    >
      <ResponseCardShell
        accent="danger"
        title={title}
        explanation={explanation}
        icon={<IconEmergency width={22} height={22} />}
        meta={{ confidence: 'high', urgency: 'emergency', disclaimer: data.disclaimer }}
        urgentBadge={data.indicatorLabel}
      >
        {/* Immediate guidance — top priority */}
        <div className="rounded-[1rem] border border-rose-400/30 bg-gradient-to-br from-rose-500/15 to-amber-500/10 p-4">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.28em] text-rose-200">Immediate action guidance</p>
          <ul className="mt-2 space-y-2">
            {data.immediateGuidance.map((g) => (
              <li key={g} className="flex gap-2 text-sm leading-6 text-ink-100">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-rose-300" aria-hidden />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Call-to-action contacts — prominent */}
        <div className="grid gap-2 sm:grid-cols-2">
          {data.contacts.map((contact) => (
            <a
              key={contact.label}
              href={contact.href}
              className="agent-emergency-ring flex items-center justify-between gap-2 rounded-[0.9rem] border border-rose-400/40 bg-gradient-to-r from-rose-500/90 to-amber-500/90 px-4 py-3 text-white transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
              aria-label={`${contact.label} — call ${contact.phone}`}
            >
              <span className="flex items-center gap-2">
                <IconPhone width={18} height={18} aria-hidden />
                <span className="text-sm font-semibold">{contact.label}</span>
              </span>
              {contact.phone ? <span className="text-sm font-bold">{contact.phone}</span> : null}
            </a>
          ))}
        </div>

        {/* Nearby emergency facilities */}
        {data.nearbyFacilities.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Nearest emergency facilities</p>
            {data.nearbyFacilities.map((facility) => (
              <article
                key={facility.id}
                className="rounded-[1rem] border border-rose-400/25 bg-slate-950/45 p-4 transition duration-200 hover:border-rose-400/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h4 className="flex items-center gap-2 text-base font-semibold text-white">
                      <IconHospital width={16} height={16} className="text-rose-200" aria-hidden />
                      {facility.name}
                    </h4>
                    <p className="flex items-center gap-1.5 text-sm text-ink-300">
                      <IconLocation width={14} height={14} aria-hidden />
                      <span className="truncate">{facility.address}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-rose-200">
                    Emergency
                  </span>
                </div>
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-ink-300">
                  <IconRoute width={14} height={14} aria-hidden />
                  <span>{facility.distanceKm.toFixed(1)} km · ~{facility.estimatedTravelTimeMin} min</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {facility.detailSlug ? (
                    <CardActionButton variant="secondary" to={`${ROUTES.hospitals}/${facility.detailSlug}`} ariaLabel={`View hospital profile for ${facility.name}`}>
                      View Hospital
                    </CardActionButton>
                  ) : null}
                  <CardActionButton
                    variant="danger"
                    icon={<IconRoute width={15} height={15} />}
                    onClick={() => facility.route && window.alert(`Directions to ${facility.name} (mock): ${facility.route.distanceKm} km · ~${facility.route.estimatedTravelTimeMin} min`)}
                    ariaLabel={`Get directions to ${facility.name}`}
                  >
                    Get Directions
                  </CardActionButton>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="rounded-[0.9rem] border border-rose-400/20 bg-rose-500/8 p-3.5">
          <p className="text-sm font-medium text-rose-100">{data.recommendedNextAction}</p>
        </div>

        <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
      </ResponseCardShell>
    </motion.div>
  );
}

export { ROUTES as EmergencyRoutes };

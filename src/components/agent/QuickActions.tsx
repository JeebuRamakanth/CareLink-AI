/**
 * Step 14 — Quick action tiles.
 * Premium tiles that populate the composer or trigger mock response states.
 */

import { motion } from 'framer-motion';
import { IconHospital, IconDoctor, IconPharmacy, IconLab, IconReport, IconClipboard, IconStethoscope, IconCalendar, IconPill, IconHeart } from './AgentIcons';
import { cn } from '../common/cn';

export interface QuickAction {
  id: string;
  label: string;
  icon: typeof IconHospital;
  accent: 'brand' | 'accent' | 'warning' | 'neutral';
}

const accentClasses: Record<QuickAction['accent'], string> = {
  brand: 'text-brand-200 border-brand-400/25 hover:border-brand-400/50 hover:bg-brand-400/10',
  accent: 'text-accent-200 border-accent-400/25 hover:border-accent-400/50 hover:bg-accent-400/10',
  warning: 'text-amber-200 border-amber-400/25 hover:border-amber-400/50 hover:bg-amber-400/10',
  neutral: 'text-ink-200 border-white/12 hover:border-white/25 hover:bg-white/8',
};

export const quickActions: QuickAction[] = [
  { id: 'find-hospital', label: 'Find Hospital', icon: IconHospital, accent: 'brand' },
  { id: 'find-doctor', label: 'Find Doctor', icon: IconDoctor, accent: 'accent' },
  { id: 'find-pharmacy', label: 'Find Pharmacy', icon: IconPharmacy, accent: 'accent' },
  { id: 'find-lab', label: 'Find Lab', icon: IconLab, accent: 'brand' },
  { id: 'upload-report', label: 'Upload Report', icon: IconReport, accent: 'warning' },
  { id: 'upload-prescription', label: 'Upload Prescription', icon: IconClipboard, accent: 'warning' },
  { id: 'check-symptoms', label: 'Check Symptoms', icon: IconStethoscope, accent: 'brand' },
  { id: 'my-appointments', label: 'My Appointments', icon: IconCalendar, accent: 'neutral' },
  { id: 'my-medicines', label: 'My Medicines', icon: IconPill, accent: 'accent' },
  { id: 'recovery-tracker', label: 'Recovery Tracker', icon: IconHeart, accent: 'accent' },
];

interface Props {
  onAction: (actionId: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Quick actions">
      {quickActions.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: index * 0.03, ease: 'easeOut' }}
            aria-label={action.label}
            className={cn(
              'flex flex-col items-start gap-2 rounded-[0.9rem] border bg-white/5 px-3.5 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:cursor-not-allowed disabled:opacity-50',
              accentClasses[action.accent]
            )}
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/8">
              <Icon width={16} height={16} />
            </span>
            <span className="text-[0.82rem] font-semibold leading-tight text-white">{action.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

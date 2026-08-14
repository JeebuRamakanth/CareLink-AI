/**
 * Small reusable presentation primitives for the Home page sections.
 * Kept local to Home so unrelated pages stay untouched. Reuses the existing
 * `surface-panel` token and brand palette — no new design system.
 */
import type { ReactNode } from 'react';
import {
  IconActivity,
  IconCalendar,
  IconFamily,
  IconHeart,
  IconHospital,
  IconLocation,
  IconReport,
  IconRoute,
  IconSparkle,
  IconStar,
} from '../../../components/agent/AgentIcons';

const iconMap = {
  sparkle: IconSparkle,
  report: IconReport,
  calendar: IconCalendar,
  family: IconFamily,
  heart: IconHeart,
  location: IconLocation,
  hospital: IconHospital,
  route: IconRoute,
  activity: IconActivity,
} as const;

export type HomeIcon = keyof typeof iconMap;

export function HomeIconGlyph({ name, className }: { name: HomeIcon; className?: string }) {
  const Icon = iconMap[name];
  return <Icon width={20} height={20} aria-hidden className={className} />;
}

/** A clearly-labelled DEMO chip for mock-only figures (distance/ETA/etc). */
export function DemoBadge({ children = 'Demo data' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-amber-200">
      {children}
    </span>
  );
}

export function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-ink-300 ${className ?? ''}`}>
      <IconStar width={14} height={14} aria-hidden className="text-amber-300" />
      <span className="font-semibold text-white">{rating.toFixed(1)}</span>
    </span>
  );
}

/** The box each Section renders inside (kept consistent with the prior shell). */
export function SectionBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.5rem] border border-white/10 bg-white/5 p-5 sm:p-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function SectionFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[0.72rem] text-ink-400">{children}</p>;
}

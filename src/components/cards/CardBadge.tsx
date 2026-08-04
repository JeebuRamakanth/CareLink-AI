import type { ReactNode } from 'react';

type CardBadgeProps = {
  children: ReactNode;
  tone?: 'default' | 'brand' | 'success' | 'danger';
  className?: string;
};

const toneClasses: Record<NonNullable<CardBadgeProps['tone']>, string> = {
  default: 'border-white/10 bg-white/5 text-ink-300',
  brand: 'border-brand-400/25 bg-brand-400/10 text-brand-100',
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  danger: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
};

export function CardBadge({ children, tone = 'default', className = '' }: CardBadgeProps) {
  return <span className={`rounded-full border px-2.75 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] ${toneClasses[tone]} ${className}`}>{children}</span>;
}

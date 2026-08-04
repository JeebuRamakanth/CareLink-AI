import type { ElementType, ReactNode } from 'react';

type BaseCardVariant = 'default' | 'glass' | 'elevated';
type BaseCardSize = 'default' | 'compact' | 'large';
type BaseCardTone = 'default' | 'brand' | 'success' | 'danger';

type BaseCardProps = {
  children: ReactNode;
  className?: string;
  variant?: BaseCardVariant;
  size?: BaseCardSize;
  tone?: BaseCardTone;
  interactive?: boolean;
  loading?: boolean;
  as?: ElementType;
  ariaLabel?: string;
};

const variantClasses: Record<BaseCardVariant, string> = {
  default: 'border border-white/10 bg-slate-950/70 shadow-[0_16px_70px_rgba(0,0,0,0.2)]',
  glass: 'border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_14px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl',
  elevated: 'border border-white/10 bg-white/8 shadow-[0_24px_90px_rgba(77,132,255,0.14)]',
};

const sizeClasses: Record<BaseCardSize, string> = {
  default: 'p-4 sm:p-5',
  compact: 'p-3 sm:p-4',
  large: 'p-5 sm:p-7',
};

const toneClasses: Record<BaseCardTone, string> = {
  default: '',
  brand: 'ring-1 ring-brand-400/20',
  success: 'ring-1 ring-emerald-400/20',
  danger: 'ring-1 ring-rose-400/20',
};

export function BaseCard({
  children,
  className = '',
  variant = 'default',
  size = 'default',
  tone = 'default',
  interactive = false,
  loading = false,
  as: Component = 'div',
  ariaLabel,
}: BaseCardProps) {
  return (
    <Component
      aria-label={ariaLabel}
      className={`overflow-hidden rounded-[1.4rem] transition duration-300 ${variantClasses[variant]} ${sizeClasses[size]} ${toneClasses[tone]} ${
        interactive ? 'hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-[0_22px_90px_rgba(77,132,255,0.18)] focus-within:border-brand-400/40' : ''
      } ${loading ? 'opacity-80' : ''} ${className}`}
    >
      {loading ? <div className="animate-pulse space-y-3">{children}</div> : children}
    </Component>
  );
}

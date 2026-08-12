import { useRef } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { ROUTES } from '../../../routes/routeConstants';
import {
  HealthCommandCenter,
  type HealthCommandCenterHandle,
} from '../../../features/health-agent';
import {
  IconArrowRight,
  IconHospital,
  IconShield,
  IconSparkle,
} from '../../../components/agent/AgentIcons';

const TRUST_INDICATORS = [
  { icon: IconShield, label: 'Guidance, not diagnosis' },
  { icon: IconHospital, label: 'Hospital network' },
  { icon: IconSparkle, label: 'Care near you' },
];

export function Hero() {
  const agentRef = useRef<HealthCommandCenterHandle>(null);

  const focusAgent = () => agentRef.current?.focus();
  const findCareNearMe = () => agentRef.current?.ask('Find a hospital near me');

  return (
    <MotionConfig reducedMotion="user">
    <section className="relative overflow-hidden">
      {/* Ambient gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(22,182,166,0.1),transparent_40%)]"
      />

      <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-stretch lg:gap-8 xl:gap-12">
        {/* Left column: headline + value prop + CTAs + trust (desktop) */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col justify-center space-y-5 lg:col-start-1 lg:row-start-1"
        >
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
            <IconSparkle width={13} height={13} aria-hidden /> AI-powered healthcare navigation
          </div>

          <h1 className="text-balance text-[2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[2.6rem] lg:text-[3rem] xl:text-[3.4rem]">
            Your health. One intelligent place.
          </h1>

          <p className="max-w-xl text-[0.95rem] leading-7 text-ink-300 sm:text-base sm:leading-7">
            Ask about symptoms, medicines, reports, doctors or nearby care — CareLink AI helps you understand what to do next.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={focusAgent} size="lg" className="w-full sm:w-auto">
              Ask CareLink AI <IconArrowRight width={16} height={16} aria-hidden />
            </Button>
            <Button variant="secondary" onClick={findCareNearMe} size="lg" className="w-full sm:w-auto">
              Find Care Near Me
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TRUST_INDICATORS.map((t) => {
              const Icon = t.icon;
              return (
                <span key={t.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.74rem] font-medium text-ink-200">
                  <Icon width={14} height={14} aria-hidden /> {t.label}
                </span>
              );
            })}
          </div>

          <p className="text-[0.8rem] text-ink-400">
            Understand → Find → Navigate → Book → Follow up — all from one command center.
          </p>
        </motion.div>

        {/* Right column: interactive CareLink AI Command Center (spans two rows on desktop) */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
          className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <HealthCommandCenter ref={agentRef} />
        </motion.div>

        {/* CTA / quick-access row: below the agent on mobile, bottom-left on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
          className="lg:col-start-1 lg:row-start-2"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Hospitals', href: ROUTES.hospitals },
              { label: 'Doctors', href: ROUTES.doctors },
              { label: 'Appointments', href: ROUTES.appointments },
              { label: 'Reviews', href: ROUTES.reviews },
            ].map((c) => (
              <a
                key={c.label}
                href={c.href}
                className="surface-panel flex items-center justify-between gap-2 rounded-[1rem] border border-white/10 px-3.5 py-2.5 text-[0.82rem] font-semibold text-ink-100 transition hover:-translate-y-0.5 hover:border-brand-400/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                {c.label} <IconArrowRight width={14} height={14} aria-hidden />
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
    </MotionConfig>
  );
}

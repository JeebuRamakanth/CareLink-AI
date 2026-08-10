import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconSparkle, IconArrowRight, IconHospital, IconDoctor, IconReport, IconHeart } from '../../../components/agent/AgentIcons';

/**
 * Premium entry point to the CareLink AI Healthcare Command Center.
 * Replaces the previous placeholder section with a real call-to-action.
 */
export function AIAssistant() {
  const capabilities = [
    { icon: IconHospital, label: 'Find hospitals' },
    { icon: IconDoctor, label: 'Match specialists' },
    { icon: IconReport, label: 'Explain reports' },
    { icon: IconHeart, label: 'Track recovery' },
  ];

  return (
    <Section
      title="Your AI healthcare command center"
      description="One intelligent interface for symptoms, doctors, hospitals, pharmacies, labs, reports, medicines, and recovery — with safe, action-oriented next steps."
      eyebrow="CareLink AI agent"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="surface-panel relative overflow-hidden border border-white/10 p-6 sm:p-8 lg:p-10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(77,132,255,0.14),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(22,182,166,0.1),transparent_38%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
              <IconSparkle width={13} height={13} aria-hidden />
              Command center
            </div>
            <h3 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
              Ask anything. Get guided next steps.
            </h3>
            <p className="max-w-xl text-sm leading-7 text-ink-300 sm:text-base">
              Describe a symptom, upload a report, or ask CareLink to find care near you. The agent returns structured,
              trustworthy guidance — never a diagnosis, always a clear next action.
            </p>
            <div className="flex flex-wrap gap-2">
              {capabilities.map((cap) => {
                const Icon = cap.icon;
                return (
                  <span
                    key={cap.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200"
                  >
                    <Icon width={14} height={14} aria-hidden />
                    {cap.label}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                to={ROUTES.agent}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_-22px_rgba(77,132,255,0.8)] transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              >
                Open command center
                <IconArrowRight width={16} height={16} aria-hidden />
              </Link>
              <Link
                to={ROUTES.hospitals}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-ink-100 transition-all duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                Browse hospitals
              </Link>
            </div>
          </div>

          {/* Mock preview panel */}
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-4 sm:p-5">
            <div className="space-y-3 rounded-[1rem] border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-white">
                    <IconSparkle width={13} height={13} />
                  </span>
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-200">CareLink AI</span>
                </div>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Guidance
                </span>
              </div>
              <div className="rounded-[0.7rem] border border-brand-400/20 bg-brand-500/10 px-3 py-2 text-sm text-white">
                I have severe chest pain
              </div>
              <div className="space-y-2 rounded-[0.7rem] border border-rose-400/25 bg-rose-500/8 p-3">
                <div className="h-2 w-24 rounded-full bg-rose-300/60" />
                <div className="h-2 w-full rounded-full bg-white/12" />
                <div className="h-2 w-4/5 rounded-full bg-white/10" />
                <div className="mt-2 flex gap-2">
                  <div className="h-7 w-24 rounded-full bg-gradient-to-r from-rose-500/80 to-amber-500/80" />
                  <div className="h-7 w-20 rounded-full border border-white/12 bg-white/8" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <div className="h-5 w-20 rounded-full bg-white/10" />
                <div className="h-5 w-16 rounded-full bg-white/10" />
                <div className="h-5 w-24 rounded-full bg-white/10" />
              </div>
            </div>
            <p className="mt-3 text-center text-[0.66rem] text-ink-400">
              Mock preview — guided, safety-first responses with real next steps.
            </p>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

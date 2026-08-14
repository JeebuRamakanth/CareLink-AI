import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconHeart, IconShield, IconSparkle } from '../../../components/agent/AgentIcons';
import { recoverySummary, vaccinationReminders, familyProfileCount } from './homeData';
import { SectionBox } from './homePrimitives';

const trendLabel: Record<string, { text: string; tone: string }> = {
  better: { text: 'Improving', tone: 'text-emerald-200' },
  same: { text: 'Stable', tone: 'text-ink-200' },
  worse: { text: 'Needs attention', tone: 'text-amber-200' },
};

export function CTA() {
  const trend = trendLabel[recoverySummary.currentTrend] ?? trendLabel.same;

  return (
    <Section title="Ready to take charge of your care?" description="Start with the CareLink AI command center — ask, upload a report, or find care near you." eyebrow="Ready to begin">
      <SectionBox className="min-h-[220px]">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="flex flex-col gap-5 rounded-[1.25rem] border border-brand-400/20 bg-gradient-to-br from-brand-500/10 to-accent-500/8 p-6">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
                <IconSparkle width={13} height={13} aria-hidden /> Start now
              </span>
              <h3 className="text-xl font-semibold text-white">Your health, one intelligent place.</h3>
              <p className="max-w-md text-[0.86rem] leading-6 text-ink-300">
                Understand a concern, store documents securely, find nearby care, book an appointment and track recovery — all connected.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to={ROUTES.ai}>
                <Button size="lg">
                  Ask CareLink AI <IconArrowRight width={16} height={16} aria-hidden />
                </Button>
              </Link>
              <Link to={ROUTES.register}>
                <Button variant="secondary" size="lg">
                  Create an account
                </Button>
              </Link>
              <Link to={ROUTES.hospitals}>
                <Button variant="ghost" size="lg">
                  Browse hospitals <IconArrowRight width={16} height={16} aria-hidden />
                </Button>
              </Link>
            </div>
            <p className="flex items-center gap-1.5 text-[0.76rem] text-ink-400">
              <IconShield width={13} height={13} aria-hidden /> Guidance, not a diagnosis · {familyProfileCount} family profiles supported
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5">
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.2em] text-ink-400">
                <IconHeart width={14} height={14} aria-hidden className="text-rose-300" /> Recovery tracking
              </span>
              <p className="text-sm text-ink-200">{recoverySummary.conditionLabel}</p>
              <p className="text-[0.8rem] text-ink-300">
                Streak: <span className="font-semibold text-white">{recoverySummary.streakDays} days</span> · Trend:{' '}
                <span className={`font-semibold ${trend.tone}`}>{trend.text}</span>
              </p>
            </div>
            <div className="space-y-2 border-t border-white/5 pt-4">
              <span className="text-[0.74rem] font-semibold uppercase tracking-[0.2em] text-ink-400">Vaccination reminders</span>
              {vaccinationReminders.length > 0 ? (
                <ul className="space-y-1.5">
                  {vaccinationReminders.map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-[0.8rem]">
                      <span className="text-ink-200">{v.name}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] ${
                          v.status === 'due'
                            ? 'border-amber-400/25 bg-amber-500/12 text-amber-200'
                            : 'border-brand-400/25 bg-brand-500/12 text-brand-200'
                        }`}
                      >
                        {v.status} · {v.recommendedDate}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.8rem] text-ink-400">No upcoming reminders.</p>
              )}
              <Link to={ROUTES.ai} className="mt-1 inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white">
                Track in command center <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </SectionBox>
    </Section>
  );
}

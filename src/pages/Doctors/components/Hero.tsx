import { Section } from '../../../components/ui/Section';

export function Hero() {
  return (
    <Section title="Doctors" description="Discover verified specialists and book with confidence through a premium care network." eyebrow="Doctors">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.2),transparent_35%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="max-w-2xl space-y-5">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">
              Trusted care network
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Find trusted doctors and book appointments with clarity.
              </h2>
              <p className="max-w-xl text-sm leading-7 text-ink-300 sm:text-base">
                Connect with verified specialists across a multi-hospital network through AI-assisted discovery designed for speed, trust, and continuity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <button type="button" className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white">
                Find a doctor
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink-200">
                Explore specialists
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-sm text-ink-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Verified specialists</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">AI-assisted discovery</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Multi-hospital access</span>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/65 p-4 sm:p-5">
            <div className="rounded-[1.1rem] border border-white/10 bg-white/8 p-4">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
                    Doctor Name
                  </div>
                  <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
                    Specialty
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
                    Hospital
                  </div>
                  <div className="rounded-[0.9rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
                    City
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-[0.9rem] border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-ink-400">
                  <span>Search trusted specialists</span>
                  <span className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-brand-200">
                    AI
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

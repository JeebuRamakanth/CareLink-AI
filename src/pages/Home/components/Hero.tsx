import { Button } from '../../../components/ui/Button';

export function Hero() {
  return (
    <section className="surface-panel relative overflow-hidden border border-white/10 p-8 sm:p-10 lg:p-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.12),transparent_35%)]" />
      <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-brand-200">
            Trusted by modern care teams
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
              Where emergency readiness meets intelligent care.
            </h1>
            <p className="max-w-xl text-base leading-7 text-ink-300 sm:text-lg">
              CareLink.AI brings hospitals and care teams together with a secure, modern platform for faster decisions, coordinated response, and a better patient experience.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button>Request a demo</Button>
            <Button variant="secondary">Explore the platform</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-ink-300">24/7 emergency readiness</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-ink-300">Multi-hospital coordination</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-ink-300">Modern clinical intelligence</span>
          </div>
          <p className="pt-1 text-sm text-ink-400">
            Built for hospitals, care teams, and moments that demand speed.
          </p>
        </div>

        <div className="min-h-[320px] rounded-[1.75rem] border border-white/10 bg-slate-950/50 p-4 sm:p-6 lg:min-h-[420px]">
          <div className="flex h-full flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-gradient-to-br from-white/10 to-white/3 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5">
            <div className="rounded-[1rem] border border-white/10 bg-white/8 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-2.5 w-24 rounded-full bg-white/15" />
                  <div className="h-2.5 w-36 rounded-full bg-white/10" />
                </div>
                <div className="rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-brand-200">
                  AI
                </div>
              </div>
              <div className="mt-4 rounded-[0.9rem] border border-white/10 bg-slate-950/60 p-3">
                <div className="h-2.5 w-24 rounded-full bg-brand-400/35" />
                <div className="mt-3 h-2.5 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-2.5 w-5/6 rounded-full bg-white/10" />
                <div className="mt-2 h-2.5 w-2/3 rounded-full bg-white/10" />
              </div>
            </div>

            <div className="grid flex-1 gap-3 md:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[1rem] border border-white/10 bg-white/8 p-4">
                <div className="flex items-center justify-between">
                  <div className="h-2.5 w-24 rounded-full bg-white/15" />
                  <div className="h-2.5 w-12 rounded-full bg-accent-400/25" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-2.5 w-full rounded-full bg-white/10" />
                  <div className="h-2.5 w-4/5 rounded-full bg-white/10" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[1rem] border border-white/10 bg-white/8 p-4">
                  <div className="h-2.5 w-24 rounded-full bg-white/15" />
                  <div className="mt-3 h-2.5 w-full rounded-full bg-white/10" />
                  <div className="mt-2 h-2.5 w-3/4 rounded-full bg-white/10" />
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-white/8 p-4">
                  <div className="h-2.5 w-20 rounded-full bg-white/15" />
                  <div className="mt-3 h-2.5 w-full rounded-full bg-white/10" />
                  <div className="mt-2 h-2.5 w-2/3 rounded-full bg-white/10" />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[1rem] border border-white/10 bg-slate-950/55 p-4">
                <div className="h-2.5 w-28 rounded-full bg-white/15" />
                <div className="mt-4 h-2.5 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-2.5 w-3/4 rounded-full bg-white/10" />
              </div>
              <div className="rounded-[1rem] border border-white/10 bg-slate-950/55 p-4">
                <div className="h-2.5 w-24 rounded-full bg-white/15" />
                <div className="mt-4 h-2.5 w-full rounded-full bg-white/10" />
                <div className="mt-2 h-2.5 w-4/5 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

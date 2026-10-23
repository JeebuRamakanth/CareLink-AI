import { Section } from '../../../components/ui/Section';

function focusDoctorSearch() {
  if (typeof document === 'undefined') return;
  const input = document.getElementById('doctor-search-input') as HTMLInputElement | null;
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}

/**
 * Doctors hero.
 *
 * Single-column composition: the headline carries the section and the actions
 * jump to the real search/filter controls rendered below. There is deliberately
 * NO right-side search card — the working filters live in `FilterBar` where they
 * actually filter results, so the hero never duplicates (or fakes) search.
 */
export function Hero() {
  return (
    <Section title="Doctors" description="Search doctors listed in the source-attributed CareLink corridor directory, then request an appointment." eyebrow="Doctors">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.2),transparent_42%)]" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(22,182,166,0.14),transparent_46%)]" aria-hidden />

        <div className="relative mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">
            Corridor directory
          </div>

          <h2 className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            Find a doctor and request an appointment with clarity.
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-ink-300 sm:text-base">
            Doctors are listed from the published pages of their own facilities. Each listing shows its real source and
            verification status — a directory listing is not a credential check.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={focusDoctorSearch}
              className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
            >
              Find a doctor
            </button>
            <button
              type="button"
              onClick={focusDoctorSearch}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              Explore specialists
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 text-sm text-ink-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Source-attributed listings</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Specialty &amp; facility filters</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Multi-hospital access</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

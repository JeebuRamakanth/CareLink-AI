import { Section } from '../../../components/ui/Section';

export function Hero() {
  const focusSearch = () => {
    document.getElementById('hospital-directory-search')?.focus();
  };

  return (
    <Section title="Machilipatnam healthcare directory" description="Discover hospitals, clinics, and other healthcare facilities near Machilipatnam." eyebrow="Local directory">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.16),transparent_34%)]" />
        <div className="relative max-w-3xl space-y-5">
          <p className="inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-brand-200">
            Machilipatnam · 12 km search radius
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Find local healthcare facilities with source information.
          </h2>
          <p className="text-sm leading-7 text-ink-300 sm:text-base">
            Search by facility name, locality, specialty, or type. Discovered listings are not an exhaustive directory and may require independent confirmation.
          </p>
          <button
            type="button"
            onClick={focusSearch}
            className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            Find a facility
          </button>
        </div>
      </div>
    </Section>
  );
}

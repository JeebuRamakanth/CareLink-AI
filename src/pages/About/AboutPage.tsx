import { Link } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ROUTES } from '../../routes/routeConstants';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  IconArrowRight,
  IconDoctor,
  IconHeart,
  IconHospital,
  IconLab,
  IconPharmacy,
  IconShield,
  IconSparkle,
} from '../../components/agent/AgentIcons';

const PILLARS = [
  {
    icon: IconHeart,
    title: 'Patient-first',
    body: 'Every flow in CareLink.AI starts from the person seeking care — not the system. Clarity, calm, and dignity come before features.',
  },
  {
    icon: IconShield,
    title: 'Safety-first AI',
    body: 'Our assistant offers guidance, never a diagnosis. It points you to real care, labels its own limits, and escalates emergencies visibly.',
  },
  {
    icon: IconSparkle,
    title: 'Human-centered technology',
    body: 'AI should remove friction from healthcare, not humanity from it. CareLink.AI handles the searching and organizing so people can focus on getting well.',
  },
  {
    icon: IconDoctor,
    title: 'Privacy-first health data',
    body: 'Health information is deeply personal. We design for minimum-necessary data use, owner-scoped access, and private-by-default document storage.',
  },
];

const JOURNEY = [
  {
    icon: IconHospital,
    title: 'Hospitals',
    body: 'Discover hospitals, compare facilities, and understand where to go for the care you need.',
  },
  {
    icon: IconDoctor,
    title: 'Doctors',
    body: 'Find the right specialist, review profiles, and choose a clinician with confidence.',
  },
  {
    icon: IconPharmacy,
    title: 'Pharmacies & medicines',
    body: 'Understand medicines from a photo or name — identified carefully, with safety warnings and no invented dosages.',
  },
  {
    icon: IconLab,
    title: 'Labs & reports',
    body: 'Upload lab reports and prescriptions, and see extracted values explained in plain language — always labelled, never over-claimed.',
  },
];

export function AboutPage() {
  useDocumentTitle(
    'About CareLink.AI — Your Healthcare Command Center',
    'CareLink.AI is an AI-first healthcare command center connecting patients with hospitals, doctors, pharmacies, and labs — patient-first, safety-first, and privacy-first.'
  );

  return (
    <Container className="py-10 sm:py-14">
      <div className="space-y-14 sm:space-y-20">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[var(--radius-3xl)] border border-white/10 bg-white/5 px-6 py-12 backdrop-blur-xl sm:px-10 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(77,132,255,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(22,182,166,0.12),transparent_44%)]"
          />
          <div className="relative max-w-3xl space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-500/12 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-brand-100">
              <IconSparkle width={13} height={13} aria-hidden /> About CareLink.AI
            </p>
            <h1 className="text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:text-4xl lg:text-[2.9rem]">
              Healthcare, organized around you.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-ink-300 sm:text-lg sm:leading-8">
              CareLink.AI is an AI-first healthcare command center. It brings hospitals, doctors, appointments,
              medical documents, and an intelligent assistant into one calm, connected place — so the next step in
              care is always clear.
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
              <Button size="lg" className="w-full sm:w-auto">
                <Link to={ROUTES.ai} className="flex items-center gap-2">
                  Ask CareLink AI <IconArrowRight width={16} height={16} aria-hidden />
                </Link>
              </Button>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                <Link to={ROUTES.hospitals}>Explore hospitals</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Mission */}
        <section id="mission" className="grid scroll-mt-28 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">Our healthcare mission</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              One command center for every healthcare decision.
            </h2>
            <p className="text-sm leading-7 text-ink-300 sm:text-base sm:leading-8">
              Navigating healthcare today means juggling provider directories, appointment systems, paper reports,
              and search engines — often at the most stressful moments of life. We believe that complexity should
              never stand between a person and the right care.
            </p>
          </div>
          <Card padding="lg" className="space-y-4">
            <p className="text-sm leading-7 text-ink-200 sm:text-base sm:leading-8">
              CareLink.AI exists to close that gap. Our AI-powered navigation helps you describe what you need in
              plain words, understand your options, and reach real hospitals, doctors, pharmacies, and labs — while
              keeping you in control of your health data at every step.
            </p>
            <p className="text-sm leading-7 text-ink-200 sm:text-base sm:leading-8">
              We are building toward a future where every family has a trusted, intelligent layer between them and
              the healthcare system: one that remembers context, speaks simply, and always knows its limits.
            </p>
          </Card>
        </section>

        {/* Pillars */}
        <section className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">What we stand for</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Principles that shape every decision
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
            {PILLARS.map((pillar) => (
              <Card key={pillar.title} className="space-y-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-400/25 bg-brand-500/12 text-brand-100">
                  <pillar.icon width={20} height={20} aria-hidden />
                </div>
                <h3 className="text-lg font-semibold text-white">{pillar.title}</h3>
                <p className="text-sm leading-7 text-ink-300">{pillar.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Connected journey */}
        <section className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">The connected journey</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Patients, providers, and information — linked
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-ink-300 sm:text-base">
              CareLink.AI connects the pieces of care that usually live in separate places.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {JOURNEY.map((item) => (
              <Card key={item.title} padding="sm" className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-400/25 bg-accent-500/12 text-accent-100">
                  <item.icon width={18} height={18} aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-6 text-ink-300">{item.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Future vision */}
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">Looking ahead</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              A future where care finds clarity
            </h2>
            <p className="text-sm leading-7 text-ink-300 sm:text-base sm:leading-8">
              We are working toward a healthcare experience where your documents, your family&apos;s profiles, your
              appointments, and your questions live in one secure place — and where AI quietly does the coordinating
              in the background. Our ambition is simple: less time navigating the system, more time getting care.
            </p>
          </div>
          <Card padding="lg" className="space-y-4 border-brand-400/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-brand-100">
                <IconShield width={18} height={18} aria-hidden />
              </div>
              <h3 className="text-base font-semibold text-white">A note on trust</h3>
            </div>
            <p className="text-sm leading-7 text-ink-300">
              CareLink.AI is a navigation and guidance platform — not a medical provider. It does not diagnose,
              prescribe, or replace a clinician. In an emergency, always contact your local emergency services first.
            </p>
            <Link to={ROUTES.help} className="inline-flex items-center gap-2 text-sm font-medium text-brand-200 transition-colors hover:text-white">
              Read our safety & privacy commitments <IconArrowRight width={14} height={14} aria-hidden />
            </Link>
          </Card>
        </section>
      </div>
    </Container>
  );
}

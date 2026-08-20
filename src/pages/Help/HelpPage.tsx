import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../components/common/cn';
import { ROUTES } from '../../routes/routeConstants';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpCategory } from './helpData';
import {
  IconArrowRight,
  IconChevronDown,
  IconEmergency,
  IconShield,
} from '../../components/agent/AgentIcons';

type CategoryFilter = HelpCategory | 'All';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useMemo(() => `faq-${question.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [question]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 transition-colors duration-200 hover:border-white/20">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="text-sm font-medium text-white sm:text-[0.95rem]">{question}</span>
        <IconChevronDown
          width={16}
          height={16}
          aria-hidden
          className={cn('shrink-0 text-ink-300 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div id={panelId} role="region" hidden={!open}>
        <p className="px-5 pb-5 text-sm leading-7 text-ink-300">{answer}</p>
      </div>
    </div>
  );
}

const LEGAL_SECTIONS = [
  {
    id: 'privacy',
    title: 'Privacy',
    body: 'CareLink.AI is built privacy-first. We collect the minimum data needed to provide the service, scope medical documents to their owner, never issue public URLs for health files, and isolate family profiles from one another. When running as a local demo without a configured backend, your information never leaves your browser.',
  },
  {
    id: 'terms',
    title: 'Terms of use',
    body: 'CareLink.AI is a healthcare navigation platform. By using it you agree that the service supports — but never replaces — your relationship with qualified healthcare providers, and that you remain responsible for decisions about your care. Do not use the platform for medical emergencies.',
  },
  {
    id: 'medical-disclaimer',
    title: 'Medical disclaimer',
    body: 'Content and AI responses in CareLink.AI are for general guidance and navigation only. They are not medical advice, diagnosis, or treatment, and do not create a doctor–patient relationship. Always consult a qualified healthcare professional about symptoms, medicines, and test results.',
  },
  {
    id: 'emergency-disclaimer',
    title: 'Emergency disclaimer',
    body: 'CareLink.AI is not an emergency service and cannot respond to emergencies in real time. If you or someone near you is experiencing a medical emergency, call your local emergency number immediately. Never delay emergency care because of anything you read or receive in this app.',
  },
];

export function HelpPage() {
  useDocumentTitle(
    'Help Center — CareLink.AI',
    'Learn how CareLink.AI works: finding hospitals and doctors, booking appointments, uploading reports, using the AI assistant, family profiles, privacy, and troubleshooting.'
  );

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_ARTICLES.filter((article) => {
      if (category !== 'All' && article.category !== category) return false;
      if (!q) return true;
      return (
        article.question.toLowerCase().includes(q) ||
        article.answer.toLowerCase().includes(q) ||
        article.category.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  return (
    <Container className="py-10 sm:py-14">
      <div className="space-y-12">
        {/* Hero + search */}
        <section className="relative overflow-hidden rounded-[var(--radius-3xl)] border border-white/10 bg-white/5 px-6 py-12 backdrop-blur-xl sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(77,132,255,0.14),transparent_45%)]"
          />
          <div className="relative mx-auto max-w-2xl space-y-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">Help Center</p>
            <h1 className="text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
              How can we help?
            </h1>
            <p className="text-sm leading-7 text-ink-300 sm:text-base">
              Search guides on finding care, booking appointments, uploading reports, the AI assistant,
              family profiles, and privacy.
            </p>
            <div className="pt-1 text-left">
              <Input
                type="search"
                label="Search help topics"
                placeholder="Try “upload a report” or “find a doctor”…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search help topics"
              />
            </div>
          </div>
        </section>

        {/* Emergency banner */}
        <section
          aria-label="Emergency notice"
          className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-rose-400/25 bg-rose-500/10 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/15 text-rose-200">
            <IconEmergency width={18} height={18} aria-hidden />
          </div>
          <p className="text-sm leading-6 text-rose-100">
            <span className="font-semibold">In a medical emergency, call your local emergency number now.</span>{' '}
            CareLink.AI is not an emergency service and cannot respond to urgent situations in real time.
          </p>
        </section>

        {/* Category chips */}
        <section aria-label="Help categories" className="flex flex-wrap gap-2">
          {(['All', ...HELP_CATEGORIES] as CategoryFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                category === item
                  ? 'border-brand-400/50 bg-brand-500/20 text-white'
                  : 'border-white/10 bg-white/5 text-ink-300 hover:border-white/25 hover:text-white'
              )}
            >
              {item}
            </button>
          ))}
        </section>

        {/* Results */}
        <section aria-label="Help topics" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">
              {category === 'All' ? 'All topics' : category}
            </h2>
            <Badge tone="neutral">
              {filtered.length} {filtered.length === 1 ? 'topic' : 'topics'}
            </Badge>
          </div>
          {filtered.length === 0 ? (
            <Card className="space-y-3 text-center">
              <p className="text-base font-semibold text-white">No topics match your search</p>
              <p className="mx-auto max-w-md text-sm leading-7 text-ink-300">
                Try different keywords, or clear the search to browse all topics. Can&apos;t find what you need?
                Our support team is one message away.
              </p>
              <div className="pt-1">
                <Link
                  to={ROUTES.contact}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5"
                >
                  Contact support <IconArrowRight width={14} height={14} aria-hidden />
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filtered.map((article) => (
                <FaqItem key={article.id} question={article.question} answer={article.answer} />
              ))}
            </div>
          )}
        </section>

        {/* Privacy / terms / disclaimers */}
        <section aria-label="Privacy, terms and disclaimers" className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">Trust & safety</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Privacy, terms & disclaimers</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {LEGAL_SECTIONS.map((section) => (
              <Card key={section.id} id={section.id} className="scroll-mt-28 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent-400/25 bg-accent-500/12 text-accent-100">
                    <IconShield width={16} height={16} aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-white">{section.title}</h3>
                </div>
                <p className="text-sm leading-7 text-ink-300">{section.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section className="relative overflow-hidden rounded-[var(--radius-3xl)] border border-white/10 bg-gradient-to-br from-brand-500/15 via-white/5 to-accent-500/10 px-6 py-10 text-center backdrop-blur-xl sm:px-10">
          <div className="mx-auto max-w-xl space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Still need a hand?</h2>
            <p className="text-sm leading-7 text-ink-300 sm:text-base">
              Send us a message and we&apos;ll point you in the right direction — product questions, account
              help, partnerships, or feedback.
            </p>
            <div className="pt-1">
              <Link
                to={ROUTES.contact}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-24px_rgba(77,132,255,0.7)] transition-all duration-200 hover:-translate-y-0.5"
              >
                Contact support <IconArrowRight width={15} height={15} aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}

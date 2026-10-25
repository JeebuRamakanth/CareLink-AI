import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutContainer } from './LayoutContainer';
import { PageTransition } from './PageTransition';
import { ScrollToTop } from './ScrollToTop';
import { GlobalNavigation } from './GlobalNavigation';
import type { ReactNode } from 'react';
import { ROUTES } from '../../routes/routeConstants';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { NotificationBell } from '../notifications/NotificationBell';

const footerGroups: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Hospitals', href: ROUTES.hospitals },
      { label: 'Doctors', href: ROUTES.doctors },
      { label: 'Pharmacies', href: ROUTES.pharmacies },
      { label: 'Laboratories', href: ROUTES.labs },
      { label: 'Blood Banks', href: ROUTES.bloodBanks },
      { label: 'Reviews', href: ROUTES.reviews },
      { label: 'Appointments', href: ROUTES.appointments },
      { label: 'Ask CareLink AI', href: ROUTES.ai }
    ]
  },
  {
    heading: 'CareLink',
    links: [
      { label: 'About', href: ROUTES.about },
      { label: 'Our Healthcare Mission', href: `${ROUTES.about}#mission` }
    ]
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help Center', href: ROUTES.help },
      { label: 'Contact', href: ROUTES.contact }
    ]
  },
  {
    heading: 'Trust & Safety',
    links: [
      { label: 'Privacy', href: `${ROUTES.help}#privacy` },
      { label: 'Terms', href: `${ROUTES.help}#terms` },
      { label: 'Medical Disclaimer', href: `${ROUTES.help}#medical-disclaimer` },
      { label: 'Emergency Disclaimer', href: `${ROUTES.help}#emergency-disclaimer` }
    ]
  }
];

interface GlobalLayoutProps {
  children: ReactNode;
  activePage?: string;
}

export function GlobalLayout({ children, activePage = 'Home' }: GlobalLayoutProps) {
  const [scrolled, setScrolled] = useState(false);
  const [suspensionDismissed, setSuspensionDismissed] = useState(false);
  const auth = useOptionalAuth();
  const isSuspended = Boolean(auth.isSuspended);
  const isDisabled = auth.user?.accountStatus === 'disabled';
  const showSuspensionBanner = !suspensionDismissed && (isSuspended || isDisabled);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-ink-50">
      {showSuspensionBanner ? (
        <div role="alert" className="border-b border-rose-400/25 bg-rose-950/70 px-4 py-2.5 text-center backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
            <p className="text-sm font-medium text-rose-100">
              {isSuspended
                ? 'Your account is suspended on this server. Your write access is disabled; you can still view non-sensitive public content. If this is an error, contact support.'
                : 'Your account has been disabled. Your write access is disabled; you can still view non-sensitive public content. If this is an error, contact support.'}
            </p>
            <button
              type="button"
              onClick={() => setSuspensionDismissed(true)}
              className="rounded-full border border-rose-400/30 px-3 py-0.5 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <header className={['sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl transition-all duration-300', scrolled ? 'bg-slate-950/70 shadow-[0_10px_40px_-24px_rgba(2,6,23,0.64)]' : 'bg-slate-950/55'].join(' ')}>
        <LayoutContainer>
          <div className="flex h-[72px] items-center justify-between gap-3 sm:h-[76px]">
            {/* Brand — always visible so the identity survives every layout. */}
            <Link to={ROUTES.home} className="group flex min-w-0 items-center gap-3 rounded-full px-1 py-1 transition-transform duration-200 hover:scale-[1.01]" aria-label="CareLink.AI home">
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400/20 to-accent-400/15" />
                <span className="relative">C</span>
              </div>
              <div className="min-w-0 leading-none">
                <p className="truncate text-[0.95rem] font-semibold uppercase tracking-[0.24em] text-white">CareLink.AI</p>
                <p className="mt-1 text-[0.7rem] font-medium text-brand-200">AI for care</p>
              </div>
            </Link>

            {/* The global header is intentionally the brand + this hamburger.
                There is no horizontal navigation rail: every destination lives in
                the drawer so the bar never crowds and cannot duplicate itself. */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Compact account indicator — the only header control that needs to
                  stay outside the drawer for usability (signed-in state + alerts).
                  All destinations still live in the drawer. */}
              {auth.user ? (
                <div className="flex items-center gap-2">
                  <Link
                    to={ROUTES.profile}
                    className="hidden max-w-[10rem] items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[0.82rem] font-medium text-ink-200 transition-all duration-200 hover:bg-white/10 hover:text-white sm:flex"
                    title={auth.user.email}
                  >
                    <span className="inline-flex size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                    <span className="truncate">{auth.user.email}</span>
                  </Link>
                  <NotificationBell />
                </div>
              ) : null}

              <GlobalNavigation />
            </div>
          </div>
        </LayoutContainer>
      </header>

      <PageTransition keyName={activePage}>
        <main id="main-content" className="pb-16">
          {children}
        </main>
      </PageTransition>

      <footer className="border-t border-white/10 bg-slate-950/70 backdrop-blur-2xl">
        <LayoutContainer className="py-12 sm:py-14 lg:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_1fr] lg:gap-x-8 lg:gap-y-12">
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <Link to={ROUTES.home} className="flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50" aria-label="CareLink.AI home">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-400/30 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-sm font-semibold text-white">
                  C
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.24em] text-white uppercase">CareLink.AI</p>
                  <p className="text-xs text-ink-400">Your healthcare command center</p>
                </div>
              </Link>
              <p className="max-w-sm text-sm leading-7 text-ink-300">
                An AI-first healthcare companion that helps you find hospitals, doctors, and care — with guidance you can trust.
              </p>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-300">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent-400" />
                Guidance, not a diagnosis
              </p>
            </div>

            {footerGroups.map((group) => (
              <nav key={group.heading} className="space-y-3.5" aria-label={`Footer — ${group.heading}`}>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-ink-100">
                  <span className="h-1 w-1 rounded-full bg-brand-400/70" aria-hidden />
                  {group.heading}
                </h3>
                <ul className="space-y-1">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="inline-flex min-h-10 w-full items-center rounded-lg py-2 text-sm leading-5 text-ink-300 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-10 border-t border-white/10 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-400">© 2026 CareLink.AI. All rights reserved.</p>
              <p className="max-w-xl text-xs leading-5 text-ink-500">
                CareLink.AI provides healthcare navigation and general guidance. It is not a medical provider and does not replace professional medical advice, diagnosis, or treatment.
              </p>
            </div>
          </div>
        </LayoutContainer>
      </footer>

      <ScrollToTop />
    </div>
  );
}

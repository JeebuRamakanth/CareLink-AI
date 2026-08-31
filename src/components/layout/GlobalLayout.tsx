import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutContainer } from './LayoutContainer';
import { PageTransition } from './PageTransition';
import { ScrollToTop } from './ScrollToTop';
import type { ReactNode } from 'react';
import { ROUTES } from '../../routes/routeConstants';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';

const navItems = [
  { label: 'Home', href: ROUTES.home },
  { label: 'Hospitals', href: ROUTES.hospitals },
  { label: 'Doctors', href: ROUTES.doctors },
  { label: 'Reviews', href: ROUTES.reviews },
  { label: 'Appointments', href: ROUTES.appointments },
  { label: 'Documents', href: ROUTES.documents }
];

const footerGroups: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Hospitals', href: ROUTES.hospitals },
      { label: 'Doctors', href: ROUTES.doctors },
      { label: 'Pharmacies', href: ROUTES.pharmacies },
      { label: 'Laboratories', href: ROUTES.labs },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const auth = useOptionalAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-ink-50">
      <header className={['sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl transition-all duration-300', scrolled ? 'bg-slate-950/70 shadow-[0_10px_40px_-24px_rgba(2,6,23,0.64)]' : 'bg-slate-950/55'].join(' ')}>
        <LayoutContainer>
          <div className="flex h-[80px] items-center justify-between px-0 sm:h-[72px] sm:px-0 md:h-[80px] lg:h-[80px]">
            <Link to={ROUTES.home} className="group flex items-center gap-3 rounded-full px-1 py-1 transition-transform duration-200 hover:scale-[1.01]" aria-label="CareLink.AI home">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400/20 to-accent-400/15" />
                <span className="relative">C</span>
              </div>
              <div className="leading-none">
                <p className="text-[0.95rem] font-semibold tracking-[0.24em] text-white uppercase">CareLink.AI</p>
                <p className="mt-1 text-[0.7rem] font-medium text-brand-200">AI for care</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary navigation">
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.href}
                  className={({ isActive }: { isActive: boolean }) => ['group relative rounded-full px-3 py-2 text-[0.92rem] font-medium tracking-[0.02em] transition-all duration-200', isActive ? 'text-white' : 'text-ink-300 hover:text-white'].join(' ')}
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <span className="relative z-10">{item.label}</span>
                      <span className={['absolute inset-x-1.5 bottom-1.5 h-[2px] rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-200', isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-75 group-hover:opacity-100 group-hover:scale-x-100'].join(' ')} />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="hidden items-center gap-2 xl:flex">
              {auth.user ? (
                <>
                  <Link to={ROUTES.profile} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[0.92rem] font-medium text-ink-200 transition-all duration-200 hover:bg-white/10 hover:text-white">
                    {auth.user.email ? auth.user.email.split('@')[0] : 'Account'}
                  </Link>
                  <Link to={ROUTES.profile} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5">
                    Profile
                  </Link>
                </>
              ) : (
                <>
                  <Link to={ROUTES.login} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[0.92rem] font-medium text-ink-200 transition-all duration-200 hover:bg-white/10 hover:text-white">Login</Link>
                  <Link to={ROUTES.register} className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5">Register</Link>
                </>
              )}
              <Link to={ROUTES.ai} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-[0.92rem] font-semibold text-white shadow-[0_16px_40px_-20px_rgba(77,132,255,0.8)] transition-all duration-200 hover:-translate-y-0.5">
                <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                Ask CareLink AI
              </Link>
            </div>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all duration-200 hover:bg-white/15 xl:hidden"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className="sr-only">Menu</span>
              <div className="flex flex-col gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-white" />
                <span className="h-0.5 w-5 rounded-full bg-white" />
                <span className="h-0.5 w-5 rounded-full bg-white" />
              </div>
            </button>
          </div>
        </LayoutContainer>

        {mobileMenuOpen ? (
          <div className="border-t border-white/10 bg-slate-950/85 backdrop-blur-xl xl:hidden">
            <LayoutContainer className="py-4">
              <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
                <NavLink
                  to={ROUTES.ai}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-sm font-semibold text-white transition-all duration-200"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                  Ask CareLink AI
                </NavLink>
                {navItems.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.href}
                    className={({ isActive }: { isActive: boolean }) => ['rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-ink-200 transition-all duration-200 hover:bg-white/10 hover:text-white', isActive ? 'border-brand-400/30 bg-white/10 text-white' : ''].join(' ')}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
                {auth.user ? (
                  <NavLink to={ROUTES.profile} className="rounded-2xl border border-brand-400/30 bg-white/10 px-4 py-3 text-sm font-medium text-white" onClick={() => setMobileMenuOpen(false)}>
                    {auth.user.email ? auth.user.email : 'Profile'}
                  </NavLink>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" fullWidth onClick={() => setMobileMenuOpen(false)}>
                      <Link to={ROUTES.login} className="w-full">Login</Link>
                    </Button>
                    <Button variant="primary" fullWidth onClick={() => setMobileMenuOpen(false)}>
                      <Link to={ROUTES.register} className="w-full">Register</Link>
                    </Button>
                  </div>
                )}
              </nav>
            </LayoutContainer>
          </div>
        ) : null}
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

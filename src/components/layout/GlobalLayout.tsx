import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutContainer } from './LayoutContainer';
import { PageTransition } from './PageTransition';
import { ScrollToTop } from './ScrollToTop';
import type { ReactNode } from 'react';
import { ROUTES } from '../../routes/routeConstants';

const navItems = [
  { label: 'Home', href: ROUTES.home },
  { label: 'Hospitals', href: ROUTES.hospitals },
  { label: 'Doctors', href: ROUTES.doctors },
  { label: 'Appointments', href: ROUTES.appointments },
  { label: 'Reviews', href: ROUTES.reviews },
  { label: 'About', href: ROUTES.about },
  { label: 'Help', href: ROUTES.help },
  { label: 'Contact', href: ROUTES.contact }
];

interface GlobalLayoutProps {
  children: ReactNode;
  activePage?: string;
}

export function GlobalLayout({ children, activePage = 'Home' }: GlobalLayoutProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
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

            <div className="hidden items-center gap-2 lg:flex">
              <Link to={ROUTES.login} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[0.92rem] font-medium text-ink-200 transition-all duration-200 hover:bg-white/10 hover:text-white">Login</Link>
              <Link to={ROUTES.register} className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5">Register</Link>
              <Link to={ROUTES.home} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-2 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5">
                <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                Emergency
              </Link>
            </div>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all duration-200 hover:bg-white/15 lg:hidden"
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
          <div className="border-t border-white/10 bg-slate-950/85 backdrop-blur-xl lg:hidden">
            <LayoutContainer className="py-4">
              <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
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
        <LayoutContainer className="py-12 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.7fr_0.7fr_0.8fr]">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-400/30 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-sm font-semibold text-white">
                  C
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.24em] text-white uppercase">CareLink.AI</p>
                  <p className="text-xs text-ink-400">Focused on seamless care access</p>
                </div>
              </div>
              <p className="max-w-md text-sm leading-7 text-ink-300">
                A premium digital layer for hospitals, doctors, and patients to connect with speed, trust, and clarity.
              </p>
              <div className="flex gap-3">
                {['in', 'x', 'f'].map((social) => (
                  <a key={social} href="#social" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm text-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15">
                    {social}
                  </a>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-white">Quick Links</h3>
              <ul className="space-y-3 text-sm text-ink-300">
                {['Home', 'Hospitals', 'Doctors', 'Reviews'].map((item) => (
                  <li key={item}><a href="#" className="transition-colors duration-200 hover:text-white">{item}</a></li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-white">Resources</h3>
              <ul className="space-y-3 text-sm text-ink-300">
                {['About', 'Help', 'Contact', 'Support'].map((item) => (
                  <li key={item}><a href="#" className="transition-colors duration-200 hover:text-white">{item}</a></li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-white">Emergency Contact</h3>
              <div className="space-y-2 text-sm text-ink-300">
                <p>24/7 assistance</p>
                <p className="font-semibold text-white">+1 (800) 555-0199</p>
                <p>emergency@carelink.ai</p>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-white/10 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-400">© 2026 CareLink.AI. All rights reserved.</p>
              <div className="flex flex-wrap gap-4 text-sm text-ink-400">
                <a href="#privacy" className="transition-colors duration-200 hover:text-white">Privacy</a>
                <a href="#terms" className="transition-colors duration-200 hover:text-white">Terms</a>
                <a href="#accessibility" className="transition-colors duration-200 hover:text-white">Accessibility</a>
              </div>
            </div>
          </div>
        </LayoutContainer>
      </footer>

      <ScrollToTop />
    </div>
  );
}

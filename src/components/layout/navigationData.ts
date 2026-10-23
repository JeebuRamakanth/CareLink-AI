/**
 * Global navigation model.
 *
 * The header renders these groups in the hamburger drawer, so every destination
 * the app actually has is reachable from one place. Grouping mirrors how the
 * product is used (find care → your health → support) rather than the order the
 * routes happen to be declared.
 *
 * Every `to` here must resolve to a route registered in `AppRoutes.tsx`;
 * `scripts/verify-navigation.mjs` asserts that so a link can never dangle.
 */

import { ROUTES } from '../../routes/routeConstants';

export interface NavItem {
  label: string;
  to: string;
  /** Short description shown under the label in the drawer. */
  hint?: string;
  /** Only rendered for a signed-in user. */
  requiresAuth?: boolean;
  /** Only rendered for an admin/super-admin. */
  requiresAdmin?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

/** High-frequency destinations kept in the header rail on wide screens. */
export const primaryNavItems: NavItem[] = [
  { label: 'Home', to: ROUTES.home },
  { label: 'Hospitals', to: ROUTES.hospitals },
  { label: 'Doctors', to: ROUTES.doctors },
  { label: 'Pharmacies', to: ROUTES.pharmacies },
  { label: 'Labs', to: ROUTES.labs },
  { label: 'Blood Banks', to: ROUTES.bloodBanks },
  { label: 'Reviews', to: ROUTES.reviews },
  { label: 'Appointments', to: ROUTES.appointments },
];

export const navGroups: NavGroup[] = [
  {
    heading: 'Find care',
    items: [
      { label: 'Hospitals', to: ROUTES.hospitals, hint: 'Facilities on the corridor' },
      { label: 'Doctors', to: ROUTES.doctors, hint: 'Specialists and departments' },
      { label: 'Pharmacies', to: ROUTES.pharmacies, hint: 'Medicine shops near you' },
      { label: 'Laboratories', to: ROUTES.labs, hint: 'Diagnostics and testing' },
      { label: 'Blood Banks', to: ROUTES.bloodBanks, hint: 'Blood centres and contact' },
    ],
  },
  {
    heading: 'Your health',
    items: [
      { label: 'Appointments', to: ROUTES.appointments, hint: 'Requests and bookings' },
      { label: 'Documents & Reports', to: ROUTES.documents, hint: 'Uploads and analyses' },
      { label: 'Prescriptions', to: `${ROUTES.documents}?filter=prescriptions`, hint: 'Your prescription files' },
      { label: 'Medicines', to: `${ROUTES.documents}?filter=medicines`, hint: 'Medicine photos and labels' },
      { label: 'Ask CareLink AI', to: ROUTES.ai, hint: 'Symptoms, guidance, discovery' },
      { label: 'CareLink Workspace', to: ROUTES.agent, hint: 'Full command center' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Profile & Settings', to: ROUTES.profile, hint: 'Your details and security', requiresAuth: true },
      { label: 'Sign in', to: ROUTES.login },
      { label: 'Create account', to: ROUTES.register },
      { label: 'Admin Console', to: ROUTES.admin, requiresAdmin: true },
    ],
  },
  {
    heading: 'CareLink',
    items: [
      { label: 'About', to: ROUTES.about },
      { label: 'Help Center', to: ROUTES.help },
      { label: 'Contact', to: ROUTES.contact },
      { label: 'Reviews', to: ROUTES.reviews, hint: 'Verified patient feedback' },
    ],
  },
];

/**
 * Resolve the groups that apply to the current visitor. Auth/admin-only items
 * are filtered out here so the drawer never shows a destination that would only
 * bounce the user (the route guard still enforces access server-side).
 */
export function visibleNavGroups(opts: { isAuthenticated: boolean; isAdmin: boolean }): NavGroup[] {
  return navGroups
    .map((group) => ({
      heading: group.heading,
      items: group.items.filter((item) => {
        if (item.requiresAdmin) return opts.isAdmin;
        if (item.requiresAuth) return opts.isAuthenticated;
        // Hide the sign-in pair once the user is authenticated.
        if (opts.isAuthenticated && (item.to === ROUTES.login || item.to === ROUTES.register)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * True when `pathname` (+ optional search) identifies `to`. Used to mark the
 * current destination. Query-scoped entries (e.g. `/documents?filter=medicines`)
 * only match when their own query is present, so they never compete with the
 * plain `/documents` entry.
 */
export function isNavItemActive(to: string, pathname: string, search: string): boolean {
  const [path, query] = to.split('?');
  if (path === ROUTES.home) return pathname === '/';
  const pathMatches = pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) return false;
  if (!query) return true;
  const expected = new URLSearchParams(query);
  const actual = new URLSearchParams(search);
  for (const [key, value] of expected.entries()) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

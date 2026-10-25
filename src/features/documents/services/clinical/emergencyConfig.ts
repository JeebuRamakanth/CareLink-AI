/**
 * CareLink-AI — emergency contact configuration.
 *
 * Single source of truth for emergency numbers so no surface hardcodes a
 * region-specific number (the app previously showed US 911/988 in an
 * India-focused product).
 *
 * VERIFIED NUMBERS (India):
 *   - 112  : national all-in-one emergency number (police/fire/ambulance),
 *            introduced as India's single emergency number.
 *   - 108  : state ambulance / emergency response services in Andhra Pradesh
 *            and many other states.
 *   - 102  : pregnancy/child-related ambulance services in many states.
 *   - 104  : state medical helpline.
 *   - 14416: national mental-health (Tele-MANAS) helpline.
 *
 * IMPORTANT: these are published public numbers. Availability can differ by
 * state, so the UI always shows the number AND lets the user place the call
 * themselves. The app NEVER claims a call was placed or an ambulance dispatched.
 */

export interface EmergencyContact {
  /** Short label, e.g. "All emergencies". */
  label: string;
  /** Display phone number. */
  phone: string;
  /** `tel:` href with non-dial characters removed. */
  href: string;
  /** One-line description of what this number is for. */
  description: string;
  /** True for the primary nationwide number the UI should emphasise. */
  primary?: boolean;
}

/** Region selector for the emergency contact set. */
export type EmergencyRegion = 'in' | 'generic';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** India — the product's target region. */
export const INDIA_EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    label: 'All emergencies',
    phone: '112',
    href: tel('112'),
    description: 'National emergency number for police, fire and ambulance.',
    primary: true,
  },
  { label: 'Ambulance', phone: '108', href: tel('108'), description: 'State emergency ambulance service (AP and most states).' },
  { label: 'Medical helpline', phone: '104', href: tel('104'), description: 'State medical advice helpline.' },
  { label: 'Mental-health support', phone: '14416', href: tel('14416'), description: 'Tele-MANAS national mental-health helpline.' },
];

/** Region-neutral fallback when the region cannot be determined. */
export const GENERIC_EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    label: 'Local emergency number',
    phone: '112',
    href: tel('112'),
    description: 'Dial your country\'s emergency number (112 works across the EU and India).',
    primary: true,
  },
];

/** The primary contact for a region. */
export function primaryEmergencyContact(region: EmergencyRegion = 'in'): EmergencyContact {
  const list = region === 'in' ? INDIA_EMERGENCY_CONTACTS : GENERIC_EMERGENCY_CONTACTS;
  return list.find((c) => c.primary) ?? list[0];
}

/** The full contact set for a region. */
export function emergencyContacts(region: EmergencyRegion = 'in'): EmergencyContact[] {
  return region === 'in' ? INDIA_EMERGENCY_CONTACTS : GENERIC_EMERGENCY_CONTACTS;
}

/**
 * Copy that is honest about what the app can and cannot do. Rendered verbatim
 * so no surface accidentally promises a dispatch.
 */
export const EMERGENCY_DISCLAIMER =
  'CareLink.AI cannot place a call or dispatch an ambulance for you. Tapping a number opens your phone dialler — you must confirm the call yourself. Tell the operator your exact location and the emergency.';

/** Spoken/typed location guidance shown with the emergency banner. */
export const EMERGENCY_LOCATION_PROMPT =
  'If you can, share your current location or a nearby landmark with the emergency operator.';

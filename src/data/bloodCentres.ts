/**
 * CareLink-AI — blood centre directory (SOURCE-ATTRIBUTED CURATED EVIDENCE).
 *
 * Every entry below was read from a public, attributable source and is stored
 * with that source URL and the date it was checked. Nothing is invented: a
 * field a source did not publish stays absent rather than guessed.
 *
 * SOURCES (checked 2026-10-22)
 *   - Indian Red Cross Society, "List of IRCS Blood Centres as of Sep 2026"
 *     https://www.indianredcross.org/ircsbloodbanks/
 *   - Provider websites (hospital-associated blood centres) as cited per record.
 *
 * LIVE STOCK IS NOT AVAILABLE. e-RaktKosh (https://eraktkosh.mohfw.gov.in) is
 * the national stock service; it serves stock through an interactive session and
 * its search endpoints reject direct requests, so no stock figure is displayed.
 * Each centre therefore carries `stock_source: 'not_integrated'` and the UI
 * shows the centre's public contact details plus the official stock link.
 *
 * HONESTY RULES
 *   - `is_verified` is false: a directory listing is not proof of current
 *     operation, licence status or stock.
 *   - A centre is linked to a hospital (`hospital_id`) only when the source
 *     states the association.
 */

import type { BloodCentre } from '../types';

const CHECKED = '2026-10-22';
const CREATED = '2026-10-22T00:00:00.000Z';

const IRCS = 'Indian Red Cross Society — List of IRCS Blood Centres (Sep 2026)';
const IRCS_URL = 'https://www.indianredcross.org/ircsbloodbanks/';

export const bloodCentresData: BloodCentre[] = [
  {
    id: '7f500000-0000-4000-8000-43152bb9d603',
    slug: 'ircs-dr-pattabhi-red-cross-blood-centre-machilipatnam',
    name: 'IRCS Dr. Pattabhi Red Cross Blood Centre, Machilipatnam',
    address: 'DM&HO Campus, 21/276, Parasupeta, Machilipatnam, Krishna District, Andhra Pradesh',
    locality: 'Machilipatnam',
    district: 'Krishna',
    pincode: '521001',
    state: 'Andhra Pradesh',
    country: 'India',
    phone: '7793939660',
    phone_alt: '9182609909',
    ownership: 'Charitable',
    category_label: 'Red Cross blood centre',
    stock_source: 'not_integrated',
    is_verified: false,
    last_imported_at: CHECKED,
    provenance: {
      data_source: IRCS,
      source_url: IRCS_URL,
      data_status: 'SOURCE_LISTED',
      fetched_at: CHECKED,
    },
  },
  {
    id: '7f500000-0000-4000-8000-26f17fca3214',
    slug: 'ircs-blood-bank-vijayawada-gandhi-nagar',
    name: 'IRCS Blood Bank, Vijayawada (Gandhi Nagar)',
    address: 'G.R. Raju Street, D.No. 26-5-5, Red Cross Building, Gandhi Nagar, Vijayawada 520003, Andhra Pradesh',
    locality: 'Vijayawada',
    district: 'NTR',
    pincode: '520003',
    state: 'Andhra Pradesh',
    country: 'India',
    phone: '8977008540',
    ownership: 'Charitable',
    category_label: 'Red Cross blood centre',
    stock_source: 'not_integrated',
    is_verified: false,
    last_imported_at: CHECKED,
    provenance: {
      data_source: IRCS,
      source_url: IRCS_URL,
      data_status: 'SOURCE_LISTED',
      fetched_at: CHECKED,
    },
  },
  {
    id: '7f500000-0000-4000-8000-770ad2120b87',
    slug: 'ircs-blood-centre-gudivada',
    name: 'IRCS Blood Centre, Gudivada',
    address: 'Gudivada, Krishna District, Andhra Pradesh',
    locality: 'Gudivada',
    district: 'Krishna',
    state: 'Andhra Pradesh',
    country: 'India',
    phone: '',
    ownership: 'Charitable',
    category_label: 'Red Cross blood centre',
    stock_source: 'not_integrated',
    is_verified: false,
    last_imported_at: CHECKED,
    provenance: {
      data_source: IRCS,
      source_url: IRCS_URL,
      data_status: 'SOURCE_LISTED',
      fetched_at: CHECKED,
    },
  },
];

export const BLOOD_CENTRE_CREATED_AT = CREATED;

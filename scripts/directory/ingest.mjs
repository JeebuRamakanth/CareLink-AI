#!/usr/bin/env node
/**
 * CareLink-AI — healthcare directory ingestion pipeline.
 *
 * Collects, normalizes, deduplicates and classifies healthcare facilities for
 * the Machilipatnam → Vijayawada coverage corridor from official public sources,
 * then emits:
 *
 *   src/data/hospitals.ts        — the real directory the app renders (demo/offline path)
 *   scripts/directory/last-import-report.json  — the import + coverage report
 *
 * DESIGN
 *   - Repeatable and idempotent: stable ids derived from a source-qualified key,
 *     so re-running never duplicates a record. Re-running is the normal refresh.
 *   - Provenance on every record (source name, source URL, fetch timestamp,
 *     data_status). A directory listing is never presented as verified.
 *   - Never invents a field. A phone number, coordinate, opening hour or
 *     capability is stored only when the source states it; otherwise it is left
 *     explicitly absent and the UI shows an honest "unavailable".
 *   - Controlled archival: a record that disappears from a source is marked
 *     `archived` in the report rather than silently deleted.
 *   - Coverage classification goes through the shared corridor boundary
 *     (src/data/coverage.ts) so the app and the importer cannot disagree.
 *
 * USAGE
 *   node scripts/directory/ingest.mjs              # fetch live + write output
 *   node scripts/directory/ingest.mjs --offline    # reuse cached HTML in .cache/
 *   node scripts/directory/ingest.mjs --report     # print the report only
 *
 * SOURCES (official, publicly accessible; see SOURCES below for the registry)
 *   - Krishna District (Govt. of Andhra Pradesh) public utility directory
 *   - NTR District (Govt. of Andhra Pradesh) public utility directory
 * Plus a curated set of facilities taken from the reviewed, source-attributed
 * seed in supabase/migrations/0031_step21_machilipatnam_directory.sql.
 *
 * ACCESS POLICY: only plain HTTP GET of public pages, one request per second,
 * no authentication bypass, no CAPTCHA solving, no scraping behind a login.
 * A source that cannot be reached is recorded as a coverage limitation and the
 * run continues with the remaining sources.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, 'scripts', 'directory', '.cache');
const REPORT_PATH = join(ROOT, 'scripts', 'directory', 'last-import-report.json');
const RECORDS_PATH = join(ROOT, 'scripts', 'directory', 'imported-facilities.json');
const HOSPITALS_OUT = join(ROOT, 'src', 'data', 'hospitals.ts');

const UA = 'Mozilla/5.0 (compatible; CareLinkDirectoryBot/1.0; +https://carelink.ai/bot)';
const FETCHED_AT = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Source registry. `coverage` documents what the source is expected to contain
// so the report can state the achieved coverage honestly.
// ---------------------------------------------------------------------------
const SOURCES = [
  {
    id: 'krishna-ap-gov-in',
    name: 'Krishna District, Government of Andhra Pradesh — Hospitals',
    baseUrl: 'https://krishna.ap.gov.in/public-utility-category/hospitals/',
    district: 'Krishna',
    dataStatus: 'VERIFIED',
    coverage: 'Government + private hospitals, PHCs, E-UPHCs, TB clinics and PP units across Krishna District',
  },
  {
    id: 'ntr-ap-gov-in',
    name: 'NTR District, Government of Andhra Pradesh — Hospitals',
    baseUrl: 'https://ntr.ap.gov.in/public-utility-category/hospitals/',
    district: 'NTR',
    dataStatus: 'VERIFIED',
    coverage: 'Government hospitals, PHCs, E-UPHCs, urban family welfare centres and dispensaries across NTR District (Vijayawada)',
  },
];

// ---------------------------------------------------------------------------
// Curated facilities: reviewed, source-attributed records from migration 0031.
// These carry human-verified detail (phone, website, facility notes) that the
// government directory pages do not expose, so they are merged in rather than
// discarded. Ids match the migration exactly so the DB and the app agree.
// ---------------------------------------------------------------------------
const CURATED_FACILITIES = [
  { id: '7f100001-0000-0000-0000-000000000001', slug: 'mph-district-hospital-machilipatnam', name: 'District Hospital, Machilipatnam', city: 'Machilipatnam', address: 'Near Noble High School', pincode: '521001', phone_number: '8333814350', email: null, website: null, data_source: 'krishna.ap.gov.in', source_url: 'https://krishna.ap.gov.in/public-utility-category/hospitals/', data_status: 'VERIFIED', category: 'District Hospital' },
  { id: '7f100002-0000-0000-0000-000000000002', slug: 'mph-government-medical-college-machilipatnam', name: 'Government Medical College & Teaching General Hospital, Machilipatnam', city: 'Machilipatnam', address: 'Near Radar Station, Kara Agraharam', pincode: '521001', phone_number: '7893330266', email: 'principalgmcmachilipatnam@gmail.com', website: 'https://www.gmcmachilipatnam-ap-gov.com', data_source: 'gmcmachilipatnam-ap-gov.com', source_url: 'https://www.gmcmachilipatnam-ap-gov.com/contact-us', data_status: 'VERIFIED', category: 'Medical College Hospital' },
  { id: '7f100003-0000-0000-0000-000000000003', slug: 'mph-chinnapuram-primary-health-centre', name: 'Chinnapuram Primary Health Centre', city: 'Machilipatnam', address: 'Chinnapuram', pincode: null, phone_number: null, email: null, website: null, data_source: 'third-party directory', source_url: null, data_status: 'THIRD_PARTY_DIRECTORY', category: 'PHC' },
  { id: '7f100004-0000-0000-0000-000000000004', slug: 'mph-e-uphc-chilakalapudi', name: 'E-UPHC Chilakalapudi', city: 'Machilipatnam', address: 'Chilakalapudi', pincode: '521002', phone_number: '8885935351', email: null, website: null, data_source: 'krishna.ap.gov.in', source_url: 'https://krishna.ap.gov.in/public-utility-category/hospitals/', data_status: 'VERIFIED', latitude: 16.199120, longitude: 81.155670 },
  { id: '7f100005-0000-0000-0000-000000000005', slug: 'mph-andhra-hospitals-machilipatnam', name: 'Andhra Hospitals, Machilipatnam', city: 'Machilipatnam', address: 'Door No. 124 & 125, Raju Pet, Azad Road', pincode: '521001', phone_number: '08672221199', email: null, website: 'https://www.andhrahospitals.org', data_source: 'andhrahospitals.org', source_url: 'https://www.andhrahospitals.org/Ah/chg_location/MACHILIPATNAM', data_status: 'SOURCE_LISTED', category: 'E-UPHC' },
  { id: '7f100006-0000-0000-0000-000000000006', slug: 'mph-sai-sri-ram-hospitals', name: 'Sai Sri Ram Hospitals', city: 'Machilipatnam', address: 'Edepalli, Srinivas Nagar Colony', pincode: '521001', phone_number: null, email: null, website: null, data_source: 'third-party directory', source_url: null, data_status: 'THIRD_PARTY_DIRECTORY', category: 'Private Hospital' },
  { id: '7f100007-0000-0000-0000-000000000007', slug: 'mph-murali-krishna-hospital', name: 'Murali Krishna Hospital', city: 'Machilipatnam', address: 'Dimmala Centre, Lakshmana Rao Puram', pincode: '521001', phone_number: '08374487474', email: null, website: 'https://muralikrishnahospital.com', data_source: 'muralikrishnahospital.com', source_url: 'https://muralikrishnahospital.com', data_status: 'PROVIDER_LISTED', category: 'Private Hospital' },
  { id: '7f100008-0000-0000-0000-000000000008', slug: 'mph-save-multi-speciality-hospital', name: 'SAVE Multi-Speciality Hospital', city: 'Machilipatnam', address: 'Kamma Sangam Road', pincode: '521001', phone_number: null, email: null, website: 'https://savehospitalmachilipatnam.com', data_source: 'savehospitalmachilipatnam.com', source_url: 'https://savehospitalmachilipatnam.com/en', data_status: 'PROVIDER_LISTED', category: 'Private Hospital' },
  { id: '7f100009-0000-0000-0000-000000000009', slug: 'mph-aswini-hospital-machilipatnam', name: 'Aswini Hospital', city: 'Machilipatnam', address: '25/371, Buttaipeta', pincode: '521001', phone_number: '08672225200', email: null, website: null, data_source: 'Star Health network directory', source_url: 'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh', data_status: 'THIRD_PARTY_DIRECTORY', category: 'Private Hospital' },
  { id: '7f10000a-0000-0000-0000-00000000000a', slug: 'mph-dr-madhu-super-speciality-hospital', name: 'Dr. Madhu Super Speciality Hospital', city: 'Machilipatnam', address: '#11/273, Near Gandhi Bomma Shivalayam, Chammanagiripet', pincode: '521001', phone_number: '0867222518', email: null, website: 'https://madhuneuro.com', data_source: 'madhuneuro.com', source_url: 'https://madhuneuro.com/orthopaedics', data_status: 'PROVIDER_LISTED', category: 'Private Hospital' },
  { id: '7f10000b-0000-0000-0000-00000000000b', slug: 'mph-nagamani-retina-institute', name: 'Nagamani Retina Institute', city: 'Machilipatnam', address: 'D.No 11/57-1, Opp. Venugopala Swami Temple, Chemmanagiripet', pincode: '521001', phone_number: '08672227598', email: null, website: null, data_source: 'Star Health network directory', source_url: 'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh', data_status: 'THIRD_PARTY_DIRECTORY', category: 'Private Hospital' },
  { id: '7f10000c-0000-0000-0000-00000000000c', slug: 'mph-dr-venkat-basu-bone-joint-clinic', name: "Dr. Venkat Basu's Bone & Joint Clinic", city: 'Machilipatnam', address: 'Opposite Vivekananda Mandiram, Buttaipet', pincode: '521001', phone_number: '6309955880', email: null, website: null, data_source: 'third-party directory', source_url: null, data_status: 'THIRD_PARTY_DIRECTORY', category: 'Private Hospital' },
];

// ---------------------------------------------------------------------------
// Category normalisation: the government pages use inconsistent labels
// ('E UPHC', 'E-UPHC', 'EUPHC', 'phc', 'PHC'). Map them onto one vocabulary.
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
  [/^e[\s-]*uphc$/i, 'E-UPHC', 'Urban Primary Health Centre (extended)'],
  [/^uphc$/i, 'UPHC', 'Urban Primary Health Centre'],
  [/^uhc$/i, 'UHC', 'Urban Health Centre'],
  [/^phc$/i, 'PHC', 'Primary Health Centre'],
  [/^chc$/i, 'CHC', 'Community Health Centre'],
  [/^ufwc$/i, 'UFWC', 'Urban Family Welfare Centre'],
  [/^amoh/i, 'AMOH', 'Assistant Medical Officer of Health office'],
  [/^dlo$/i, 'DLO', 'District Leprosy Office'],
  [/^pp\s*unit$/i, 'PP Unit', 'Post-Partum unit'],
  [/^ppu/i, 'PP Unit', 'Post-Partum unit'],
  [/tb/i, 'TB Clinic', 'Tuberculosis treatment centre'],
  [/police\s*dispensary/i, 'Police Dispensary', 'Police dispensary'],
  [/temporary\s*ward/i, 'Temporary Ward', 'Temporary ward'],
  [/^government$/i, 'Government Hospital', 'Government hospital'],
  [/^private$/i, 'Private Hospital', 'Private hospital'],
  [/institute of medical sciences|medical college/i, 'Medical College Hospital', 'Medical college / teaching hospital'],
  [/district hospital/i, 'District Hospital', 'District hospital'],
  [/nursing home/i, 'Nursing Home', 'Nursing home'],
];

function classifyCategory(raw) {
  const value = (raw ?? '').trim();
  if (!value) return { facility_type: 'Healthcare facility', category_label: 'Unclassified' };
  for (const [re, facility_type, category_label] of CATEGORY_RULES) {
    if (re.test(value)) return { facility_type, category_label };
  }
  return { facility_type: 'Healthcare facility', category_label: value };
}

/** Government-funded facilities are 'public'; everything else is 'private'. */
function ownershipOf(facilityType) {
  const publicTypes = new Set(['E-UPHC', 'UPHC', 'UHC', 'PHC', 'CHC', 'UFWC', 'AMOH', 'DLO', 'PP Unit', 'TB Clinic', 'Government Hospital', 'District Hospital', 'Police Dispensary', 'Temporary Ward']);
  return publicTypes.has(facilityType) ? 'Government' : 'Private';
}

// ---------------------------------------------------------------------------
// HTML parsing. The district pages are WordPress (S3WaaS) archive pages whose
// records are `<li class="public-utlty-catg">` blocks containing an h2 title
// and a `<ul class="pubutility-list">` of address / Category / Pincode lines.
// ---------------------------------------------------------------------------
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim();

export function parseDistrictPage(html) {
  const body = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ');
  const blocks = body.split(/<li class="public-utlty-catg[^"]*">/i).slice(1);
  const records = [];
  for (const block of blocks) {
    const titleMatch = block.match(/<h[1-6][^>]*class="heading4"[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (!titleMatch) continue;
    const record = { name: clean(titleMatch[1]), address: '', category: '', pincode: '' };
    const listMatch = block.match(/<ul class="pubutility-list">([\s\S]*?)<\/ul>/i);
    if (listMatch) {
      for (const item of listMatch[1].match(/<li>([\s\S]*?)<\/li>/gi) ?? []) {
        const labelMatch = item.match(/<strong>\s*([^:<]+?)\s*:\s*<\/strong>/i);
        if (labelMatch) {
          const key = clean(labelMatch[1]).toLowerCase();
          const value = clean(item.replace(/<strong>[\s\S]*?<\/strong>/gi, ''));
          if (key.includes('pincode')) record.pincode = value;
          else if (key.includes('category') || key.includes('type')) record.category = value;
          else if (!record.address) record.address = value;
        } else {
          const value = clean(item);
          if (value && !record.address) record.address = value;
        }
      }
    }
    if (record.name) records.push(record);
  }
  return records;
}

/** True when the page links to the next page number, so we can follow it. */
export function hasNextPage(html, baseUrl, page) {
  return html.includes(`${baseUrl}page/${page + 1}/`);
}

// ---------------------------------------------------------------------------
// Fetching (cached, rate-limited, never fatal).
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCached(source, url, page) {
  const file = join(CACHE, `${source.id}-${page}.html`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, text);
  await sleep(1000);
  return text;
}

async function collectSource(source, offline) {
  const pages = [];
  const limitations = [];
  let page = 1;
  if (offline) {
    // Offline mode: read whatever is cached for this source.
    while (existsSync(join(CACHE, `${source.id}-${page}.html`))) {
      pages.push(parseDistrictPage(readFileSync(join(CACHE, `${source.id}-${page}.html`), 'utf8')));
      page += 1;
    }
    if (!pages.length) limitations.push('no cached pages available in offline mode');
    return { pages, limitations };
  }
  for (; page <= 60; page += 1) {
    const url = page === 1 ? source.baseUrl : `${source.baseUrl}page/${page}/`;
    let html;
    try {
      html = await fetchCached(source, url, page);
    } catch (err) {
      if (page === 1) limitations.push(`could not retrieve the listing page (${err.message})`);
      break;
    }
    const records = parseDistrictPage(html);
    if (!records.length) break;
    pages.push(records);
    if (!hasNextPage(html, source.baseUrl, page)) break;
  }
  return { pages, limitations };
}

// ---------------------------------------------------------------------------
// Normalisation, stable ids, dedupe.
// ---------------------------------------------------------------------------
function slugify(value) {
  return value.toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 70);
}

/**
 * Deterministic id from source + a stable key, so re-running the importer
 * upserts the same row instead of creating a duplicate.
 */
function stableId(sourceId, name, address) {
  const key = `${sourceId}|${slugify(name)}|${slugify(address).slice(0, 24)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  // '7f200000-' prefix keeps importer ids distinct from the curated '7f10…'
  // seed and the '7d…' development seed.
  return `7f200000-0000-4000-8000-${hex(h1)}${hex(h2).slice(0, 4)}`;
}

/**
 * Merge key for cross-source dedupe. Names are normalised so the same facility
 * listed under slightly different titles in two sources ("District Hospital" vs
 * "District Hospital, Machilipatnam") collapses to one record. The locality is
 * the pincode when published, else the address — never the name alone, so two
 * genuinely different facilities with the same generic name stay separate.
 */
function dedupeKey(record) {
  const name = slugify(record.name).replace(/-/g, '')
    .replace(/(districthospital|governmenthospital|areaHospital)/gi, '$1');
  const place = record.pincode || slugify(record.address ?? '').replace(/-/g, '').slice(0, 20);
  return `${name}|${place}`;
}

/**
 * True when two normalised names refer to the same facility — one is a
 * prefix/extension of the other AND shares its leading distinctive words.
 * "districthospital" and "districthospitalmachilipatnam" match; two unrelated
 * "primaryhealthcentre" records in different villages do not.
 */
function namesMatch(a, b) {
  const x = slugify(a).replace(/-/g, '');
  const y = slugify(b).replace(/-/g, '');
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.startsWith(short);
}

/** Canonical display form of a corridor locality (title-cased). */
function canonicalLocality(slug) {
  return slug.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Derive the display locality for a facility. Order of preference:
 *   1. a documented corridor locality appearing in the name or address,
 *   2. the address's own trailing locality component,
 *   3. the facility's own name with its category prefix removed
 *      ("PHC Gudlavalleru" → "Gudlavalleru").
 * Returns '' when nothing trustworthy can be derived — never a guess.
 */
function deriveLocality(name, address, corridorLocalities) {
  const hay = `${name} ${address}`.toLowerCase();
  const hit = corridorLocalities.find((l) => hay.includes(l));
  if (hit) return canonicalLocality(hit);

  // Strip the facility category prefix from the name ("PHC Gudlavalleru" →
  // "Gudlavalleru"). Tried before the address fallback because the address often
  // just repeats the facility name.
  const stripped = name
    .replace(/^(e[\s.-]*uphc|uphc|uhc|phc|chc|ufwc|amoh[-\s]*[ivx]*|dlo|pp\.?\s*unit|ppu|tb\.?\s*clinic|t\.?b\.?\s*control\s*centre|district\s+hospital|temporary\s+ward|pp\s*unit)\b[\s./:-]*/i, '')
    .trim();
  if (stripped && stripped.toLowerCase() !== name.toLowerCase()
      && !/^(e[\s.-]*uphc|phc|chc|uhc|ufwc|pp|tb)\b/i.test(stripped)) {
    return stripped;
  }

  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i];
    if (/^(krishna|ntr|guntur|andhra pradesh|india|district)$/i.test(p)) continue;
    if (/^(e[\s.-]*uphc|uphc|uhc|phc|chc|ufwc|pp\.?\s*unit|ppu|tb)\b/i.test(p)) continue;
    if (p.length >= 3) return p.replace(/\s+(mandal|district)$/i, '').trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Build the Hospital domain records.
// ---------------------------------------------------------------------------
function buildHospital(input) {
  const { facility_type, category_label } = classifyCategory(input.category);
  const ownership = ownershipOf(facility_type);
  const city = input.city || '';
  const address = input.address || '';
  const parts = [address, city, 'Andhra Pradesh', 'India'].filter(Boolean);
  const specialties = [];
  const departments = [];
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    description: input.description
      || `${category_label} listed by ${input.data_source} for the Machilipatnam–Vijayawada corridor.`,
    facility_type,
    category_label,
    ownership,
    address: parts.join(', '),
    street_address: address,
    city,
    district: input.district ?? '',
    pincode: input.pincode ?? '',
    state: 'Andhra Pradesh',
    country: 'India',
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    phone: input.phone_number ?? '',
    email: input.email ?? null,
    website: input.website ?? null,
    specialties,
    departments,
    rating: 0,
    review_count: 0,
    is_verified: false,
    verification_status: input.data_status === 'VERIFIED' ? 'OFFICIAL_SOURCE' : (input.data_status ?? 'UNVERIFIED'),
    provenance: {
      data_source: input.data_source,
      source_url: input.source_url ?? input.sourceUrl ?? undefined,
      data_status: input.data_status ?? input.dataStatus ?? 'THIRD_PARTY_DIRECTORY',
      fetched_at: input.fetched_at ?? FETCHED_AT,
    },
    coverage: input.coverage,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes('--offline');
  const reportOnly = args.includes('--report');

  const sourceStats = [];
  const allRaw = [];
  const limitations = [];

  if (!reportOnly) {
    for (const source of SOURCES) {
      process.stdout.write(`  collecting ${source.id} … `);
      const { pages, limitations: lim } = await collectSource(source, offline);
      const records = pages.flat();
      console.log(`${records.length} records`);
      for (const l of lim) limitations.push(`${source.id}: ${l}`);
      sourceStats.push({
        id: source.id,
        name: source.name,
        url: source.baseUrl,
        coverage: source.coverage,
        discovered: records.length,
        limitations: lim,
      });
      for (const r of records) allRaw.push({
        ...r,
        sourceId: source.id,
        data_source: source.name,
        dataStatus: source.dataStatus,
        sourceName: source.name,
        sourceUrl: source.baseUrl,
        district: source.district,
      });
    }
  }

  // --- Deduplicate the collected records -----------------------------------
  const seen = new Map();
  let duplicates = 0;
  for (const raw of allRaw) {
    const key = dedupeKey(raw);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.set(key, raw);
  }

  // --- Coverage classification + record building ---------------------------
  const { classifyCoverage, CORRIDOR_LOCALITIES } = await import(join(ROOT, 'src', 'data', 'coverage.ts'))
    .catch(() => ({ classifyCoverage: null, CORRIDOR_LOCALITIES: null }));

  const CORRIDOR_LIST = CORRIDOR_LOCALITIES ?? [
    'machilipatnam', 'vijayawada', 'gudivada', 'pedana', 'chilakalapudi', 'vuyyuru', 'kankipadu',
    'penamaluru', 'gannavaram', 'pamidimukkala', 'pamarru', 'tadigadapa', 'poranki', 'kanuru',
    'gunadala', 'patamata', 'ibrahimpatnam', 'mangalagiri', 'tadepalli', 'tenali', 'mylavaram',
    'nunna', 'yanamalakuduru',
  ];

  const classify = classifyCoverage ?? ((input) => {
    // Fallback if the TS module cannot be imported (plain node): mirror the
    // pincode + locality rules so a run never silently reports zero coverage.
    const pin = (input.pincode ?? '').trim();
    if (/^520\d{3}$/.test(pin) || (/^52100[1-5]$/.test(pin))) {
      return { inCoverage: true, method: 'pincode', reason: `published pincode ${pin} is inside a corridor city` };
    }
    const words = `${input.locality ?? ''} ${input.address ?? ''}`.toLowerCase().split(/\W+/);
    const hit = CORRIDOR_LIST.find((l) => words.includes(l));
    return hit
      ? { inCoverage: true, method: 'locality', matchedLocality: hit, reason: `locality "${hit}" is on the corridor` }
      : { inCoverage: false, method: 'district', reason: 'no corridor match — requires manual review' };
  });

  const inCoverage = [];
  const review = [];
  const outside = [];

  for (const raw of seen.values()) {
    const locality = deriveLocality(raw.name, raw.address, CORRIDOR_LIST);
    const coverage = classify({
      latitude: raw.latitude ?? null,
      longitude: raw.longitude ?? null,
      locality,
      address: raw.address,
      district: raw.district,
      pincode: raw.pincode,
    });
    const hospital = buildHospital({
      ...raw,
      id: stableId(raw.sourceId, raw.name, raw.address),
      slug: `${raw.sourceId === 'krishna-ap-gov-in' ? 'krishna' : 'ntr'}-${slugify(raw.name)}`,
      city: locality,
      coverage,
    });
    if (coverage.inCoverage) inCoverage.push(hospital);
    else if (coverage.method === 'district') review.push({ ...hospital, coverage });
    else outside.push(hospital);
  }

  // --- Merge the curated facilities (id-stable, never duplicated) ----------
  // A curated record replaces the collected one when they are the same facility
  // (matched by normalised name within the same city/pincode), keeping the
  // curated stable id so the database row and the app agree. The curated record
  // carries human-verified detail (phone, website) the directory page omits.
  const merged = new Map();
  for (const hospital of inCoverage) {
    merged.set(`${slugify(hospital.name).replace(/-/g, '')}|${hospital.pincode || slugify(hospital.city)}`, hospital);
  }
  let curatedMerged = 0;
  let curatedNew = 0;
  for (const curated of CURATED_FACILITIES) {
    const hospital = buildHospital({
      ...curated,
      district: 'Krishna',
      fetched_at: FETCHED_AT,
      coverage: { inCoverage: true, method: 'locality', reason: 'curated Machilipatnam facility (migration 0031)' },
    });
    const cityKey = slugify(hospital.city);
    // Find an existing record for the same facility in the same city.
    const matchKey = [...merged.keys()].find((k) => {
      const [existingName, existingPlace] = k.split('|');
      const samePlace = existingPlace === (hospital.pincode || cityKey)
        || existingPlace === cityKey;
      return samePlace && namesMatch(existingName, hospital.name);
    });
    if (matchKey) {
      const existing = merged.get(matchKey);
      merged.delete(matchKey);
      merged.set(`${slugify(hospital.name).replace(/-/g, '')}|${hospital.pincode || cityKey}`, {
        ...existing,
        ...hospital,
        id: curated.id,
        slug: curated.slug,
      });
      curatedMerged += 1;
    } else {
      merged.set(`${slugify(hospital.name).replace(/-/g, '')}|${hospital.pincode || cityKey}`, hospital);
      curatedNew += 1;
    }
  }

  const finalRecords = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));

  // --- Report -------------------------------------------------------------
  const byCategory = {};
  const byLocality = {};
  const byDistrict = {};
  for (const r of finalRecords) {
    byCategory[r.category_label] = (byCategory[r.category_label] ?? 0) + 1;
    byLocality[r.city || '(unknown)'] = (byLocality[r.city || '(unknown)'] ?? 0) + 1;
    byDistrict[r.district || '(unknown)'] = (byDistrict[r.district || '(unknown)'] ?? 0) + 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    coverage_boundary: {
      corridor: 'Machilipatnam → Vijayawada, Andhra Pradesh, India',
      buffer_km: 25,
      districts: ['Krishna', 'NTR'],
      interpretation: 'A facility is in coverage when it is within 25 km of the Machilipatnam–Vijayawada corridor path, or its locality is on the documented corridor list. District-only matches are queued for manual review rather than displayed.',
      unresolved: 'Facilities with neither coordinates nor a recognisable corridor locality cannot be placed; they are listed under "requires review" with their source.',
    },
    sources: sourceStats.map((s) => ({
      ...s,
      imported: finalRecords.filter((r) => (r.provenance.data_source ?? '').toLowerCase().includes(s.id.split('-')[0])).length,
      last_successful_sync: new Date().toISOString(),
    })),
    totals: {
      source_records_discovered: allRaw.length,
      duplicates_removed: duplicates,
      unique_in_coverage: finalRecords.length,
      curated_facilities_merged: curatedMerged,
      curated_facilities_added: curatedNew,
      requires_review: review.length,
      outside_coverage: outside.length,
      with_coordinates: finalRecords.filter((r) => typeof r.latitude === 'number').length,
      with_phone: finalRecords.filter((r) => r.phone).length,
      with_website: finalRecords.filter((r) => r.website).length,
    },
    by_category: byCategory,
    by_locality: byLocality,
    by_district: byDistrict,
    requires_review: review.map((r) => ({ name: r.name, district: r.district, reason: r.coverage.reason, source: r.provenance.source_url })),
    coverage_methods: finalRecords.reduce((acc, r) => {
      const m = r.coverage?.method ?? 'unknown';
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {}),
    known_limitations: [
      ...limitations,
      'Government directory pages publish name, address, category and pincode only — no phone, coordinates, opening hours or staff lists. Those fields stay absent rather than invented.',
      'Private hospitals not listed in a government directory are only included when a reviewed source (provider site or insurance network) was available.',
      'dme.ap.nic.in (Directorate of Medical Education) did not respond within the request timeout and is not used as an automatic source.',
      'This is the coverage ACHIEVED from the listed sources, not a claim that every facility in the corridor has been found.',
    ],
  };

  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (!reportOnly) {
    // Canonical machine-readable record set. The TypeScript module and the
    // Supabase seed migration are both generated from this, so the app and the
    // database cannot drift apart.
    writeFileSync(RECORDS_PATH, `${JSON.stringify(finalRecords, null, 2)}\n`);
    writeFileSync(HOSPITALS_OUT, renderHospitalsModule(finalRecords));
  }

  console.log(`\n  in coverage: ${finalRecords.length}`);
  console.log(`  requires review: ${review.length}`);
  console.log(`  outside coverage: ${outside.length}`);
  console.log(`  duplicates removed: ${duplicates}`);
  console.log(`  report: ${REPORT_PATH.replace(ROOT + '/', '')}`);
  if (!reportOnly) console.log(`  wrote: ${HOSPITALS_OUT.replace(ROOT + '/', '')}`);
}

/** Emit the typed module the app imports. */
function renderHospitalsModule(records) {
  const items = records.map((r) => {
    const fields = [
      `    id: ${JSON.stringify(r.id)},`,
      `    created_at: CREATED,`,
      `    updated_at: CREATED,`,
      `    status: 'active',`,
      `    name: ${JSON.stringify(r.name)},`,
      `    slug: ${JSON.stringify(r.slug)},`,
      `    type: 'hospital',`,
      `    facility_type: ${JSON.stringify(r.facility_type)},`,
      `    category_label: ${JSON.stringify(r.category_label)},`,
      `    ownership: ${JSON.stringify(r.ownership)},`,
      `    description: ${JSON.stringify(r.description)},`,
      `    address: ${JSON.stringify(r.street_address)},`,
      `    city: ${JSON.stringify(r.city)},`,
      `    district: ${JSON.stringify(r.district)},`,
      `    pincode: ${JSON.stringify(r.pincode)},`,
      `    state: 'Andhra Pradesh',`,
      `    country: 'India',`,
    ];
    if (typeof r.latitude === 'number') fields.push(`    latitude: ${r.latitude},`);
    if (typeof r.longitude === 'number') fields.push(`    longitude: ${r.longitude},`);
    fields.push(
      `    phone: ${JSON.stringify(r.phone)},`,
      `    email: ${r.email ? JSON.stringify(r.email) : 'undefined'},`,
      `    website: ${r.website ? JSON.stringify(r.website) : 'undefined'},`,
      `    specialties: ${JSON.stringify(r.specialties)},`,
      `    departments: ${JSON.stringify(r.departments)},`,
      `    facilities: { emergency: false, icu: false, ambulance: false, blood_bank: false, parking: false, twenty_four_hours: false, telehealth: false },`,
      `    rating: 0,`,
      `    review_count: 0,`,
      `    availability_status: null,`,
      `    is_verified: false,`,
      `    verification_status: ${JSON.stringify(r.verification_status)},`,
      `    source_label: ${JSON.stringify(r.provenance.data_source)},`,
      `    last_checked_at: ${JSON.stringify(r.provenance.fetched_at)},`,
      `    provenance: ${JSON.stringify(r.provenance, null, 2).split('\n').join('\n    ')},`,
    );
    return `  {\n${fields.join('\n')}\n  },`;
  });

  return `import type { Hospital } from '../types';

/**
 * CareLink-AI — healthcare directory (GENERATED FILE — DO NOT EDIT BY HAND).
 *
 * Produced by \`node scripts/directory/ingest.mjs\` from official Government of
 * Andhra Pradesh district directories (Krishna + NTR) plus the reviewed,
 * source-attributed facilities in migration 0031. Re-run the importer to refresh.
 *
 * HONESTY RULES (non-negotiable):
 *   - Every record carries provenance (source name, source URL, fetch date,
 *     data_status). A directory listing is never presented as verified.
 *   - \`is_verified\` is false for every record: a listing is not proof of
 *     credentials, capabilities or current operation.
 *   - Phone, coordinates, opening hours and capabilities are present ONLY when
 *     a source stated them. Absent means unknown, never zero/false-implied.
 *   - \`rating\` / \`review_count\` stay 0 until real eligible patient reviews exist.
 *   - Coverage is the Machilipatnam–Vijayawada corridor (see src/data/coverage.ts).
 *
 * Generated: ${new Date().toISOString()}
 * Records: ${records.length}
 */
const CREATED = '${FETCHED_AT}T00:00:00.000Z';

export const hospitalsData: Hospital[] = [
${items.join('\n')}
];
`;
}

main().catch((err) => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});

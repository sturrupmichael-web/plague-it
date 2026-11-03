// Sites: the places you infect. Most are US states and Canadian provinces/territories
// (outlines and metros come from data/geo.js); a few are special facilities.
// data/index.js combines everything here into DATA.sites, one entry per site:
//
// {
//   id, name, country ('US' | 'CA'), kind ('State' | 'Province' | 'Territory' | 'Facility' ...)
//   tags:      what the region is known for (keys of TAGS below). Evolutions can boost
//              spread in regions with a tag (see effects.tagSpread in data/evolutions.js).
//   traits: {  each 0..1, where 0 = wide open and 1 = locked down
//     patch:        how up to date the machines are
//     savvy:        how suspicious the users are of odd attachments and prompts
//     maturity:     the security team's tooling and process
//     connectivity: how well connected the region is. HIGHER makes it EASIER to reach.
//   },
//   devices:   endpoints: total metro population / BALANCE.map.peoplePerDevice
//              (at least BALANCE.map.minDevices)
//   metros:    [{ name, lon, lat, pop }] biggest first (from data/geo.js)
//   neighbors: ids of regions sharing a border (infection crosses borders on its own)
//   airGapped: true if isolated: reachable only over 'airgap' links (needs Air-Gap Hopping)
//   blurb:     flavour line for the site panel
// }
//
// How traits are worked out for a region:
//   1. start from TRAIT_BASE
//   2. add each of its tags' trait changes (TAGS[tag].traits)
//   3. apply anything in REGIONS[id].traits (exact values, for hand tuning)
//   4. connectivity comes from metro population unless REGIONS[id].traits sets it
// Everything is clamped to 0.05..0.95.

export const TRAIT_BASE = { patch: 0.45, savvy: 0.45, maturity: 0.45 };

export const TAGS = {
  finance: { label: 'Finance', traits: { savvy: 0.3, maturity: 0.2 } },
  corporate: { label: 'Corporate offices', traits: { savvy: 0.1 } },
  government: { label: 'Government', traits: { maturity: 0.25, patch: 0.1 } },
  tech: { label: 'Tech and data centers', traits: { patch: 0.2, maturity: 0.15 } },
  logistics: { label: 'Logistics and warehouses', traits: { patch: -0.2 } },
  manufacturing: { label: 'Manufacturing', traits: { patch: -0.25 } },
  retail: { label: 'Retail', traits: { savvy: -0.15 } },
  tourism: { label: 'Tourism and hospitality', traits: { savvy: -0.1 } },
  energy: { label: 'Energy', traits: { patch: -0.1, maturity: 0.05 } },
  rural: { label: 'Rural', traits: { patch: -0.2, maturity: -0.15, savvy: -0.1 } },
};

/** Per-region gameplay: tags (required), optional trait overrides and blurb. */
export const REGIONS = {
  'us-al': { tags: ['manufacturing', 'rural'] },
  'us-ak': { tags: ['energy', 'rural'], blurb: 'Satellite links, long winters, and a help desk that is mostly a fishing report.' },
  'us-az': { tags: ['retail', 'tourism'] },
  'us-ar': { tags: ['retail', 'logistics'] },
  'us-ca': { tags: ['tech', 'retail', 'tourism'], blurb: 'Everyone has a side project, and it is running on a work laptop.' },
  'us-co': { tags: ['tech', 'tourism'] },
  'us-ct': { tags: ['finance', 'corporate'], blurb: 'Insurance country. Every email has a disclaimer longer than the email.' },
  'us-de': { tags: ['finance', 'corporate'] },
  'us-dc': { tags: ['government', 'corporate'], blurb: 'Three forms, two badges and a security briefing before you touch a keyboard.' },
  'us-fl': { tags: ['tourism', 'retail'], blurb: 'Hotel kiosks and resort Wi-Fi as far as the eye can see.' },
  'us-ga': { tags: ['logistics', 'corporate'] },
  'us-hi': { tags: ['tourism'], blurb: 'Island time applies to patching too.' },
  'us-id': { tags: ['rural', 'tech'] },
  'us-il': { tags: ['finance', 'logistics', 'corporate'], blurb: 'Trading floors downtown, rail yards everywhere else.' },
  'us-in': { tags: ['manufacturing', 'logistics'] },
  'us-ia': { tags: ['rural', 'finance'] },
  'us-ks': { tags: ['rural', 'manufacturing'] },
  'us-ky': { tags: ['logistics', 'manufacturing'] },
  'us-la': { tags: ['energy', 'logistics'] },
  'us-me': { tags: ['rural', 'tourism'] },
  'us-md': { tags: ['government'] },
  'us-ma': { tags: ['tech', 'finance'], blurb: 'Universities, biotech and the oldest unpatched server in America, probably.' },
  'us-mi': { tags: ['manufacturing'], blurb: 'Assembly lines run on controllers older than most of the staff.' },
  'us-mn': { tags: ['corporate', 'retail'] },
  'us-ms': { tags: ['rural', 'manufacturing'] },
  'us-mo': { tags: ['logistics', 'corporate'] },
  'us-mt': { tags: ['rural'] },
  'us-ne': { tags: ['rural', 'finance'] },
  'us-nv': { tags: ['tourism', 'retail'], blurb: 'Casino floors full of screens, and every one of them is networked.' },
  'us-nh': { tags: ['rural'] },
  'us-nj': { tags: ['logistics', 'corporate'] },
  'us-nm': { tags: ['government', 'rural'] },
  'us-ny': { tags: ['finance', 'corporate'], blurb: 'Finance has seen too many phishing tests. They report the fire drill email.' },
  'us-nc': { tags: ['tech', 'finance'] },
  'us-nd': { tags: ['energy', 'rural'] },
  'us-oh': { tags: ['manufacturing', 'retail'] },
  'us-ok': { tags: ['energy'] },
  'us-or': { tags: ['tech'], blurb: 'Rows of data halls cooled by the river and a lot of optimism.' },
  'us-pa': { tags: ['corporate', 'manufacturing'] },
  'us-ri': { tags: ['corporate'] },
  'us-sc': { tags: ['manufacturing'] },
  'us-sd': { tags: ['rural', 'finance'] },
  'us-tn': { tags: ['logistics', 'tourism'], blurb: 'A giant parcel hub where every scanner shares one password.' },
  'us-tx': { tags: ['energy', 'tech', 'logistics'], blurb: 'Refineries, data centers and warehouses the size of small towns.' },
  'us-ut': { tags: ['tech'] },
  'us-vt': { tags: ['rural'] },
  'us-va': { tags: ['government', 'tech'], blurb: 'Half the internet\'s data centers, and the other half\'s auditors.' },
  'us-wa': { tags: ['tech', 'logistics'] },
  'us-wv': { tags: ['energy', 'rural'] },
  'us-wi': { tags: ['manufacturing', 'rural'] },
  'us-wy': { tags: ['energy', 'rural'] },
  'ca-ab': { tags: ['energy'], blurb: 'Oil sands telemetry and a lot of trucks that phone home.' },
  'ca-bc': { tags: ['tech', 'logistics', 'tourism'] },
  'ca-mb': { tags: ['logistics', 'rural'] },
  'ca-nb': { tags: ['rural'] },
  'ca-nl': { tags: ['energy', 'rural'] },
  'ca-ns': { tags: ['logistics'] },
  'ca-nt': { tags: ['energy', 'rural'] },
  'ca-nu': { tags: ['government', 'rural'], blurb: 'A handful of offices across two million square kilometres. Good luck getting there.' },
  'ca-on': { tags: ['finance', 'corporate', 'tech'], blurb: 'Bank towers and a tech corridor that never sleeps.' },
  'ca-pe': { tags: ['tourism', 'rural'] },
  'ca-qc': { tags: ['manufacturing', 'tech'] },
  'ca-sk': { tags: ['energy', 'rural'] },
  'ca-yt': { tags: ['rural', 'tourism'] },
};

/** Generic blurbs by first tag, for regions without their own. */
export const TAG_BLURBS = {
  finance: 'Bankers who forward every odd email to security. Mostly.',
  corporate: 'Open-plan offices, shared drives and meetings about meetings.',
  government: 'Locked down, audited, and very slow to change anything.',
  tech: 'Well patched, well monitored, and full of people who think they are too smart to click.',
  logistics: 'Warehouses and depots running scanners on ancient operating systems.',
  manufacturing: 'Plant floors where the machines are older than the IT policy.',
  retail: 'Point-of-sale terminals and a back-office PC with the password on a sticky note.',
  tourism: 'Guest Wi-Fi, hotel kiosks and staff who change every season.',
  energy: 'Field sites connected by long, lonely links.',
  rural: 'Small offices far apart. The nearest IT person is a three-hour drive away.',
};

/** Special facilities: sites that are a single point, not a region. */
export const FACILITIES = [
  {
    id: 'factory', name: 'Air-Gapped Factory Floor', region: 'us-mi', lon: -84.6, lat: 42.6, devices: 400,
    tags: ['manufacturing'], airGapped: true,
    traits: { patch: 0.05, savvy: 0.35, maturity: 0.5, connectivity: 0.15 },
    blurb: 'Line controllers with no network at all. Updates arrive on a USB stick, hand-carried, once a quarter.',
  },
];

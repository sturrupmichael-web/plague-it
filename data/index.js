// Everything in data/, in one object. The engine only ever reads content through this,
// so tests and the build see exactly what the game sees.
//
// DATA.sites is assembled here from data/geo.js (outlines and metros, generated) and
// data/sites.js (tags, traits, blurbs, facilities, hand-edited). See data/sites.js.

import { BALANCE } from './balance.js';
import { STRAINS } from './strains.js';
import { TRAIT_BASE, TAGS, REGIONS, TAG_BLURBS, FACILITIES } from './sites.js';
import { GEO_REGIONS, METROS, LAKES } from './geo.js';
import { LINKS } from './links.js';
import { EVOLUTIONS } from './evolutions.js';
import { RESPONSES } from './responses.js';
import { SCENARIOS } from './scenarios.js';
import { HEADLINES } from './headlines.js';
import { DIFFICULTIES } from './difficulties.js';
import { MAP } from './world.js';

const clamp = (x) => Math.round(Math.max(0.05, Math.min(0.95, x)) * 100) / 100;

function buildSites() {
  const { peoplePerDevice, minDevices } = BALANCE.map;
  const metrosBy = new Map(GEO_REGIONS.map((r) => [r.id, []]));
  for (const [name, region, lon, lat, pop] of METROS) metrosBy.get(region)?.push({ name, lon, lat, pop });
  const popOf = (id) => metrosBy.get(id).reduce((n, m) => n + m.pop, 0);
  const pops = GEO_REGIONS.map((r) => popOf(r.id)).filter((p) => p > 0);
  const [lo, hi] = [Math.log(Math.min(...pops)), Math.log(Math.max(...pops))];

  const regions = GEO_REGIONS.map((g) => {
    const cfg = REGIONS[g.id] ?? { tags: [] };
    const traits = { ...TRAIT_BASE };
    for (const tag of cfg.tags) for (const [k, v] of Object.entries(TAGS[tag]?.traits ?? {})) traits[k] += v;
    const pop = popOf(g.id);
    traits.connectivity = pop > 0 ? 0.3 + 0.65 * ((Math.log(pop) - lo) / (hi - lo)) : 0.15;
    Object.assign(traits, cfg.traits);
    for (const k of Object.keys(traits)) traits[k] = clamp(traits[k]);
    return {
      id: g.id,
      name: g.name,
      country: g.country,
      kind: g.kind,
      tags: cfg.tags,
      traits,
      devices: Math.max(minDevices, Math.round(pop / peoplePerDevice)),
      population: pop,
      lon: g.anchor[0],
      lat: g.anchor[1],
      rings: g.rings,
      neighbors: g.neighbors,
      metros: metrosBy.get(g.id),
      airGapped: false,
      blurb: cfg.blurb ?? TAG_BLURBS[cfg.tags[0]] ?? '',
    };
  });
  const facilities = FACILITIES.map((f) => ({
    ...f,
    country: regions.find((r) => r.id === f.region)?.country ?? 'US',
    kind: 'Facility',
    population: 0,
    rings: [],
    neighbors: [],
    metros: [{ name: f.name, lon: f.lon, lat: f.lat, pop: 0 }],
    airGapped: !!f.airGapped,
  }));
  return [...regions, ...facilities];
}

export const DATA = {
  balance: BALANCE,
  strains: STRAINS,
  sites: buildSites(),
  tags: TAGS,
  /** The hand-edited per-region settings (for validation). */
  regionConfig: REGIONS,
  links: LINKS,
  evolutions: EVOLUTIONS,
  responses: RESPONSES,
  scenarios: SCENARIOS,
  headlines: HEADLINES,
  difficulties: DIFFICULTIES,
  map: MAP,
  lakes: LAKES,
};

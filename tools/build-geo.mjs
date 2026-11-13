// Generates data/geo.js: state/province outlines, which ones border each other, and the
// top 500 metro areas, from Natural Earth (public domain, naturalearthdata.com).
// You only need this to change the map's source data; the game never runs it.
//
//   node tools/build-geo.mjs          downloads the sources into tools/.cache/ once, then builds
//
// What it does:
//   - keeps the 64 US states (plus DC) and Canadian provinces/territories
//   - finds neighbours from shared border points (before simplifying)
//   - simplifies outlines (Douglas–Peucker) and drops tiny islands to keep the page small
//   - takes populated places in the US and Canada by metro population (Natural Earth's
//     pop_max), skips any within MERGE_KM of a bigger one already taken (its suburbs),
//     and keeps the top METRO_COUNT
//   - picks each region's anchor (its biggest metro, or a point inside it)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = ROOT + 'tools/.cache/';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SOURCES = {
  admin1: 'ne_50m_admin_1_states_provinces.geojson',
  places: 'ne_10m_populated_places_simple.geojson',
  lakes: 'ne_50m_lakes.geojson',
};
const MIN_LAKE_AREA = 1.5; // square degrees: the Great Lakes and the biggest Canadian lakes
const METRO_COUNT = 500;
const MERGE_KM = 30;
const TOLERANCE = 0.07; // degrees, for simplifying outlines
const MIN_RING_AREA = 0.25; // square degrees; smaller islands are dropped (the biggest ring always stays)
const SMALL_REGIONS = new Set(['us-hi', 'us-ri', 'us-dc', 'us-de', 'ca-pe']); // keep their small parts

mkdirSync(CACHE, { recursive: true });
async function load(name) {
  const path = CACHE + name;
  if (!existsSync(path)) {
    console.log('downloading', name);
    const res = await fetch(NE + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

const admin1 = await load(SOURCES.admin1);
const places = await load(SOURCES.places);
const lakesSrc = await load(SOURCES.lakes);

const regions = admin1.features
  .filter((f) => ['US', 'CA'].includes(f.properties.iso_a2))
  .map((f) => {
    const p = f.properties;
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    return {
      id: `${p.iso_a2.toLowerCase()}-${p.postal.toLowerCase()}`,
      name: p.name,
      country: p.iso_a2,
      kind: p.type_en || (p.iso_a2 === 'US' ? 'State' : 'Province'),
      outer: polys.map((poly) => poly[0]), // outer rings only; lakes don't matter here
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

// Neighbours: regions sharing at least two border points.
const key = ([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`;
const owners = new Map();
for (const r of regions) {
  for (const ring of r.outer) {
    for (const pt of ring) {
      const k = key(pt);
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k).add(r.id);
    }
  }
}
const shared = new Map();
for (const set of owners.values()) {
  if (set.size < 2) continue;
  const ids = [...set];
  for (const a of ids) for (const b of ids) if (a < b) shared.set(`${a}|${b}`, (shared.get(`${a}|${b}`) ?? 0) + 1);
}
const neighbors = new Map(regions.map((r) => [r.id, []]));
for (const [pair, n] of shared) {
  if (n < 2) continue;
  const [a, b] = pair.split('|');
  neighbors.get(a).push(b);
  neighbors.get(b).push(a);
}

// Simplify. A ring is closed (first point = last), so split it at the point farthest from
// the start and simplify each half as an open line.
function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1);
  let far = 1;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp(pts.slice(0, far + 1), tol);
  const b = dp([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1, -1)];
}
function dp(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = points[s];
    const [x2, y2] = points[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1;
    let bestD = 0;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > tol && best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const area = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
};
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

for (const r of regions) {
  const small = SMALL_REGIONS.has(r.id);
  const rings = r.outer.map((ring) => ({ ring, a: area(ring) })).sort((a, b) => b.a - a.a);
  r.rings = rings
    .filter((x, i) => i === 0 || x.a >= (small ? 0.01 : MIN_RING_AREA))
    .map(({ ring }) => simplifyRing(ring, small ? TOLERANCE / 4 : TOLERANCE))
    .filter((ring) => ring.length >= 3);
  if (!r.rings.length) r.rings = [simplifyRing(rings[0].ring, TOLERANCE / 10)];
}

// Big lakes, drawn over the land (some state outlines extend into the Great Lakes).
const lakes = [];
for (const f of lakesSrc.features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) {
    const ring = poly[0];
    const [x, y] = ring[0];
    if (x < -170 || x > -50 || y < 24 || y > 84 || area(ring) < MIN_LAKE_AREA) continue;
    lakes.push(simplifyRing(ring, TOLERANCE));
  }
}

// Metros.
const regionByName = new Map(regions.map((r) => [`${r.country}|${r.name}`, r]));
const candidates = places.features
  .map((f) => f.properties)
  .filter((p) => ['US', 'CA'].includes(p.iso_a2) && p.pop_max > 0)
  .sort((a, b) => b.pop_max - a.pop_max);
const km = (a, b) => {
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const metros = [];
for (const p of candidates) {
  if (metros.length >= METRO_COUNT) break;
  if (metros.some((m) => km(m.p, p) < MERGE_KM)) continue;
  let region = regionByName.get(`${p.iso_a2}|${p.adm1name}`);
  if (!region) region = regions.find((r) => r.country === p.iso_a2 && r.outer.some((ring) => inRing(p.longitude, p.latitude, ring)));
  if (!region) {
    console.warn('no region for', p.name, p.adm1name);
    continue;
  }
  metros.push({ p, region: region.id });
}

// Anchors: the biggest metro, or a point inside the biggest ring.
for (const r of regions) {
  const m = metros.find((x) => x.region === r.id);
  if (m) {
    r.anchor = [m.p.longitude, m.p.latitude];
    continue;
  }
  const ring = r.rings[0];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  let bestD = -1;
  for (let i = 1; i < 20; i++) {
    for (let j = 1; j < 20; j++) {
      const x = x0 + ((x1 - x0) * i) / 20;
      const y = y0 + ((y1 - y0) * j) / 20;
      if (!inRing(x, y, ring)) continue;
      const d = Math.min(...ring.map((p) => Math.hypot(p[0] - x, p[1] - y)));
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  r.anchor = best ?? ring[0];
}

const r2 = (v) => Math.round(v * 100) / 100;
const lines = [
  '// GENERATED by tools/build-geo.mjs from Natural Earth (public domain). Do not edit by hand:',
  '// change the script and run `node tools/build-geo.mjs`. Gameplay numbers for each region',
  '// (traits, tags, blurbs) live in data/sites.js, not here.',
  '//',
  '// GEO_REGIONS: { id, name, country, kind, anchor: [lon, lat], neighbors: [ids],',
  '//                rings: [[lon, lat, lon, lat, ...], ...] }',
  `// METROS: the top ${METRO_COUNT} metro areas: [name, regionId, lon, lat, population]`,
  '',
  'export const GEO_REGIONS = [',
  ...regions.map((r) => `  ${JSON.stringify({
    id: r.id, name: r.name, country: r.country, kind: r.kind,
    anchor: r.anchor.map(r2), neighbors: neighbors.get(r.id).sort(),
    rings: r.rings.map((ring) => ring.flatMap(([x, y]) => [r2(x), r2(y)])),
  })},`),
  '];',
  '',
  '// LAKES: big lakes drawn as water: [[lon, lat, lon, lat, ...], ...]',
  'export const LAKES = [',
  ...lakes.map((ring) => `  ${JSON.stringify(ring.flatMap(([x, y]) => [r2(x), r2(y)]))},`),
  '];',
  '',
  'export const METROS = [',
  ...metros.map(({ p, region }) => `  ${JSON.stringify([p.name, region, r2(p.longitude), r2(p.latitude), p.pop_max])},`),
  '];',
  '',
];
writeFileSync(ROOT + 'data/geo.js', lines.join('\n'));
const points = regions.reduce((n, r) => n + r.rings.reduce((m, ring) => m + ring.length, 0), 0);
console.log(`data/geo.js: ${regions.length} regions, ${lakes.length} lakes, ${points} outline points, ${metros.length} metros, ${(lines.join('\n').length / 1024).toFixed(0)} KB`);

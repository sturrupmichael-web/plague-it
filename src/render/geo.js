// Map projection: longitude/latitude to map units, using an Albers equal-area conic
// (data/world.js sets its parameters), fitted to a map WORLD_W units wide. Sites listed
// in MAP.insets (Hawaii) are moved to a box of their own. Used by rendering only.

export const WORLD_W = 1000;

function albers({ lon0, lat0, lat1, lat2 }) {
  const rad = Math.PI / 180;
  const n = (Math.sin(lat1 * rad) + Math.sin(lat2 * rad)) / 2;
  const C = Math.cos(lat1 * rad) ** 2 + 2 * n * Math.sin(lat1 * rad);
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(lat0 * rad)) / n;
  return (lon, lat) => {
    const rho = Math.sqrt(Math.max(0, C - 2 * n * Math.sin(lat * rad))) / n;
    const theta = n * (lon - lon0) * rad;
    return [rho * Math.sin(theta), -(rho0 - rho * Math.cos(theta))];
  };
}

/**
 * @param map    DATA.map
 * @param sites  DATA.sites (their rings set the map's bounds)
 * @returns { width, height, project(lon, lat, siteId?) → [x, y] }
 */
export function createProjection(map, sites) {
  const raw = albers(map.projection);
  const insets = map.insets ?? {};
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const centre = {};
  for (const s of sites) {
    const pts = [];
    for (const ring of s.rings ?? []) for (let i = 0; i < ring.length; i += 2) pts.push(raw(ring[i], ring[i + 1]));
    if (!pts.length) pts.push(raw(s.lon, s.lat));
    if (insets[s.id]) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      centre[s.id] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      continue;
    }
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const pad = (map.padding ?? 0) * (x1 - x0);
  x0 -= pad;
  x1 += pad;
  y0 -= pad;
  y1 += pad;
  const scale = WORLD_W / (x1 - x0);
  const height = (y1 - y0) * scale;
  const project = (lon, lat, siteId) => {
    const [x, y] = raw(lon, lat);
    const inset = siteId && insets[siteId];
    if (inset) {
      const [cx, cy] = centre[siteId];
      return [inset.at[0] * WORLD_W + (x - cx) * scale, inset.at[1] * height + (y - cy) * scale];
    }
    return [(x - x0) * scale, (y - y0) * scale];
  };
  return { width: WORLD_W, height, project };
}

/** Even-odd point-in-polygon test for a flat ring [x, y, x, y, ...]. */
export function pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

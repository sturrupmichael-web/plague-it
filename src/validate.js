// Checks that everything in data/ is well-formed and that all references between files
// line up. Returns a list of human-readable problems (empty = all good). The data tests
// run this, so `npm test` tells you exactly what's wrong after you edit content.

const BRANCHES = ['vectors', 'payloads', 'abilities'];
const SITE_TYPES = ['hq', 'office', 'warehouse', 'retail', 'datacenter', 'cloud', 'factory'];
const STATS = ['spread', 'noise', 'impact'];
const STRAIN_MODIFIERS = ['withinSite', 'betweenSites', 'bubbleChance', 'bubbleValue', 'evolveCost', 'remediation'];

export function validateData(data) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const unit = (v) => isNum(v) && v >= 0 && v <= 1;

  const uniqueIds = (list, what) => {
    const seen = new Set();
    for (const x of list) {
      if (!isStr(x?.id)) err(`${what}: an entry has no id`);
      else if (seen.has(x.id)) err(`${what}: duplicate id "${x.id}"`);
      seen.add(x?.id);
    }
    return seen;
  };

  const { balance } = data;
  // Balance
  if (!isNum(balance.ticksPerSecond) || balance.ticksPerSecond <= 0) err('balance.ticksPerSecond must be > 0');
  if (!isNum(balance.statMax) || balance.statMax <= 0) err('balance.statMax must be > 0');
  for (const k of ['within', 'between']) if (!isNum(balance.spread?.[k]) || balance.spread[k] < 0) err(`balance.spread.${k} must be a number >= 0`);
  const linkKinds = new Set(Object.keys(balance.linkKinds ?? {}));
  for (const [k, v] of Object.entries(balance.linkKinds ?? {})) if (!isNum(v.weight) || v.weight < 0) err(`balance.linkKinds.${k}.weight must be >= 0`);
  const bv = balance.bubbles?.infectionValue;
  if (!Array.isArray(bv) || bv.length !== 2 || !(bv[0] <= bv[1])) err('balance.bubbles.infectionValue must be [min, max]');
  const bj = balance.bubbles?.jitter;
  if (!Array.isArray(bj) || bj.length !== 2 || !(bj[0] <= bj[1])) err('balance.bubbles.jitter must be [min, max]');

  // Evolutions (first, since others refer to them)
  const evoIds = uniqueIds(data.evolutions, 'evolutions');
  for (const e of data.evolutions) {
    const at = `evolution "${e.id}"`;
    if (!BRANCHES.includes(e.branch)) err(`${at}: branch must be one of ${BRANCHES.join(', ')}`);
    if (!isStr(e.name) || !isStr(e.description)) err(`${at}: needs a name and a description`);
    if (!isNum(e.cost) || e.cost < 0) err(`${at}: cost must be a number >= 0`);
    if (!Array.isArray(e.prereqs)) err(`${at}: prereqs must be an array`);
    for (const p of e.prereqs ?? []) {
      if (!evoIds.has(p)) err(`${at}: prerequisite "${p}" doesn't exist`);
      else if (data.evolutions.find((x) => x.id === p).branch !== e.branch) err(`${at}: prerequisite "${p}" is in another branch`);
    }
    for (const k of Object.keys(e.effects ?? {})) {
      if (!STATS.includes(k)) err(`${at}: unknown effect "${k}"`);
      else if (!isNum(e.effects[k])) err(`${at}: effect ${k} must be a number`);
    }
    if (!isNum(e.pos?.col) || !isNum(e.pos?.row)) err(`${at}: pos needs col and row`);
  }
  const cycle = findCycle(data.evolutions);
  if (cycle) err(`evolutions: prerequisite cycle ${cycle.join(' → ')}`);

  // Strains
  const strainIds = uniqueIds(data.strains, 'strains');
  for (const s of data.strains) {
    const at = `strain "${s.id}"`;
    if (!isStr(s.name)) err(`${at}: needs a name`);
    if (s.unlockedBy !== null && !strainIds.has(s.unlockedBy)) err(`${at}: unlockedBy "${s.unlockedBy}" doesn't exist`);
    for (const k of STATS) if (!isNum(s.base?.[k]) || s.base[k] < 0 || s.base[k] > balance.statMax) err(`${at}: base.${k} must be 0..statMax`);
    for (const [k, v] of Object.entries(s.modifiers ?? {})) {
      if (!STRAIN_MODIFIERS.includes(k)) err(`${at}: unknown modifier "${k}"`);
      else if (!isNum(v) || v < 0) err(`${at}: modifier ${k} must be a number >= 0`);
    }
  }
  if (!data.strains.some((s) => s.unlockedBy === null)) err('strains: at least one must start unlocked (unlockedBy: null)');

  // Difficulties
  uniqueIds(data.difficulties, 'difficulties');
  if (!data.difficulties.some((d) => d.id === 'normal')) err('difficulties: "normal" is required');
  for (const d of data.difficulties) for (const k of ['detection', 'remediation', 'aiInterval', 'scoreMult']) if (!isNum(d[k]) || d[k] <= 0) err(`difficulty "${d.id}": ${k} must be > 0`);

  // Sites
  const siteIds = uniqueIds(data.sites, 'sites');
  for (const s of data.sites) {
    const at = `site "${s.id}"`;
    if (!isStr(s.name)) err(`${at}: needs a name`);
    if (!SITE_TYPES.includes(s.type)) err(`${at}: type must be one of ${SITE_TYPES.join(', ')}`);
    if (!isNum(s.lon) || s.lon < -180 || s.lon > 180 || !isNum(s.lat) || s.lat < data.map.view.latBottom || s.lat > data.map.view.latTop) err(`${at}: lon/lat out of range`);
    if (!Number.isInteger(s.devices) || s.devices < 1) err(`${at}: devices must be a whole number >= 1`);
    for (const k of ['patch', 'savvy', 'maturity', 'connectivity']) if (!unit(s.traits?.[k])) err(`${at}: traits.${k} must be 0..1`);
    if (s.airGapped !== undefined && typeof s.airGapped !== 'boolean') err(`${at}: airGapped must be true/false`);
  }
  if (!data.sites.some((s) => !s.airGapped)) err('sites: at least one site must not be air-gapped');

  // Links
  const pairs = new Set();
  for (const [i, l] of data.links.entries()) {
    const at = `link #${i} (${l.from} – ${l.to})`;
    if (!siteIds.has(l.from) || !siteIds.has(l.to)) err(`${at}: unknown site`);
    if (l.from === l.to) err(`${at}: links a site to itself`);
    if (!linkKinds.has(l.kind)) err(`${at}: unknown kind "${l.kind}"`);
    if (l.requires !== null && !evoIds.has(l.requires)) err(`${at}: requires "${l.requires}", which doesn't exist`);
    const key = [l.from, l.to].sort().join('|');
    if (pairs.has(key)) err(`${at}: duplicate link`);
    pairs.add(key);
    const gapped = [l.from, l.to].some((id) => data.sites.find((s) => s.id === id)?.airGapped);
    if (gapped && l.kind !== 'airgap') err(`${at}: an air-gapped site can only have airgap links`);
    if (l.kind === 'airgap' && !gapped) err(`${at}: airgap links must touch an air-gapped site`);
  }
  // Every connected site must be reachable from every other over always-open links,
  // and every air-gapped site needs at least one airgap link.
  const open = data.sites.filter((s) => !s.airGapped).map((s) => s.id);
  if (open.length) {
    const seen = new Set([open[0]]);
    const queue = [open[0]];
    while (queue.length) {
      const id = queue.shift();
      for (const l of data.links) {
        if (l.requires !== null) continue;
        const other = l.from === id ? l.to : l.to === id ? l.from : null;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    for (const id of open) if (!seen.has(id)) err(`site "${id}" can't be reached over always-open links`);
  }
  for (const s of data.sites.filter((x) => x.airGapped)) {
    if (!data.links.some((l) => l.kind === 'airgap' && (l.from === s.id || l.to === s.id))) err(`site "${s.id}" is air-gapped but has no airgap link`);
  }

  // Phase 3–4 content: just ids for now.
  uniqueIds(data.responses, 'responses');
  uniqueIds(data.scenarios, 'scenarios');
  uniqueIds(data.headlines, 'headlines');

  // Map
  for (const [i, poly] of data.landmasses.entries()) {
    if (!Array.isArray(poly) || poly.length < 3 || !poly.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) err(`landmass #${i}: needs 3+ [lon, lat] points`);
  }
  return errors;
}

/** Returns one prerequisite cycle as a list of ids, or null. */
export function findCycle(evolutions) {
  const byId = new Map(evolutions.map((e) => [e.id, e]));
  const state = new Map(); // id → 1 visiting, 2 done
  const path = [];
  const visit = (id) => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...path.slice(path.indexOf(id)), id];
    state.set(id, 1);
    path.push(id);
    for (const p of byId.get(id)?.prereqs ?? []) {
      if (!byId.has(p)) continue;
      const c = visit(p);
      if (c) return c;
    }
    path.pop();
    state.set(id, 2);
    return null;
  };
  for (const e of evolutions) {
    const c = visit(e.id);
    if (c) return c;
  }
  return null;
}

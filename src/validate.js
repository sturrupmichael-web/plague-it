// Checks that everything in data/ is well-formed and that all references between files
// line up. Returns a list of human-readable problems (empty = all good). The data tests
// run this, so `npm test` tells you exactly what's wrong after you edit content.

const BRANCHES = ['vectors', 'payloads', 'abilities'];
const STATS = ['spread', 'noise', 'impact'];
const UNIT_EFFECTS = ['remediationResist', 'cleanResist', 'reinfect', 'jump'];
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
  for (const [k, v] of Object.entries(balance.caps ?? {})) if (!unit(v)) err(`balance.caps.${k} must be 0..1`);
  for (const k of ['rate', 'power', 'threshold']) if (!isNum(balance.detection?.[k]) || balance.detection[k] <= 0) err(`balance.detection.${k} must be > 0`);
  for (const k of ['rate', 'cleanRate', 'reinfectFactor']) if (!isNum(balance.remediation?.[k]) || balance.remediation[k] < 0) err(`balance.remediation.${k} must be >= 0`);
  if (!unit(balance.evolve?.refundRate)) err('balance.evolve.refundRate must be 0..1');
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
    for (const [k, v] of Object.entries(e.effects ?? {})) {
      if (k === 'tagSpread') {
        for (const [tag, x] of Object.entries(v ?? {})) {
          if (!data.tags?.[tag]) err(`${at}: tagSpread has unknown tag "${tag}"`);
          else if (!isNum(x)) err(`${at}: tagSpread.${tag} must be a number`);
        }
      } else if (STATS.includes(k)) {
        if (!isNum(v)) err(`${at}: effect ${k} must be a number`);
      } else if (UNIT_EFFECTS.includes(k)) {
        if (!unit(v)) err(`${at}: effect ${k} must be 0..1`);
      } else if (k === 'pointsPerDay') {
        if (!isNum(v) || v < 0) err(`${at}: pointsPerDay must be >= 0`);
      } else err(`${at}: unknown effect "${k}"`);
    }
    if (!isNum(e.pos?.col) || !isNum(e.pos?.row)) err(`${at}: pos needs col and row`);
    else if (data.evolutions.some((o) => o !== e && o.branch === e.branch && o.pos?.col === e.pos.col && o.pos?.row === e.pos.row)) {
      err(`${at}: another ${e.branch} evolution sits at the same pos`);
    }
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
  const byId = new Map(data.sites.map((x) => [x.id, x]));
  for (const s of data.sites) {
    const at = `site "${s.id}"`;
    if (!isStr(s.name)) err(`${at}: needs a name`);
    if (!Array.isArray(s.tags) || !s.tags.length) err(`${at}: needs at least one tag`);
    for (const t of s.tags ?? []) if (!data.tags[t]) err(`${at}: unknown tag "${t}"`);
    if (!isNum(s.lon) || s.lon < -180 || s.lon > 180 || !isNum(s.lat) || s.lat < -90 || s.lat > 90) err(`${at}: lon/lat out of range`);
    if (!Number.isInteger(s.devices) || s.devices < 1) err(`${at}: devices must be a whole number >= 1`);
    for (const k of ['patch', 'savvy', 'maturity', 'connectivity']) if (!unit(s.traits?.[k])) err(`${at}: traits.${k} must be 0..1`);
    if (typeof s.airGapped !== 'boolean') err(`${at}: airGapped must be true/false`);
    if (!s.airGapped && !s.rings?.length) err(`${at}: a region needs an outline`);
    for (const n of s.neighbors ?? []) {
      if (!siteIds.has(n)) err(`${at}: neighbour "${n}" doesn't exist`);
      else if (!byId.get(n).neighbors.includes(s.id)) err(`${at}: "${n}" doesn't list it back as a neighbour`);
    }
    if (!Array.isArray(s.metros)) err(`${at}: metros must be a list`);
  }
  for (const id of Object.keys(data.regionConfig ?? {})) if (!siteIds.has(id)) err(`data/sites.js REGIONS: "${id}" is not a region in data/geo.js`);
  if (!data.sites.some((s) => !s.airGapped)) err('sites: at least one site must not be air-gapped');

  // Links
  const pairs = new Set();
  for (const [i, l] of data.links.entries()) {
    const at = `link #${i} (${l.from} – ${l.to})`;
    if (!siteIds.has(l.from) || !siteIds.has(l.to)) err(`${at}: unknown site`);
    if (l.from === l.to) err(`${at}: links a site to itself`);
    if (!linkKinds.has(l.kind) || l.kind === 'border') err(`${at}: unknown kind "${l.kind}"`);
    if (l.requires !== null && !evoIds.has(l.requires)) err(`${at}: requires "${l.requires}", which doesn't exist`);
    const key = [l.from, l.to].sort().join('|') + '|' + l.kind;
    if (pairs.has(key)) err(`${at}: duplicate link`);
    pairs.add(key);
    const gapped = [l.from, l.to].some((id) => byId.get(id)?.airGapped);
    if (gapped && l.kind !== 'airgap') err(`${at}: an air-gapped site can only have airgap links`);
    if (l.kind === 'airgap' && !gapped) err(`${at}: airgap links must touch an air-gapped site`);
  }
  // Every connected site must be reachable from every other over borders and always-open
  // links, and every air-gapped site needs at least one airgap link.
  const open = data.sites.filter((s) => !s.airGapped).map((s) => s.id);
  if (open.length) {
    const adj = new Map(open.map((id) => [id, [...(byId.get(id).neighbors ?? [])]]));
    for (const l of data.links) {
      if (l.requires !== null) continue;
      adj.get(l.from)?.push(l.to);
      adj.get(l.to)?.push(l.from);
    }
    const seen = new Set([open[0]]);
    const queue = [open[0]];
    while (queue.length) {
      for (const other of adj.get(queue.shift()) ?? []) {
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    for (const id of open) if (!seen.has(id)) err(`site "${id}" can't be reached over borders and always-open links`);
  }
  for (const s of data.sites.filter((x) => x.airGapped)) {
    if (!data.links.some((l) => l.kind === 'airgap' && (l.from === s.id || l.to === s.id))) err(`site "${s.id}" is air-gapped but has no airgap link`);
  }

  // Defender
  const def = balance.defense;
  if (!def) err('balance.defense is missing');
  else {
    for (const k of ['fundingPerDay', 'impactFunding', 'shareFunding', 'startBudget', 'decisionEvery', 'alertPerDay', 'alertShare']) {
      if (!isNum(def[k]) || def[k] < 0) err(`balance.defense.${k} must be a number ≥ 0`);
    }
    if (!(def.decisionEvery >= 1)) err('balance.defense.decisionEvery must be ≥ 1');
    if (!unit(def.counterFactor)) err('balance.defense.counterFactor must be 0..1');
    if (!isNum(def.irFirm?.funding) || !isNum(def.irFirm?.remediation) || !isNum(def.irFirm?.clean)) err('balance.defense.irFirm needs funding, remediation and clean');
  }
  for (const d of data.difficulties) for (const k of ['funding', 'smarts']) if (!isNum(d[k]) || d[k] < 0) err(`difficulty "${d.id}": ${k} must be ≥ 0`);

  // Responses
  const responseIds = uniqueIds(data.responses, 'responses');
  const closable = new Set([...Object.keys(balance.linkKinds), '*']);
  const TRAIT_KEYS = ['patch', 'savvy', 'maturity'];
  for (const r of data.responses) {
    const where = `response "${r.id}"`;
    if (!isStr(r.name) || !isStr(r.description) || !isStr(r.headline)) err(`${where}: needs name, description and headline`);
    if (r.scope !== 'global' && r.scope !== 'site') err(`${where}: scope must be 'global' or 'site'`);
    if (!unit(r.minAlert)) err(`${where}: minAlert must be 0..1`);
    if (!isNum(r.cost) || r.cost < 0) err(`${where}: cost must be ≥ 0`);
    if (!isNum(r.weight) || r.weight <= 0) err(`${where}: weight must be > 0`);
    if (r.duration !== undefined && !(isNum(r.duration) && r.duration >= 1)) err(`${where}: duration must be ≥ 1 tick`);
    if (r.scope === 'site') {
      if (r.maxUses !== undefined && !(Number.isInteger(r.maxUses) && r.maxUses >= 1)) err(`${where}: maxUses must be a whole number ≥ 1`);
      const t = r.target ?? 'mostInfected';
      if (t !== 'mostInfected' && !(t.startsWith('link:') && balance.linkKinds[t.slice(5)])) err(`${where}: unknown target "${t}"`);
    } else if (r.target !== undefined || r.maxUses !== undefined || r.effects?.cleanNow !== undefined) {
      err(`${where}: target, maxUses and cleanNow are for site responses only`);
    }
    for (const key of Object.keys(r.triggers ?? {})) {
      if (!['spread', 'noise', 'impact'].includes(key) && !evoIds.has(key)) err(`${where}: trigger "${key}" is not a stat or an evolution`);
    }
    for (const id of r.counteredBy ?? []) if (!evoIds.has(id)) err(`${where}: counteredBy "${id}" doesn't exist`);
    const e = r.effects ?? {};
    for (const k of Object.keys(e)) if (!['closesLinks', 'blocks', 'traits', 'spread', 'remediation', 'cleanNow'].includes(k)) err(`${where}: unknown effect "${k}"`);
    for (const k of e.closesLinks ?? []) if (!closable.has(k)) err(`${where}: closesLinks "${k}" is not a link kind`);
    for (const id of e.blocks ?? []) if (!evoIds.has(id)) err(`${where}: blocks "${id}" doesn't exist`);
    for (const [k, v] of Object.entries(e.traits ?? {})) if (!TRAIT_KEYS.includes(k) || !isNum(v)) err(`${where}: traits.${k} must be patch/savvy/maturity with a number`);
    if (e.spread !== undefined && !unit(e.spread)) err(`${where}: effects.spread must be 0..1`);
    if (e.cleanNow !== undefined && !unit(e.cleanNow)) err(`${where}: effects.cleanNow must be 0..1`);
    if (e.remediation !== undefined && !(isNum(e.remediation) && e.remediation > 0)) err(`${where}: effects.remediation must be > 0`);
  }

  // Headlines
  uniqueIds(data.headlines, 'headlines');
  const EVENTS = ['siteReached', 'siteFallen', 'siteCleaned', 'detected', 'response', 'responseEnded', 'irFirm', 'evolved', 'updateJump'];
  const tags = new Set(Object.keys(data.tags ?? {}));
  for (const h of data.headlines) {
    const where = `headline "${h.id}"`;
    if (!isStr(h.text)) err(`${where}: needs text`);
    const w = h.when ?? {};
    for (const k of Object.keys(w)) {
      if (!['event', 'id', 'site', 'tag', 'detected', 'minShare', 'maxShare', 'minStat', 'minRemediation'].includes(k)) err(`${where}: unknown condition "${k}"`);
    }
    if (w.event !== undefined && !EVENTS.includes(w.event)) err(`${where}: unknown event "${w.event}"`);
    if (w.id !== undefined) {
      const pool = w.event === 'evolved' ? evoIds : responseIds;
      if (!['evolved', 'response', 'responseEnded'].includes(w.event) || !pool.has(w.id)) err(`${where}: id "${w.id}" doesn't match its event`);
    }
    if (w.site !== undefined && !siteIds.has(w.site)) err(`${where}: unknown site "${w.site}"`);
    if (w.tag !== undefined && !tags.has(w.tag)) err(`${where}: unknown tag "${w.tag}"`);
    for (const k of ['minShare', 'maxShare']) if (w[k] !== undefined && !unit(w[k])) err(`${where}: ${k} must be 0..1`);
    for (const k of Object.keys(w.minStat ?? {})) if (!['spread', 'noise', 'impact'].includes(k)) err(`${where}: minStat.${k} is not a stat`);
    if (/\{(?!site\}|strain\}|company\})[^}]*\}/.test(h.text ?? '')) err(`${where}: unknown placeholder in text`);
    if (h.text?.includes('{site}') && !w.event) err(`${where}: {site} needs an event`);
  }

  uniqueIds(data.scenarios, 'scenarios');

  // Map
  for (const id of Object.keys(data.map.insets ?? {})) if (!siteIds.has(id)) err(`map inset "${id}" is not a site`);
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

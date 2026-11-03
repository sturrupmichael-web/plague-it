// The defender AI (SecOps). Pure functions over the game state, like the rest of src/sim.
//
// Once you're detected, every tick:
//   - funding comes in (more when your Impact is high and when you hold more machines),
//   - the alert level rises (with time since detection and with your share of machines),
//   - responses whose duration is up are lifted,
//   - once total funding passes a threshold, the CIO hires an incident response firm,
//   - every few hours (difficulty.aiInterval) the AI picks a response from data/responses.js:
//     weighted by its base weight plus `triggers` matching your evolutions and stats
//     (× difficulty.smarts). If it can't afford the pick, it saves up for it.
//
// What the active responses add up to (closed links, blocked evolutions, hardened sites,
// faster remediation) is recomputed into state.dfx at the start of every tick and after
// evolving, so buying a counter takes effect at once. See defenseEffects().

import { rand } from './rng.js';

/** The defender part of a fresh game state. */
export function createDefense() {
  return {
    /** Funding available to spend. */
    budget: 0,
    /** All funding received this game (hires the IR firm at BALANCE.defense.irFirm.funding). */
    funded: 0,
    /** 0..1: which responses are on the table. */
    alert: 0,
    /** Tick of the next decision, or null before detection. */
    nextDecision: null,
    /** Response id the AI is saving up for, or null. */
    saving: null,
    /** In force now: { id, site (site id or null for global), at, until (tick or null) }. */
    active: [],
    /** How many times each response has been used. */
    uses: {},
    /** Tick the incident response firm was hired, or null. */
    irFirmAt: null,
    /** Tick the AI started (detection, or day one in the Zero Trust scenario), or null. */
    startedAt: null,
  };
}

/** Is this response blunted by an evolution you own? */
export function isCountered(state, response) {
  return (response.counteredBy ?? []).some((id) => state.evolved.includes(id));
}

/** 1 for full effect, BALANCE.defense.counterFactor when countered. */
function strength(state, world, response) {
  return isCountered(state, response) ? world.balance.defense.counterFactor : 1;
}

/**
 * What the active responses add up to right now. Plain JSON, stored as state.dfx:
 *   linkFactor[i]  × chance of infection crossing world.links[i] (0 = closed)
 *   blocked[evo]   share of that evolution's spread bonuses switched off (0..1)
 *   sites[i]       { patch, savvy, maturity } added to the site's traits, spread × inside it
 *   remediation    × Remediation bar speed;  clean  × cleaning speed
 */
export function defenseEffects(state, world) {
  const fx = {
    linkFactor: world.links.map(() => 1),
    blocked: {},
    sites: state.sites.map(() => ({ patch: 0, savvy: 0, maturity: 0, spread: 1 })),
    remediation: 1,
    clean: 1,
  };
  const def = state.defense;
  if (!def) return fx;
  for (const a of def.active) {
    const r = world.responses.get(a.id);
    if (!r) continue;
    const k = strength(state, world, r);
    const e = r.effects ?? {};
    const siteIdx = a.site === null ? null : world.siteIndex.get(a.site);
    const affected = siteIdx === null ? fx.sites : [fx.sites[siteIdx]];
    if (e.closesLinks?.length) {
      const all = e.closesLinks.includes('*');
      for (const l of world.links) {
        if (!all && !e.closesLinks.includes(l.kind)) continue;
        if (siteIdx !== null && l.a !== siteIdx && l.b !== siteIdx) continue;
        fx.linkFactor[l.index] *= 1 - k;
      }
    }
    for (const id of e.blocks ?? []) fx.blocked[id] = Math.max(fx.blocked[id] ?? 0, k);
    for (const [trait, v] of Object.entries(e.traits ?? {})) for (const s of affected) s[trait] += v * k;
    if (e.spread !== undefined) for (const s of affected) s.spread *= 1 - (1 - e.spread) * k;
    if (e.remediation !== undefined) fx.remediation *= 1 + (e.remediation - 1) * k;
  }
  if (def.irFirmAt !== null) {
    fx.remediation *= world.balance.defense.irFirm.remediation;
    fx.clean *= world.balance.defense.irFirm.clean;
  }
  return fx;
}

/** Called once, when the AI starts: the tick SecOps notices you (or day one, in some scenarios). */
export function startDefense(state, world) {
  if (state.defense.startedAt !== null) return;
  const d = world.balance.defense;
  state.defense.startedAt = state.tick;
  state.defense.budget = d.startBudget;
  state.defense.nextDecision = state.tick + decisionInterval(state, world);
}

function decisionInterval(state, world) {
  const diff = world.difficulties.get(state.difficultyId);
  return Math.max(1, Math.round(world.balance.defense.decisionEvery * diff.aiInterval));
}

/** One tick of the defender AI (once started). `share` = share of all machines infected. */
export function defenseTick(state, world, share) {
  const def = state.defense;
  const d = world.balance.defense;
  const diff = world.difficulties.get(state.difficultyId);
  const days = (state.tick - def.startedAt) / 24;
  // Triggering ransomware encryption puts everyone on maximum alert.
  def.alert = state.ransomAt !== null ? 1 : Math.min(1, days * d.alertPerDay + share * d.alertShare);
  const funding =
    (d.fundingPerDay / 24) * (1 + state.stats.impact * d.impactFunding + share * d.shareFunding) * (diff.funding ?? 1);
  def.budget += funding;
  def.funded += funding;

  if (def.irFirmAt === null && def.funded >= d.irFirm.funding) {
    def.irFirmAt = state.tick;
    state.log.push({ tick: state.tick, type: 'irFirm' });
    state.events.push({ type: 'irFirm' });
    state.dfx = defenseEffects(state, world);
  }

  // Lift responses whose time is up.
  const ended = def.active.filter((a) => a.until !== null && a.until <= state.tick);
  if (ended.length) {
    def.active = def.active.filter((a) => !ended.includes(a));
    for (const a of ended) state.events.push({ type: 'responseEnded', id: a.id, site: a.site });
    state.dfx = defenseEffects(state, world);
  }

  if (state.tick >= def.nextDecision) {
    def.nextDecision = state.tick + decisionInterval(state, world);
    decide(state, world);
  }
}

/** Responses the AI could choose right now, with their targets and weights. */
export function responseOptions(state, world) {
  const diff = world.difficulties.get(state.difficultyId);
  const smarts = diff.smarts ?? 1;
  const out = [];
  for (const r of world.data.responses) {
    if (state.defense.alert < r.minAlert) continue;
    const used = state.defense.uses[r.id] ?? 0;
    let site = null;
    if (r.scope === 'global') {
      if (used > 0) continue;
    } else {
      if (used >= (r.maxUses ?? 1)) continue;
      site = pickTarget(state, world, r);
      if (site === null) continue;
    }
    let extra = 0;
    for (const [key, v] of Object.entries(r.triggers ?? {})) {
      if (key === 'spread' || key === 'noise' || key === 'impact') extra += (v * state.stats[key]) / 10;
      else if (state.evolved.includes(key)) extra += v;
    }
    out.push({ id: r.id, site, weight: r.weight + extra * smarts });
  }
  return out;
}

/** The site a site-scoped response would hit (an id), or null if there's no sensible target. */
function pickTarget(state, world, r) {
  const linkKind = r.target?.startsWith('link:') ? r.target.slice(5) : null;
  let best = null;
  for (let i = 0; i < state.sites.length; i++) {
    const s = state.sites[i];
    if (!s.infected) continue;
    if (state.defense.active.some((a) => a.id === r.id && a.site === s.id)) continue;
    if (linkKind && !world.links.some((l) =>
      l.kind === linkKind && (l.a === i || l.b === i) &&
      (!l.requires || state.evolved.includes(l.requires)) && (state.dfx?.linkFactor[l.index] ?? 1) > 0)) continue;
    if (best === null || s.infected > state.sites[best].infected) best = i;
  }
  return best === null ? null : state.sites[best].id;
}

function decide(state, world) {
  const def = state.defense;
  const options = responseOptions(state, world);
  let pick = def.saving ? options.find((o) => o.id === def.saving) : null;
  if (!pick) {
    def.saving = null;
    const total = options.reduce((n, o) => n + o.weight, 0);
    if (total <= 0) return;
    let x = rand(state) * total;
    pick = options.find((o) => (x -= o.weight) < 0) ?? options[options.length - 1];
  }
  const r = world.responses.get(pick.id);
  if (def.budget < r.cost) {
    def.saving = r.id;
    return;
  }
  def.saving = null;
  def.budget -= r.cost;
  applyResponse(state, world, r, pick.site);
}

/** Puts a response into force (also used by tests and, later, the debug panel). */
export function applyResponse(state, world, r, siteId = null) {
  const def = state.defense;
  def.uses[r.id] = (def.uses[r.id] ?? 0) + 1;
  def.active.push({ id: r.id, site: siteId, at: state.tick, until: r.duration ? state.tick + r.duration : null });
  const cleanNow = r.effects?.cleanNow;
  if (cleanNow && siteId !== null) {
    const s = state.sites[world.siteIndex.get(siteId)];
    const n = Math.min(s.infected, Math.round(s.infected * cleanNow * strength(state, world, r)));
    // Restoring from backup undoes encryption too, in proportion.
    if (s.encrypted) s.encrypted -= Math.min(s.encrypted, Math.round((n * s.encrypted) / s.infected));
    s.infected -= n;
    s.remediated += n;
    if (!s.infected && n > 0) {
      state.log.push({ tick: state.tick, type: 'siteCleaned', site: s.id });
      state.events.push({ type: 'siteCleaned', site: s.id });
    }
  }
  state.log.push({ tick: state.tick, type: 'response', id: r.id, site: siteId });
  state.events.push({ type: 'response', id: r.id, site: siteId, countered: isCountered(state, r) });
  state.dfx = defenseEffects(state, world);
}

/** Active responses that switch off an evolution's spread bonuses. */
export function blockingResponses(state, world, evolutionId) {
  return state.defense.active
    .map((a) => world.responses.get(a.id))
    .filter((r) => r?.effects?.blocks?.includes(evolutionId));
}

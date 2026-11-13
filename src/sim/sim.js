// The simulation. step() advances the game by exactly one fixed tick (one in-game hour).
// It reads data only through `world` and never touches the DOM, the canvas or the clock,
// so it runs the same in the browser, in Node tests, and in headless balance runs.
//
// Player actions are plain functions on the state (startInfection, collectBubble,
// evolve, devolve), called between ticks.
//
// Order of a tick:
//   0. scripted events (The Merger) and strain mechanics (mutation, encryption)
//   1. recompute defenses, stats and effects   2. spread inside sites   3. jumps along links
//   4. poisoned-update jumps    5. income    6. detection and the defender AI
//   7. remediation and cleaning       8. bubbles expire        9. win / lose check

import { rand, randInt, stochasticRound } from './rng.js';
import { computeEffects, modifier } from './stats.js';
import { totals } from './state.js';
import { defenseEffects, defenseTick, startDefense } from './defense.js';

/** Recomputes what the defenses and owned evolutions add up to (state.dfx, stats, fx). */
export function refresh(state, world) {
  state.dfx = defenseEffects(state, world);
  Object.assign(state, computeEffects(state, world));
}

/** Site i's susceptibility right now, including defender hardening. */
function susceptibilityAt(state, world, i) {
  const add = state.dfx.sites[i];
  if (!add.patch && !add.savvy && !add.maturity) return world.susceptibility[i];
  return world.susceptibilityOf(world.data.sites[i].traits, add);
}

/** Puts patient zero at `siteId` and starts the game. Returns false if not allowed. */
export function startInfection(state, world, siteId) {
  if (state.status !== 'picking') return false;
  const i = world.siteIndex.get(siteId);
  if (i === undefined || world.data.sites[i].airGapped || state.sites[i].pending) return false;
  state.patientZero = siteId;
  state.status = 'running';
  if (world.defenseFromStart) startDefense(state, world);
  infect(state, world, i, 1);
  state.log.push({ tick: state.tick, type: 'patientZero', site: siteId });
  state.totals = totals(state);
  recordHistory(state);
  return true;
}

/** Advances the game one tick. Does nothing unless the game is running. */
export function step(state, world) {
  if (state.status !== 'running') return;
  const { balance } = world;
  state.tick++;
  const strain = world.strains.get(state.strainId);
  if (!state.merged && state.tick >= world.merger.tick) mergeNetworks(state, world);
  if (state.nextMutation !== null && state.tick >= state.nextMutation) mutate(state, world, strain.special.mutation);
  refresh(state, world);
  const { stats, fx, dfx } = state;
  if (state.ransomAt !== null) encryptTick(state, world, strain.special.ransom);
  const sus = state.sites.map((_, i) => susceptibilityAt(state, world, i));
  const reinfect = Math.min(1, balance.remediation.reinfectFactor * (1 + fx.reinfect * 3));

  // Infected counts at the start of the tick, so site order doesn't matter for jumps.
  const before = state.sites.map((s) => s.infected);

  // 2. Spread inside each site (logistic growth). Remediated machines can be retaken, but
  //    they only count `reinfect` as much as a healthy one.
  const spreadPow = stats.spread ** balance.spread.power;
  const within = balance.spread.within * spreadPow * modifier(world, state, 'withinSite');
  for (let i = 0; i < state.sites.length; i++) {
    const s = state.sites[i];
    const open = s.healthy + s.remediated * reinfect;
    if (!before[i] || open <= 0) continue;
    let typeBoost = 1;
    for (const tag of world.data.sites[i].tags ?? []) typeBoost += fx.tagSpread[tag] ?? 0;
    const expected = within * typeBoost * dfx.sites[i].spread * sus[i] * before[i] * (open / s.devices);
    const n = stochasticRound(state, expected);
    if (n > 0) infect(state, world, i, n, reinfect);
  }

  // 3. Jumps along open links, in both directions.
  const between = balance.spread.between * spreadPow * modifier(world, state, 'betweenSites');
  const linkWeights = strain.special?.linkWeights ?? {};
  for (const link of world.links) {
    if (!linkOpen(state, world, link)) continue;
    const factor = dfx.linkFactor[link.index];
    for (const [from, to] of [[link.a, link.b], [link.b, link.a]]) {
      if (before[from] < balance.spread.minInfectedToJump) continue;
      const target = state.sites[to];
      if (!target.healthy && !target.remediated) continue;
      if (world.data.sites[to].airGapped && link.kind !== 'airgap') continue;
      const chance =
        between * link.weight * (linkWeights[link.kind] ?? 1) * factor * (before[from] / state.sites[from].devices) *
        world.data.sites[to].traits.connectivity * sus[to];
      if (rand(state) < chance) {
        infect(state, world, to, 1, 1);
        state.linkActivity[link.index] = state.tick;
      }
    }
  }

  const t = totals(state);
  const share = t.infected / t.devices;

  // 4. Poisoned update: random jumps to any connected site with machines left to take.
  if (fx.jump > 0 && rand(state) < fx.jump * share) {
    const targets = state.sites
      .map((s, i) => i)
      .filter((i) => !world.data.sites[i].airGapped && state.sites[i].healthy > 0);
    if (targets.length) {
      const i = targets[randInt(state, 0, targets.length - 1)];
      infect(state, world, i, 1, 1);
      state.events.push({ type: 'updateJump', site: state.sites[i].id });
    }
  }

  // 5. Income from payloads like crypto-mining.
  if (fx.pointsPerDay > 0) {
    state.income += (fx.pointsPerDay * share) / 24;
    if (state.income >= 1) {
      const whole = Math.floor(state.income);
      state.income -= whole;
      state.points += whole;
      state.pointsEarned += whole;
    }
  }

  // 6. Detection.
  const diff = world.difficulties.get(state.difficultyId);
  if (state.detectedAt === null) {
    const d = balance.detection;
    const loudness = Math.max(0, stats.noise + stats.impact * d.impactWeight);
    state.suspicion += d.rate * loudness ** d.power * Math.sqrt(share) * diff.detection * modifier(world, state, 'detection');
    if (state.suspicion >= d.threshold) detect(state, world);
  }
  if (state.defense.startedAt !== null) defenseTick(state, world, share);

  // 7. Remediation: the bar fills, and machines get cleaned.
  if (state.detectedAt !== null) {
    const r = balance.remediation;
    const resist = 1 - fx.remediationResist;
    state.remediation = Math.min(
      100,
      state.remediation +
        r.rate * (1 + stats.impact * r.impactBoost) * diff.remediation * modifier(world, state, 'remediation') * resist *
        state.dfx.remediation * (state.ransomAt !== null ? strain.special.ransom.remediation : 1),
    );
    const progress = state.remediation / 100;
    for (let i = 0; i < state.sites.length; i++) {
      const s = state.sites[i];
      // Encrypted machines can't be cleaned (only reimaged from backup).
      const cleanable = s.infected - s.encrypted;
      if (cleanable <= 0) continue;
      const working = (s.healthy + s.remediated) / s.devices;
      if (working <= 0) continue;
      const expected =
        r.cleanRate * (r.cleanFloor + progress) * (0.5 + world.data.sites[i].traits.maturity + dfx.sites[i].maturity) *
        cleanable * working * diff.remediation * (1 - fx.cleanResist) * dfx.clean * modifier(world, state, 'remediation');
      const n = Math.min(cleanable, stochasticRound(state, expected));
      if (n > 0) {
        s.infected -= n;
        s.remediated += n;
        if (!s.infected) {
          state.log.push({ tick: state.tick, type: 'siteCleaned', site: s.id });
          state.events.push({ type: 'siteCleaned', site: s.id });
        }
      }
    }
  }

  // 8. Bubbles expire.
  const ttl = balance.bubbles.ttl;
  state.bubbles = state.bubbles.filter((b) => state.tick - b.born < ttl);

  // 9. Win / lose.
  state.totals = totals(state);
  state.peakInfected = Math.max(state.peakInfected, state.totals.infected);
  const t2 = state.totals;
  // Ransomware wins by encrypting everything; the rest by compromising everything.
  // (In The Merger, the acquired network has to join first.)
  const target = strain.special?.ransom ? t2.encrypted : t2.infected;
  if (state.merged && target === t2.devices) end(state, 'won', strain.special?.ransom ? 'encrypted' : 'compromised');
  else if (t2.infected === 0) end(state, 'lost', 'eradicated');
  else if (state.remediation >= 100) end(state, 'lost', 'remediated');
  else if (world.patchDeadline !== null && state.tick >= world.patchDeadline) end(state, 'lost', 'patched');

  if (state.tick % balance.historyEvery === 0 || state.status !== 'running') recordHistory(state);
}

/** Debug panel: SecOps notices you right now (does nothing if they already have). */
export function detectNow(state, world) {
  if (state.status === 'running' && state.detectedAt === null) detect(state, world);
}

/** Debug panel: ends the game now with this result. */
export function endNow(state, world, status) {
  if (state.status !== 'running') return;
  const ransom = !!world.strains.get(state.strainId).special?.ransom;
  end(state, status, status === 'won' ? (ransom ? 'encrypted' : 'compromised') : 'remediated');
  recordHistory(state);
}

/** SecOps notices you: the Remediation bar starts and the defender AI wakes up. */
function detect(state, world) {
  state.suspicion = world.balance.detection.threshold;
  state.detectedAt = state.tick;
  state.log.push({ tick: state.tick, type: 'detected' });
  state.events.push({ type: 'detected' });
  const busiest = state.sites.reduce((a, b) => (b.infected > a.infected ? b : a));
  spawnBubble(state, world, state.sites.indexOf(busiest), world.balance.bubbles.detected, 'event');
  startDefense(state, world);
}

/** The Merger: the acquired regions join the network, all machines healthy. */
function mergeNetworks(state, world) {
  for (const i of world.merger.sites) {
    const s = state.sites[i];
    s.devices = world.data.sites[i].devices;
    s.healthy = s.devices;
    s.pending = false;
  }
  state.merged = true;
  state.log.push({ tick: state.tick, type: 'merger' });
  state.events.push({ type: 'merger' });
}

/**
 * Polymorphic: gain a random evolution you could buy (prerequisites owned), for free, or
 * lose a random owned one that nothing else needs, with no refund.
 */
function mutate(state, world, cfg) {
  state.nextMutation = state.tick + cfg.everyDays * 24;
  const canGain = world.data.evolutions.filter((e) => !state.evolved.includes(e.id) && e.prereqs.every((p) => state.evolved.includes(p)));
  const canLose = state.evolved.filter((id) => !dependents(state, world, id).length);
  const gain = rand(state) < cfg.gainChance;
  const pool = gain ? canGain.map((e) => e.id) : canLose;
  if (!pool.length) return;
  const id = pool[randInt(state, 0, pool.length - 1)];
  if (gain) {
    state.evolved.push(id);
    state.paid[id] = 0;
  } else {
    state.evolved = state.evolved.filter((x) => x !== id);
    delete state.paid[id];
  }
  state.log.push({ tick: state.tick, type: 'mutated', id, gained: gain });
  state.events.push({ type: 'mutated', id, gained: gain });
}

/** Ransomware: press Encrypt. Everyone notices. Returns false if not allowed. */
export function triggerEncryption(state, world) {
  const ransom = world.strains.get(state.strainId).special?.ransom;
  if (!ransom || state.status !== 'running' || state.ransomAt !== null) return false;
  state.ransomAt = state.tick;
  if (state.detectedAt === null) detect(state, world);
  state.defense.budget += ransom.budget;
  state.defense.funded += ransom.budget;
  state.log.push({ tick: state.tick, type: 'encryption' });
  state.events.push({ type: 'encryption' });
  return true;
}

/** Each tick after Encrypt: part of every site's unencrypted infected machines lock up. */
function encryptTick(state, world, ransom) {
  for (const s of state.sites) {
    const open = s.infected - s.encrypted;
    if (open <= 0) continue;
    const n = Math.min(open, Math.max(1, stochasticRound(state, open * ransom.encryptRate)));
    s.encrypted += n;
  }
}

function end(state, status, outcome) {
  state.status = status;
  state.outcome = outcome;
  state.endedAt = state.tick;
  state.bubbles = [];
  state.log.push({ tick: state.tick, type: status, outcome });
  state.events.push({ type: 'gameOver', status, outcome });
}

/** Is this link carrying infection right now? (Its required evolution is owned and SecOps hasn't fully closed it.) */
export function linkOpen(state, world, link) {
  return (!link.requires || state.evolved.includes(link.requires)) && (state.dfx?.linkFactor[link.index] ?? 1) > 0;
}

// ── Evolution ────────────────────────────────────────────────────────────────

/** The current price of an evolution (it rises with each one owned in the same branch). */
export function evolveCost(state, world, id) {
  const e = world.evolutions.get(id);
  const owned = state.evolved.filter((x) => world.evolutions.get(x)?.branch === e.branch).length;
  const special = world.strains.get(state.strainId).special?.evolutionCost?.[id] ?? 1;
  return Math.round(e.cost * (1 + world.balance.evolve.costGrowth * owned) * modifier(world, state, 'evolveCost') * special);
}

/**
 * Why an evolution can't be bought right now, or null if it can.
 * 'owned' | 'locked' (prerequisites missing) | 'points' (can't afford) | 'over' (game ended)
 */
export function evolveBlocker(state, world, id) {
  const e = world.evolutions.get(id);
  if (!e) return 'unknown';
  if (state.status === 'won' || state.status === 'lost') return 'over';
  if (state.evolved.includes(id)) return 'owned';
  if (!e.prereqs.every((p) => state.evolved.includes(p))) return 'locked';
  if (state.points < evolveCost(state, world, id)) return 'points';
  return null;
}

/** Buys an evolution. Returns true on success. */
export function evolve(state, world, id) {
  if (evolveBlocker(state, world, id)) return false;
  const price = evolveCost(state, world, id);
  state.points -= price;
  state.paid[id] = price;
  state.evolved.push(id);
  refresh(state, world);
  state.log.push({ tick: state.tick, type: 'evolved', id });
  state.events.push({ type: 'evolved', id });
  return true;
}

/** Owned evolutions that need `id` (it can't be devolved while any are owned). */
export function dependents(state, world, id) {
  return state.evolved.filter((x) => world.evolutions.get(x)?.prereqs.includes(id));
}

/** Points you'd get back for devolving `id`. */
export function devolveRefund(state, world, id) {
  return Math.floor((state.paid[id] ?? 0) * world.balance.evolve.refundRate);
}

/** Removes an owned evolution for a partial refund. Returns true on success. */
export function devolve(state, world, id) {
  if (state.status === 'won' || state.status === 'lost') return false;
  if (!state.evolved.includes(id) || dependents(state, world, id).length) return false;
  const refund = devolveRefund(state, world, id);
  state.points += refund;
  state.evolved = state.evolved.filter((x) => x !== id);
  delete state.paid[id];
  refresh(state, world);
  state.log.push({ tick: state.tick, type: 'devolved', id });
  state.events.push({ type: 'devolved', id, refund });
  return true;
}

// ── Bubbles and events ──────────────────────────────────────────────────────

/** Collects a bubble. Returns the points gained (0 if it's already gone). */
export function collectBubble(state, bubbleId) {
  const i = state.bubbles.findIndex((b) => b.id === bubbleId);
  if (i < 0) return 0;
  const [b] = state.bubbles.splice(i, 1);
  state.points += b.value;
  state.pointsEarned += b.value;
  state.events.push({ type: 'bubbleCollected', id: b.id, value: b.value, site: b.site });
  return b.value;
}

/** Returns and clears the events since the last call. */
export function drainEvents(state) {
  const e = state.events;
  state.events = [];
  return e;
}

/** Runs `ticks` ticks (for tests, balance runs and the debug panel). */
export function advance(state, world, ticks) {
  for (let i = 0; i < ticks && state.status === 'running'; i++) step(state, world);
}

/**
 * Infects up to n machines at site i, taking from healthy machines first in proportion
 * to how open each pool is (remediated machines count `reinfect` as much).
 */
function infect(state, world, i, n, reinfect = 0) {
  const s = state.sites[i];
  const openRem = s.remediated * reinfect;
  const open = s.healthy + openRem;
  if (n <= 0 || open <= 0) return;
  const share = openRem > 0 ? Math.min(s.remediated, stochasticRound(state, (n * openRem) / open)) : 0;
  const fromHealthy = Math.min(s.healthy, n - share);
  // If healthy machines ran out, the rest come from cleaned ones (when they can be retaken).
  const fromRem = reinfect > 0 ? Math.min(s.remediated, n - fromHealthy) : 0;
  const total = fromHealthy + fromRem;
  if (total <= 0) return;
  s.healthy -= fromHealthy;
  s.remediated -= fromRem;
  s.infected += total;
  const { bubbles } = world.balance;
  if (s.reachedAt === null) {
    s.reachedAt = state.tick;
    s.entry = pickMetro(state, world, i);
    state.log.push({ tick: state.tick, type: 'siteReached', site: s.id });
    state.events.push({ type: 'siteReached', site: s.id });
    spawnBubble(state, world, i, bubbles.siteReached, 'site', s.entry);
    return;
  }
  if (s.infected === s.devices) {
    state.log.push({ tick: state.tick, type: 'siteFallen', site: s.id });
    state.events.push({ type: 'siteFallen', site: s.id });
  }
  const chance = Math.min(1, (total / s.devices) * bubbles.perShare * modifier(world, state, 'bubbleChance'));
  if (rand(state) < chance) {
    spawnBubble(state, world, i, randInt(state, bubbles.infectionValue[0], bubbles.infectionValue[1]), 'infection');
  }
}

/** A metro index at site i, weighted by population. */
function pickMetro(state, world, i) {
  const w = world.metroWeights[i];
  if (!w.length) return null;
  const x = rand(state) * w[w.length - 1];
  const k = w.findIndex((c) => x < c);
  return k < 0 ? w.length - 1 : k;
}

function spawnBubble(state, world, siteIdx, value, kind, metro = undefined) {
  const cfg = world.balance.bubbles;
  // Only routine infection bubbles are capped; site and event bubbles always appear.
  if (kind === 'infection' && state.bubbles.length >= cfg.maxOnMap) return;
  const angle = rand(state) * Math.PI * 2;
  const r = cfg.jitter[0] + (cfg.jitter[1] - cfg.jitter[0]) * rand(state);
  const b = {
    id: state.nextBubbleId++,
    site: state.sites[siteIdx].id,
    /** Index into the site's metros (null for a site without metros). */
    metro: metro === undefined ? pickMetro(state, world, siteIdx) : metro,
    dx: Math.round(Math.cos(angle) * r * 10) / 10,
    dy: Math.round(Math.sin(angle) * r * 10) / 10,
    value: Math.max(1, Math.round(value * modifier(world, state, 'bubbleValue'))),
    kind,
    born: state.tick,
  };
  state.bubbles.push(b);
  state.events.push({ type: 'bubbleSpawned', id: b.id, site: b.site, kind });
}

function recordHistory(state) {
  const t = totals(state);
  state.history.push([state.tick, t.healthy, t.infected, t.remediated, t.encrypted, Math.round(state.remediation * 10) / 10]);
}

// The simulation. step() advances the game by exactly one fixed tick (one in-game hour).
// It reads data only through `world` and never touches the DOM, the canvas or the clock,
// so it runs the same in the browser, in Node tests, and in headless balance runs.
//
// Player actions are plain functions on the state (startInfection, collectBubble,
// evolve, devolve), called between ticks.
//
// Order of a tick:
//   1. recompute stats and effects   2. spread inside sites   3. jumps along links
//   4. poisoned-update jumps          5. income                6. detection
//   7. remediation and cleaning       8. bubbles expire        9. win / lose check

import { rand, randInt, stochasticRound } from './rng.js';
import { computeEffects, modifier } from './stats.js';
import { totals } from './state.js';

/** Puts patient zero at `siteId` and starts the game. Returns false if not allowed. */
export function startInfection(state, world, siteId) {
  if (state.status !== 'picking') return false;
  const i = world.siteIndex.get(siteId);
  if (i === undefined || world.data.sites[i].airGapped) return false;
  state.patientZero = siteId;
  state.status = 'running';
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
  Object.assign(state, computeEffects(state, world));
  const { stats, fx } = state;
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
    const typeBoost = 1 + (fx.siteTypeSpread[world.data.sites[i].type] ?? 0);
    const expected = within * typeBoost * world.susceptibility[i] * before[i] * (open / s.devices);
    const n = stochasticRound(state, expected);
    if (n > 0) infect(state, world, i, n, reinfect);
  }

  // 3. Jumps along open links, in both directions.
  const between = balance.spread.between * spreadPow * modifier(world, state, 'betweenSites');
  for (const link of world.links) {
    if (!linkOpen(state, world, link)) continue;
    for (const [from, to] of [[link.a, link.b], [link.b, link.a]]) {
      if (before[from] < balance.spread.minInfectedToJump) continue;
      const target = state.sites[to];
      if (!target.healthy && !target.remediated) continue;
      if (world.data.sites[to].airGapped && link.kind !== 'airgap') continue;
      const chance =
        between * link.weight * (before[from] / state.sites[from].devices) *
        world.data.sites[to].traits.connectivity * world.susceptibility[to];
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
    state.suspicion += d.rate * loudness ** d.power * Math.sqrt(share) * diff.detection;
    if (state.suspicion >= d.threshold) {
      state.suspicion = d.threshold;
      state.detectedAt = state.tick;
      state.log.push({ tick: state.tick, type: 'detected' });
      state.events.push({ type: 'detected' });
      const busiest = state.sites.reduce((a, b) => (b.infected > a.infected ? b : a));
      spawnBubble(state, world, state.sites.indexOf(busiest), balance.bubbles.detected, 'event');
    }
  }

  // 7. Remediation: the bar fills, and machines get cleaned.
  if (state.detectedAt !== null) {
    const r = balance.remediation;
    const resist = 1 - fx.remediationResist;
    state.remediation = Math.min(
      100,
      state.remediation + r.rate * (1 + stats.impact * r.impactBoost) * diff.remediation * modifier(world, state, 'remediation') * resist,
    );
    const progress = state.remediation / 100;
    for (let i = 0; i < state.sites.length; i++) {
      const s = state.sites[i];
      if (!s.infected) continue;
      const working = (s.healthy + s.remediated) / s.devices;
      if (working <= 0) continue;
      const expected =
        r.cleanRate * (r.cleanFloor + progress) * (0.5 + world.data.sites[i].traits.maturity) *
        s.infected * working * diff.remediation * (1 - fx.cleanResist);
      const n = Math.min(s.infected, stochasticRound(state, expected));
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
  if (state.totals.infected === state.totals.devices) end(state, 'won', 'compromised');
  else if (state.totals.infected === 0) end(state, 'lost', 'eradicated');
  else if (state.remediation >= 100) end(state, 'lost', 'remediated');

  if (state.tick % balance.historyEvery === 0 || state.status !== 'running') recordHistory(state);
}

function end(state, status, outcome) {
  state.status = status;
  state.outcome = outcome;
  state.endedAt = state.tick;
  state.bubbles = [];
  state.log.push({ tick: state.tick, type: status, outcome });
  state.events.push({ type: 'gameOver', status, outcome });
}

/** Is this link carrying infection right now? (Its required evolution is owned.) */
export function linkOpen(state, world, link) {
  return !link.requires || state.evolved.includes(link.requires);
}

// ── Evolution ────────────────────────────────────────────────────────────────

/** The current price of an evolution (it rises with each one owned in the same branch). */
export function evolveCost(state, world, id) {
  const e = world.evolutions.get(id);
  const owned = state.evolved.filter((x) => world.evolutions.get(x)?.branch === e.branch).length;
  return Math.round(e.cost * (1 + world.balance.evolve.costGrowth * owned) * modifier(world, state, 'evolveCost'));
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
  Object.assign(state, computeEffects(state, world));
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
  Object.assign(state, computeEffects(state, world));
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
    state.log.push({ tick: state.tick, type: 'siteReached', site: s.id });
    state.events.push({ type: 'siteReached', site: s.id });
    spawnBubble(state, world, i, bubbles.siteReached, 'site');
    return;
  }
  if (s.infected === s.devices) {
    state.log.push({ tick: state.tick, type: 'siteFallen', site: s.id });
    state.events.push({ type: 'siteFallen', site: s.id });
  }
  const chance = Math.min(1, total * bubbles.perInfectionChance * modifier(world, state, 'bubbleChance'));
  if (rand(state) < chance) {
    spawnBubble(state, world, i, randInt(state, bubbles.infectionValue[0], bubbles.infectionValue[1]), 'infection');
  }
}

function spawnBubble(state, world, siteIdx, value, kind) {
  const cfg = world.balance.bubbles;
  // Only routine infection bubbles are capped; site and event bubbles always appear.
  if (kind === 'infection' && state.bubbles.length >= cfg.maxOnMap) return;
  const angle = rand(state) * Math.PI * 2;
  const r = cfg.jitter[0] + (cfg.jitter[1] - cfg.jitter[0]) * rand(state);
  const b = {
    id: state.nextBubbleId++,
    site: state.sites[siteIdx].id,
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
  state.history.push([state.tick, t.healthy, t.infected, t.remediated]);
}

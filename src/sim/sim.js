// The simulation. step() advances the game by exactly one fixed tick (one in-game hour).
// It reads data only through `world` and never touches the DOM, the canvas or the clock,
// so it runs the same in the browser, in Node tests, and in headless balance runs.
//
// Player actions are plain functions on the state (startInfection, collectBubble, ...),
// called between ticks.

import { rand, randInt, stochasticRound } from './rng.js';
import { computeStats, modifier } from './stats.js';
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
  recordHistory(state);
  return true;
}

/** Advances the game one tick. Does nothing unless the game is running. */
export function step(state, world) {
  if (state.status !== 'running') return;
  const { balance } = world;
  state.tick++;
  state.stats = computeStats(state, world);
  const spread = state.stats.spread;

  // Infected counts at the start of the tick, so site order doesn't matter for jumps.
  const before = state.sites.map((s) => s.infected);

  // 1. Spread inside each site (logistic growth).
  const within = balance.spread.within * spread * modifier(world, state, 'withinSite');
  for (let i = 0; i < state.sites.length; i++) {
    const s = state.sites[i];
    if (!before[i] || !s.healthy) continue;
    const expected = within * world.susceptibility[i] * before[i] * (s.healthy / s.devices);
    const n = Math.min(s.healthy, stochasticRound(state, expected));
    if (n > 0) infect(state, world, i, n);
  }

  // 2. Jumps along open links, in both directions.
  const between = balance.spread.between * spread * modifier(world, state, 'betweenSites');
  for (const link of world.links) {
    if (!linkOpen(state, world, link)) continue;
    for (const [from, to] of [[link.a, link.b], [link.b, link.a]]) {
      if (before[from] < balance.spread.minInfectedToJump) continue;
      const target = state.sites[to];
      if (!target.healthy) continue;
      if (world.data.sites[to].airGapped && link.kind !== 'airgap') continue;
      const chance =
        between * link.weight * (before[from] / state.sites[from].devices) *
        world.data.sites[to].traits.connectivity * world.susceptibility[to];
      if (rand(state) < chance) {
        infect(state, world, to, 1);
        state.linkActivity[link.index] = state.tick;
      }
    }
  }

  // 3. Bubbles expire.
  const ttl = balance.bubbles.ttl;
  state.bubbles = state.bubbles.filter((b) => state.tick - b.born < ttl);

  state.totals = totals(state);
  if (state.tick % balance.historyEvery === 0) recordHistory(state);
}

/** Is this link carrying infection right now? (Its required evolution is owned.) */
export function linkOpen(state, world, link) {
  return !link.requires || state.evolved.includes(link.requires);
}

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

function infect(state, world, i, n) {
  const s = state.sites[i];
  n = Math.min(n, s.healthy);
  if (n <= 0) return;
  s.healthy -= n;
  s.infected += n;
  const { bubbles } = world.balance;
  if (s.reachedAt === null) {
    s.reachedAt = state.tick;
    state.log.push({ tick: state.tick, type: 'siteReached', site: s.id });
    state.events.push({ type: 'siteReached', site: s.id });
    spawnBubble(state, world, i, bubbles.siteReached, 'site');
    return;
  }
  const chance = Math.min(1, n * bubbles.perInfectionChance * modifier(world, state, 'bubbleChance'));
  if (rand(state) < chance) {
    spawnBubble(state, world, i, randInt(state, bubbles.infectionValue[0], bubbles.infectionValue[1]), 'infection');
  }
}

function spawnBubble(state, world, siteIdx, value, kind) {
  const cfg = world.balance.bubbles;
  if (state.bubbles.length >= cfg.maxOnMap) return;
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

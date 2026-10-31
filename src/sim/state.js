// Creating a new game state. The state is plain JSON-able data (no classes, no
// functions, no references to data/), so it can be saved, compared in tests, and
// replayed: the same seed and the same commands always give the same game.

import { hashSeed } from './rng.js';
import { computeStats } from './stats.js';

/**
 * @param world  from createWorld(data)
 * @param opts   { strainId, difficultyId, seed, strainName }
 */
export function createState(world, { strainId = 'worm', difficultyId = 'normal', seed = 1, strainName = '' } = {}) {
  if (!world.strains.has(strainId)) throw new Error(`Unknown strain: ${strainId}`);
  if (!world.difficulties.has(difficultyId)) throw new Error(`Unknown difficulty: ${difficultyId}`);
  const state = {
    version: 1,
    seed: String(seed),
    rng: hashSeed(seed),
    tick: 0,
    strainId,
    strainName: strainName || world.strains.get(strainId).name,
    difficultyId,
    /** 'picking' (choose patient zero) → 'running'. Phase 2 adds 'won' and 'lost'. */
    status: 'picking',
    patientZero: null,
    points: world.balance.startingPoints,
    pointsEarned: 0,
    /** Owned evolution ids, in the order they were bought. */
    evolved: [],
    /** One entry per data.sites entry, same order. */
    sites: world.data.sites.map((s) => ({
      id: s.id,
      devices: s.devices,
      healthy: s.devices,
      infected: 0,
      remediated: 0,
      /** Tick the first machine here was infected, or null. */
      reachedAt: null,
    })),
    /** Tick of the last infection that crossed each link (for the map animation), by link index. */
    linkActivity: world.data.links.map(() => null),
    bubbles: [],
    nextBubbleId: 1,
    stats: null,
    totals: null,
    /** Key moments for the end screen: { tick, type, ... }. */
    log: [],
    /** World totals every BALANCE.historyEvery ticks: [tick, healthy, infected, remediated]. */
    history: [],
    /** Things that just happened, for the UI and audio. Drained by drainEvents(). */
    events: [],
  };
  state.stats = computeStats(state, world);
  state.totals = totals(state);
  return state;
}

export function totals(state) {
  const t = { devices: 0, healthy: 0, infected: 0, remediated: 0 };
  for (const s of state.sites) {
    t.devices += s.devices;
    t.healthy += s.healthy;
    t.infected += s.infected;
    t.remediated += s.remediated;
  }
  return t;
}

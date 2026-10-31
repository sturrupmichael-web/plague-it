// The three core stats (Spread, Noise, Impact) and the other evolution effects.
// Each stat is the strain's base value plus the effects of every owned evolution,
// clamped to 0..BALANCE.statMax. Other effects add up and are capped by BALANCE.caps.
// Defender responses can block an evolution (state.dfx.blocked): its spread bonuses
// (spread and tagSpread) stop working, fully or partly; its noise stays.

export const STAT_KEYS = ['spread', 'noise', 'impact'];

/** Everything owned evolutions add up to. Stored on the state as state.fx each tick. */
export function computeEffects(state, world) {
  const strain = world.strains.get(state.strainId);
  const stats = { ...strain.base };
  const fx = { tagSpread: {}, remediationResist: 0, cleanResist: 0, reinfect: 0, pointsPerDay: 0, jump: 0 };
  const blocked = state.dfx?.blocked ?? {};
  for (const id of state.evolved) {
    const e = world.evolutions.get(id)?.effects ?? {};
    const keep = 1 - (blocked[id] ?? 0);
    for (const k of STAT_KEYS) stats[k] += (e[k] ?? 0) * (k === 'spread' && e[k] > 0 ? keep : 1);
    for (const [tag, v] of Object.entries(e.tagSpread ?? {})) fx.tagSpread[tag] = (fx.tagSpread[tag] ?? 0) + v * keep;
    for (const k of ['remediationResist', 'cleanResist', 'reinfect', 'pointsPerDay', 'jump']) fx[k] += e[k] ?? 0;
  }
  for (const k of STAT_KEYS) stats[k] = Math.max(0, Math.min(world.balance.statMax, stats[k]));
  for (const [k, cap] of Object.entries(world.balance.caps)) fx[k] = Math.min(cap, fx[k]);
  return { stats, fx };
}

export function computeStats(state, world) {
  return computeEffects(state, world).stats;
}

/** A strain modifier (see data/strains.js), defaulting to 1. */
export function modifier(world, state, key) {
  return world.strains.get(state.strainId).modifiers?.[key] ?? 1;
}

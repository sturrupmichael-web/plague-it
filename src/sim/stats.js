// The three core stats: Spread, Noise and Impact. Each is the strain's base value plus
// the effects of every owned evolution, clamped to 0..BALANCE.statMax.

export const STAT_KEYS = ['spread', 'noise', 'impact'];

export function computeStats(state, world) {
  const strain = world.strains.get(state.strainId);
  const out = { ...strain.base };
  for (const id of state.evolved) {
    const fx = world.evolutions.get(id)?.effects ?? {};
    for (const k of STAT_KEYS) out[k] += fx[k] ?? 0;
  }
  for (const k of STAT_KEYS) out[k] = Math.max(0, Math.min(world.balance.statMax, out[k]));
  return out;
}

/** A strain modifier (see data/strains.js), defaulting to 1. */
export function modifier(world, state, key) {
  return world.strains.get(state.strainId).modifiers?.[key] ?? 1;
}

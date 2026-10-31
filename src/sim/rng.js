// Seeded random numbers. All randomness in the simulation goes through rand(state), and
// the generator's whole state is one 32-bit number stored in the game state (state.rng),
// so a game is reproducible from its seed and can be saved and resumed exactly.
// Algorithm: mulberry32 (small, fast, good enough for a game).

/** Turns any seed (number or string) into a 32-bit unsigned integer. FNV-1a over the text. */
export function hashSeed(seed) {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Next float in [0, 1). Advances state.rng. */
export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [lo, hi], inclusive. */
export function randInt(state, lo, hi) {
  return lo + Math.floor(rand(state) * (hi - lo + 1));
}

/**
 * Rounds an expected count to a whole number, randomly, keeping the average right:
 * 2.3 becomes 2 (70% of the time) or 3 (30%).
 */
export function stochasticRound(state, x) {
  const whole = Math.floor(x);
  return whole + (rand(state) < x - whole ? 1 : 0);
}

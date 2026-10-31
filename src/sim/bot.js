// A simple autopilot for headless balance runs (tests/balance.test.mjs) and, later, the
// debug panel. It collects every bubble and buys evolutions from a plan, in order, as
// soon as it can afford the next one (saving up rather than skipping ahead). The smart
// plan also adapts: when SecOps puts a response in force, it buys a counter to it first
// if one is within reach.

import { createState } from './state.js';
import { startInfection, step, collectBubble, evolve, evolveBlocker } from './sim.js';
import { isCountered } from './defense.js';

export const PLANS = {
  /** Spread quietly, harden, reach the factory, then go loud at the end. */
  smart: [
    'usb-drives', 'av-evasion', 'email-attachments', 'persistence', 'shared-drives', 'patch-resistance',
    'sleep-timer', 'printers', 'guest-wifi', 'air-gap-hop', 'vpn-tunnels', 'deep-persistence',
    'patch-resistance-2', 'cloud-sync', 'hide-in-plain-sight', 'popups', 'slowness', 'wallpaper',
    'crypto-mining', 'data-theft', 'screen-lock', 'encryption', 'poisoned-update', 'bricking',
  ],
  /** All payloads first: loud, high impact, the defenders get every advantage. */
  reckless: [
    'popups', 'wallpaper', 'slowness', 'data-theft', 'crypto-mining', 'screen-lock', 'encryption',
    'bricking', 'air-gap-hop',
  ],
  /** Buys nothing. */
  idle: [],
};

export function botStep(state, world, plan, adapt = false) {
  for (const b of [...state.bubbles]) collectBubble(state, b.id);
  if (adapt) {
    for (const a of state.defense.active) {
      const r = world.responses.get(a.id);
      if (isCountered(state, r)) continue;
      const counter = (r.counteredBy ?? []).find((id) => evolveBlocker(state, world, id) === null);
      if (counter) evolve(state, world, counter);
    }
  }
  for (const id of plan) {
    if (state.evolved.includes(id)) continue;
    const blocker = evolveBlocker(state, world, id);
    if (blocker === null) evolve(state, world, id);
    else if (blocker === 'points') break;
  }
}

/** Plays a whole game. Returns the final state. */
export function playGame(world, { strainId = 'worm', difficultyId = 'normal', seed = 1, start = 'us-ny', plan = 'smart', maxDays = 600 } = {}) {
  const state = createState(world, { strainId, difficultyId, seed });
  startInfection(state, world, start);
  const list = PLANS[plan] ?? plan;
  for (let t = 0; t < maxDays * 24 && state.status === 'running'; t++) {
    if (t % 6 === 0) botStep(state, world, list, plan === 'smart');
    step(state, world);
  }
  return state;
}

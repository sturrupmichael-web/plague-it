// Balance: headless runs of every strain. Phase 1 has no defenders yet, so this checks
// that infection can reach every connected endpoint in a sensible time from every
// patient zero. Phase 2 adds "can be won" and "can be lost" per strain and difficulty.

import { assert } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, advance } from '../src/sim/sim.js';

const world = createWorld(DATA);
const connected = DATA.sites.filter((s) => !s.airGapped);
const connectedDevices = connected.reduce((n, s) => n + s.devices, 0);

export const tests = [
  ...DATA.strains.map((strain) => [`${strain.name}: takes over every connected site from any start within a year`, () => {
    for (const start of connected) {
      const s = createState(world, { strainId: strain.id, seed: `bal-${start.id}` });
      startInfection(s, world, start.id);
      advance(s, world, 365 * 24);
      const infected = s.sites.filter((x) => !DATA.sites.find((d) => d.id === x.id).airGapped).reduce((n, x) => n + x.infected, 0);
      assert(infected === connectedDevices, `from ${start.id}: ${infected}/${connectedDevices} after a year`);
    }
  }]),

  ...DATA.strains.map((strain) => [`${strain.name}: doesn't win in the first two weeks`, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createState(world, { strainId: strain.id, seed });
      startInfection(s, world, 'warehouse-south');
      advance(s, world, 14 * 24);
      assert(s.totals.infected < connectedDevices * 0.5, `seed ${seed}: ${s.totals.infected} infected by day 14`);
    }
  }]),
];

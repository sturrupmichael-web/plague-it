// Detection, remediation, cleaning, and winning and losing.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, step, advance, evolve, collectBubble } from '../src/sim/sim.js';

const world = createWorld(DATA);
const DAY = 24;

function start(opts = {}, site = 'hq') {
  const s = createState(world, { seed: 1, ...opts });
  startInfection(s, world, site);
  return s;
}

/** Runs until `cond(state)` or the game ends. */
function until(s, cond, maxDays = 400) {
  for (let i = 0; i < maxDays * DAY && s.status === 'running' && !cond(s); i++) step(s, world);
  return s;
}

export const tests = [
  ['nobody notices at first, then SecOps detects you', () => {
    const s = start();
    advance(s, world, DAY);
    assertEq(s.detectedAt, null);
    assertEq(s.remediation, 0);
    until(s, (x) => x.detectedAt !== null);
    assert(s.detectedAt !== null, 'never detected');
    assert(s.log.some((e) => e.type === 'detected'), 'detection not logged');
    assert(s.bubbles.some((b) => b.kind === 'event'), 'no detection bubble');
  }],

  ['quieter strains are detected later', () => {
    const when = (evolved) => {
      const s = createState(world, { seed: 2 });
      s.evolved.push(...evolved);
      startInfection(s, world, 'hq');
      return until(s, (x) => x.detectedAt !== null).detectedAt ?? Infinity;
    };
    const loud = when(['popups', 'wallpaper', 'data-theft']);
    const normal = when([]);
    const quiet = when(['av-evasion', 'persistence', 'sleep-timer']);
    assert(loud < normal && normal < quiet, `detection order wrong: loud ${loud}, normal ${normal}, quiet ${quiet}`);
  }],

  ['harder difficulties detect sooner and remediate faster', () => {
    const run = (difficultyId) => {
      const s = start({ difficultyId });
      until(s, (x) => x.detectedAt !== null);
      const t = s.detectedAt;
      advance(s, world, 10 * DAY);
      return { t, r: s.remediation };
    };
    const easy = run('understaffed');
    const hard = run('competent');
    assert(hard.t < easy.t, 'competent SecOps was not faster to detect');
    assert(hard.r > easy.r, 'competent SecOps was not faster to remediate');
  }],

  ['after detection the Remediation bar fills and machines get cleaned', () => {
    const s = until(start(), (x) => x.detectedAt !== null);
    const r0 = s.remediation;
    advance(s, world, 5 * DAY);
    assert(s.remediation > r0, 'bar did not move');
    assert(s.totals.remediated > 0, 'nothing was cleaned');
    for (const x of s.sites) assertEq(x.healthy + x.infected + x.remediated, x.devices, 'count drift at ' + x.id);
  }],

  ['remediation resistance slows the bar', () => {
    const progress = (evolved) => {
      const s = createState(world, { seed: 3 });
      startInfection(s, world, 'hq');
      until(s, (x) => x.detectedAt !== null);
      s.evolved.push(...evolved);
      advance(s, world, 10 * DAY);
      return s.remediation;
    };
    assert(progress(['av-evasion', 'patch-resistance', 'patch-resistance-2']) < progress([]) * 0.8, 'patch resistance did nothing');
  }],

  ['a fully compromised site can\'t be cleaned', () => {
    const s = until(start(), (x) => x.detectedAt !== null);
    const site = s.sites.find((x) => x.id === 'retail-iberia');
    s.remediated += 0;
    site.healthy = 0;
    site.remediated = 0;
    site.infected = site.devices;
    site.reachedAt ??= s.tick;
    advance(s, world, 3 * DAY);
    assertEq(site.infected, site.devices, 'machines were cleaned at a fully compromised site');
  }],

  ['cleaned machines can be infected again', () => {
    const s = start({}, 'hq');
    const hq = s.sites[0];
    hq.healthy = 0;
    hq.remediated = hq.devices - hq.infected;
    advance(s, world, 10 * DAY);
    assert(hq.infected > 1, 'remediated machines were never retaken');
  }],

  ['win: every endpoint compromised', () => {
    const s = start();
    for (const x of s.sites) {
      x.infected = x.devices - (x.id === 'factory' ? 1 : 0);
      x.healthy = x.id === 'factory' ? 1 : 0;
      x.remediated = 0;
    }
    s.evolved.push('air-gap-hop');
    until(s, () => false, 30);
    assertEq(s.status, 'won');
    assertEq(s.outcome, 'compromised');
    assertEq(s.totals.infected, s.totals.devices);
    assert(s.log.at(-1).type === 'won', 'win not logged');
    const t = s.tick;
    step(s, world);
    assertEq(s.tick, t, 'ticked after the game ended');
    s.points = 999;
    assert(!evolve(s, world, 'usb-drives'), 'evolved after the game ended');
  }],

  ['lose: the Remediation bar reaches 100%', () => {
    const s = until(start(), (x) => x.detectedAt !== null);
    s.remediation = 99.99;
    until(s, () => false, 2);
    assertEq(s.status, 'lost');
    assertEq(s.outcome, 'remediated');
  }],

  ['lose: every infected machine is cleaned', () => {
    const s = until(start({}, 'retail-iberia'), (x) => x.detectedAt !== null, 400);
    for (const x of s.sites) {
      x.remediated += x.infected;
      x.infected = 0;
    }
    s.sites[0].remediated -= 1;
    s.sites[0].infected = 1;
    s.sites[0].healthy = 0;
    s.sites[0].remediated = s.sites[0].devices - 1;
    // Make the last machine certain to be cleaned.
    s.detectedAt ??= s.tick;
    s.remediation = 50;
    for (let i = 0; i < 2000 && s.status === 'running'; i++) {
      s.sites[0].infected = Math.min(s.sites[0].infected, 1);
      s.sites[0].remediated = s.sites[0].devices - s.sites[0].infected;
      for (const x of s.sites.slice(1)) {
        x.remediated += x.infected;
        x.infected = 0;
      }
      step(s, world);
    }
    assertEq(s.status, 'lost');
    assertEq(s.outcome, 'eradicated');
  }],

  ['bubbles stop when the game ends', () => {
    const s = start();
    s.remediation = 100;
    s.detectedAt = 0;
    step(s, world);
    assertEq(s.status, 'lost');
    assertEq(s.bubbles, []);
    assertEq(collectBubble(s, 1), 0);
  }],
];

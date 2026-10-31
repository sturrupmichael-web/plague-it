// Simulation: deterministic for a seed, spreads inside and between sites, respects
// locked links and air gaps, and bubbles work.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, step, advance, collectBubble, drainEvents } from '../src/sim/sim.js';
import { rand, hashSeed, stochasticRound } from '../src/sim/rng.js';
import { Game } from '../src/game.js';

const world = createWorld(DATA);
// The same world with detection switched off, for tests about spread alone.
const quiet = createWorld({ ...DATA, balance: { ...DATA.balance, detection: { ...DATA.balance.detection, threshold: Infinity } } });
const DAY = 24;

function run(seed, days, { site = 'us-ny', evolved = [], w = quiet } = {}) {
  const world = w;
  const s = createState(world, { seed });
  s.evolved.push(...evolved);
  startInfection(s, world, site);
  advance(s, world, days * DAY);
  return s;
}
const site = (s, id) => s.sites.find((x) => x.id === id);

export const tests = [
  ['the RNG is reproducible and in range', () => {
    const a = { rng: hashSeed('abc') };
    const b = { rng: hashSeed('abc') };
    const xs = Array.from({ length: 1000 }, () => rand(a));
    assertEq(xs, Array.from({ length: 1000 }, () => rand(b)));
    assert(xs.every((x) => x >= 0 && x < 1), 'out of range');
    const mean = xs.reduce((p, c) => p + c, 0) / xs.length;
    assert(Math.abs(mean - 0.5) < 0.05, 'mean is off: ' + mean);
    assert(hashSeed('abc') !== hashSeed('abd'), 'similar seeds collide');
  }],

  ['stochastic rounding keeps the average', () => {
    const s = { rng: 1 };
    let total = 0;
    for (let i = 0; i < 10000; i++) total += stochasticRound(s, 0.3);
    assert(Math.abs(total / 10000 - 0.3) < 0.02, 'average ' + total / 10000);
  }],

  ['same seed gives the same game, different seeds differ', () => {
    const a = run(42, 60, { w: world });
    const b = run(42, 60, { w: world });
    assert(a.detectedAt !== null, 'expected detection within 60 days');
    assertEq(a, b);
    const c = run(43, 60, { w: world });
    assert(JSON.stringify(a.sites) !== JSON.stringify(c.sites), 'different seeds gave identical games');
  }],

  ['a saved state resumes identically', () => {
    const a = run(7, 20, { w: world });
    const copy = JSON.parse(JSON.stringify(a));
    advance(a, world, 20 * DAY);
    advance(copy, world, 20 * DAY);
    assertEq(a, copy);
  }],

  ['nothing happens before patient zero is chosen', () => {
    const s = createState(world, { seed: 1 });
    step(s, world);
    assertEq(s.tick, 0);
    assertEq(s.status, 'picking');
  }],

  ['patient zero can\'t be air-gapped or unknown', () => {
    const s = createState(world, { seed: 1 });
    assert(!startInfection(s, world, 'factory'), 'started in the factory');
    assert(!startInfection(s, world, 'atlantis'), 'started nowhere');
    assert(startInfection(s, world, 'us-ny'), 'could not start at hq');
    assert(!startInfection(s, world, 'ca-on'), 'started twice');
    assertEq(site(s, 'us-ny').infected, 1);
  }],

  ['infection grows inside the starting site', () => {
    const s = run(1, 10);
    const hq = site(s, 'us-ny');
    assert(hq.infected > 30, 'hq infected only ' + hq.infected);
    assertEq(hq.healthy + hq.infected + hq.remediated, hq.devices, 'machines were created or lost');
  }],

  ['infection jumps between sites along open links', () => {
    const s = run(1, 60);
    const reached = s.sites.filter((x) => x.reachedAt !== null).length;
    assert(reached >= 8, 'only reached ' + reached + ' sites in 60 days');
    assert(s.linkActivity.some((t) => t !== null), 'no link activity recorded');
    assert(s.log.filter((e) => e.type === 'siteReached').length === reached, 'log missing site events');
  }],

  ['counts always add up and never go negative', () => {
    const s = run(3, 120);
    for (const x of s.sites) {
      assert(x.healthy >= 0 && x.infected >= 0 && x.remediated >= 0, 'negative count at ' + x.id);
      assertEq(x.healthy + x.infected + x.remediated, x.devices, 'count drift at ' + x.id);
    }
    assertEq(s.totals.devices, DATA.sites.reduce((n, x) => n + x.devices, 0));
  }],

  ['locked links carry nothing until their vector is owned', () => {
    const idx = DATA.links.map((l, i) => [l, i]).filter(([l]) => l.requires).map(([, i]) => i);
    for (const seed of [1, 2, 3]) {
      const s = run(seed, 150);
      for (const i of idx) assertEq(s.linkActivity[i], null, `locked link #${i} carried infection`);
    }
    const open = run(1, 150, { evolved: ['email-attachments', 'vpn-tunnels', 'cloud-sync'] });
    assert(idx.some((i) => open.linkActivity[i] !== null), 'opened links never carried anything');
  }],

  ['the air-gapped factory needs air-gap hopping', () => {
    for (const seed of [1, 2, 3]) assertEq(site(run(seed, 200), 'factory').infected, 0, 'factory infected without air-gap hopping');
    const s = run(1, 200, { evolved: ['air-gap-hop'] });
    assert(site(s, 'factory').infected > 0, 'factory never reached with air-gap hopping');
  }],

  ['owning evolutions changes the stats', () => {
    const s = createState(world, { seed: 1 });
    const before = { ...s.stats };
    s.evolved.push('cloud-sync');
    startInfection(s, world, 'us-ny');
    step(s, world);
    assertEq(s.stats.spread, before.spread + DATA.evolutions.find((e) => e.id === 'cloud-sync').effects.spread);
  }],

  ['reaching a site spawns a bubble; collecting it adds points once', () => {
    const s = createState(world, { seed: 5 });
    startInfection(s, world, 'us-ny');
    assertEq(s.bubbles.length, 1);
    const b = s.bubbles[0];
    assertEq(b.kind, 'site');
    const pts = s.points;
    assertEq(collectBubble(s, b.id), b.value);
    assertEq(s.points, pts + b.value);
    assertEq(collectBubble(s, b.id), 0, 'collected twice');
    const events = drainEvents(s).map((e) => e.type);
    assert(events.includes('siteReached') && events.includes('bubbleCollected'), 'events: ' + events);
    assertEq(drainEvents(s), []);
  }],

  ['bubbles expire and are capped', () => {
    const s = run(9, 60);
    const { ttl, maxOnMap } = DATA.balance.bubbles;
    assert(s.bubbles.filter((b) => b.kind === 'infection').length <= maxOnMap, 'too many infection bubbles');
    assert(s.bubbles.every((b) => s.tick - b.born < ttl), 'stale bubble');
  }],

  ['history is recorded for the end-screen graph', () => {
    const s = run(1, 10);
    assert(s.history.length >= 10, 'history has ' + s.history.length + ' entries');
    const last = s.history.at(-1);
    assertEq(last.length, 4);
  }],

  ['the game driver runs a fixed number of ticks per real second', () => {
    const g = new Game(DATA);
    g.newGame({ seed: 1 });
    g.startInfection('us-ny');
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += g.update(1 / 60); // one second at 60 fps
    assertEq(ticks, DATA.balance.ticksPerSecond);
    g.speed = 3;
    ticks = 0;
    for (let i = 0; i < 60; i++) ticks += g.update(1 / 60);
    assertEq(ticks, DATA.balance.ticksPerSecond * 3);
    g.paused = true;
    assertEq(g.update(1), 0, 'ran while paused');
  }],

  ['frame rate does not change the outcome', () => {
    const a = new Game(DATA);
    const b = new Game(DATA);
    for (const g of [a, b]) {
      g.newGame({ seed: 11 });
      g.startInfection('us-ny');
    }
    for (let i = 0; i < 600; i++) a.update(1 / 60); // 10 s at 60 fps
    for (let i = 0; i < 300; i++) b.update(1 / 30); // 10 s at 30 fps
    assertEq(a.state.tick, b.state.tick);
    assertEq(a.state.sites, b.state.sites);
  }],
];

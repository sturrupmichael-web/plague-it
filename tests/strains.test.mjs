// Strains and scenarios: each strain's mechanic, unlocks, and each scenario's rule changes.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld, deepMerge } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, step, advance, evolve, evolveCost, triggerEncryption } from '../src/sim/sim.js';
import { applyResponse } from '../src/sim/defense.js';
import { strainUnlocked } from '../src/save.js';
import { headlineMatches } from '../src/news.js';

const world = createWorld(DATA);
const DAY = 24;
const game = (strainId, { w = world, site = 'us-ny', seed = 1 } = {}) => {
  const s = createState(w, { strainId, seed });
  startInfection(s, w, site);
  return s;
};
const siteOf = (s, w, id) => s.sites[w.siteIndex.get(id)];

/** Infects half of every connected site, for tests that need a well-spread game. */
function spreadOut(s, share = 0.5) {
  for (const x of s.sites) {
    const n = Math.floor(x.healthy * share);
    x.healthy -= n;
    x.infected += n;
  }
}

export const tests = [
  ['there are seven strains, each unlocked by beating the one before', () => {
    assertEq(DATA.strains.map((s) => s.id), ['worm', 'trojan', 'macro', 'botnet', 'rootkit', 'polymorphic', 'ransomware']);
    for (let i = 1; i < DATA.strains.length; i++) assertEq(DATA.strains[i].unlockedBy, DATA.strains[i - 1].id);
    const fresh = { beaten: [] };
    assert(strainUnlocked(DATA.strains[0], fresh), 'Worm should start unlocked');
    assert(!strainUnlocked(DATA.strains[1], fresh), 'Trojan should start locked');
    assert(strainUnlocked(DATA.strains[1], { beaten: ['worm'] }), 'beating Worm should unlock Trojan');
  }],

  ['Trojan is detected much later than Worm', () => {
    const quietWorld = createWorld(DATA);
    const detectedDay = (strainId) => {
      const s = game(strainId, { w: quietWorld, seed: 4 });
      while (s.detectedAt === null && s.tick < 200 * DAY && s.status === 'running') step(s, quietWorld);
      return s.detectedAt ?? Infinity;
    };
    assert(detectedDay('trojan') > detectedDay('worm') * 1.3, 'Trojan not much quieter');
  }],

  ['Macro Virus starts with Email Attachments and rides email links twice as well', () => {
    const s = game('macro');
    assert(s.evolved.includes('email-attachments'), 'no free Email Attachments');
    assertEq(s.paid['email-attachments'], 0);
    const w = game('worm');
    assert(evolveCost(s, world, 'shared-drives') < evolveCost(w, world, 'shared-drives'), 'Shared Drives not cheaper');
    assert(s.fx.tagSpread.finance > 0.3, 'no built-in finance bonus');
  }],

  ['Botnet earns Exploit Points from infected machines, and payloads hit half as hard', () => {
    const s = game('botnet');
    spreadOut(s, 0.9);
    const quiet = s.points;
    s.detectedAt = 0; // keep it simple: no detection bubble
    s.bubbles = [];
    advance(s, world, 2 * DAY);
    assert(s.pointsEarned - 0 >= 5 && s.points > quiet, `earned only ${s.pointsEarned}`);
    s.points = 999;
    const before = s.stats.impact;
    evolve(s, world, 'popups');
    assertEq(s.stats.impact - before, 0.5);
  }],

  ['Rootkit is harder to clean but pays more for evolutions', () => {
    const r = game('rootkit');
    const w = game('worm');
    assert(evolveCost(r, world, 'usb-drives') > evolveCost(w, world, 'usb-drives'), 'not dearer');
    assert(r.fx.cleanResist >= 0.25, 'no built-in clean resistance');
  }],

  ['Polymorphic mutates on its own: gaining free evolutions, sometimes losing one', () => {
    const s = game('polymorphic', { seed: 7 });
    s.suspicion = -1e9; // never detected, so the game runs long
    advance(s, world, 80 * DAY);
    const mutations = s.log.filter((e) => e.type === 'mutated');
    assert(mutations.length >= 10, 'only ' + mutations.length + ' mutations in 80 days');
    assert(mutations.some((m) => m.gained) && mutations.some((m) => !m.gained), 'mutations went only one way');
    for (const id of s.evolved) {
      const e = world.evolutions.get(id);
      assert(e.prereqs.every((p) => s.evolved.includes(p)), `${id} owned without its prerequisites`);
    }
  }],

  ['Ransomware: Encrypt alerts everyone, locks machines that cleaning cannot touch, and wins when all are encrypted', () => {
    const s = game('ransomware');
    spreadOut(s, 0.5);
    assertEq(s.detectedAt, null);
    assert(!triggerEncryption(createState(world, { strainId: 'worm' }), world), 'other strains cannot encrypt');
    assert(triggerEncryption(s, world), 'could not trigger');
    assert(!triggerEncryption(s, world), 'triggered twice');
    assert(s.detectedAt !== null, 'not detected at once');
    advance(s, world, 2 * DAY);
    assertEq(s.defense.alert, 1);
    assert(s.totals.encrypted > 0, 'nothing encrypted');
    for (const x of s.sites) assert(x.encrypted <= x.infected, 'more encrypted than infected at ' + x.id);
    // Reimaging restores encrypted machines too.
    const ny = siteOf(s, world, 'us-ny');
    const enc = ny.encrypted;
    applyResponse(s, world, world.responses.get('reimage'), 'us-ny');
    assert(ny.encrypted < enc, 'reimage did not touch encrypted machines');
    // Everything infected and encrypted: a win.
    for (const x of s.sites) {
      x.infected = x.devices;
      x.encrypted = x.devices;
      x.healthy = 0;
      x.remediated = 0;
    }
    step(s, world);
    assertEq(s.status, 'won');
    assertEq(s.outcome, 'encrypted');
  }],

  ['other strains win by compromising, not encrypting', () => {
    const s = game('worm');
    for (const x of s.sites) {
      x.infected = x.devices;
      x.healthy = 0;
    }
    step(s, world);
    assertEq(s.outcome, 'compromised');
  }],

  // ── Scenarios ─────────────────────────────────────────────────────────────
  ['scenarios change the world without touching the shared data', () => {
    const skeleton = createWorld(DATA, 'skeleton-crew');
    const interns = createWorld(DATA, 'intern-summer');
    const ny = (w) => w.data.sites[w.siteIndex.get('us-ny')];
    assert(ny(skeleton).devices < ny(world).devices * 0.7, 'skeleton crew still fully staffed');
    assert(ny(interns).traits.savvy < ny(world).traits.savvy - 0.2, 'interns are not less savvy');
    assert(skeleton.balance.detection.rate < world.balance.detection.rate, 'detection not slower');
    assertEq(skeleton.balance.detection.threshold, world.balance.detection.threshold);
    assertEq(DATA.sites.find((x) => x.id === 'us-ny').devices, ny(world).devices);
    assertEq(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } }), { a: { b: 1, c: 3 } });
    let threw = false;
    try {
      createWorld(DATA, 'no-such-scenario');
    } catch {
      threw = true;
    }
    assert(threw, 'unknown scenario accepted');
  }],

  ['The Merger: Canada has no machines until the deal closes, then joins unpatched', () => {
    const w = createWorld(DATA, 'merger');
    const s = createState(w, { seed: 2 });
    assert(!startInfection(s, w, 'ca-on'), 'started in an acquired region');
    assert(startInfection(s, w, 'us-ny'), 'could not start in New York');
    const on = siteOf(s, w, 'ca-on');
    assertEq(on.devices, 0);
    assert(on.pending, 'Ontario not pending');
    s.suspicion = -1e9;
    while (s.tick < w.merger.tick) step(s, w);
    assert(!on.pending && on.devices > 1000, 'Ontario never joined');
    assert(s.log.some((e) => e.type === 'merger'), 'merger not logged');
    const base = DATA.sites.find((x) => x.id === 'ca-on').traits.patch;
    assert(w.data.sites[w.siteIndex.get('ca-on')].traits.patch < base, 'acquired machines are not less patched');
  }],

  ['Zero Trust: SecOps acts from day one, before detection', () => {
    const w = createWorld(DATA, 'zero-trust');
    const s = createState(w, { seed: 3 });
    startInfection(s, w, 'us-ny');
    s.suspicion = -1e9;
    advance(s, w, 15 * DAY);
    assertEq(s.detectedAt, null);
    assert(s.defense.funded > 0, 'no funding before detection');
    assert(s.log.some((e) => e.type === 'response'), 'no responses before detection');
    assertEq(s.remediation, 0);
  }],

  ['Patch Tuesday: you lose when the patch lands', () => {
    const w = createWorld(DATA, 'patch-tuesday');
    const s = createState(w, { seed: 3 });
    startInfection(s, w, 'us-ny');
    s.suspicion = -1e9;
    advance(s, w, 200 * DAY);
    assertEq(s.status, 'lost');
    assertEq(s.outcome, 'patched');
    assertEq(s.endedAt, w.patchDeadline);
  }],

  ['headlines can be tied to a strain or a scenario', () => {
    const s = game('trojan');
    const trojanOnly = DATA.headlines.find((h) => h.when?.strain === 'trojan' && !h.when.event);
    const internOnly = DATA.headlines.find((h) => h.when?.scenario === 'intern-summer' && !h.when.minShare);
    s.totals = { ...s.totals, infected: s.totals.devices * 0.4 };
    assert(headlineMatches(trojanOnly, null, s, DATA), 'Trojan headline did not match a Trojan game');
    assert(!headlineMatches(trojanOnly, null, { ...s, strainId: 'worm' }, DATA), 'Trojan headline matched a Worm game');
    assert(!headlineMatches(internOnly, null, s, DATA), 'Intern headline outside Intern Summer');
    assert(headlineMatches(internOnly, null, { ...s, scenarioId: 'intern-summer' }, DATA), 'Intern headline missing in Intern Summer');
  }],
];

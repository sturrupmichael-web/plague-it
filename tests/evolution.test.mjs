// Evolution: buying, prerequisites, rising costs, devolving and refunds.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { describeEffects } from '../src/ui/evolution.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import {
  startInfection, step, evolve, devolve, evolveCost, evolveBlocker, devolveRefund, dependents, linkOpen,
} from '../src/sim/sim.js';

const world = createWorld(DATA);
const evo = (id) => DATA.evolutions.find((e) => e.id === id);

function fresh(points = 1000) {
  const s = createState(world, { seed: 1 });
  startInfection(s, world, 'hq');
  s.points = points;
  return s;
}

export const tests = [
  ['every branch has a full tree with roots and later tiers', () => {
    for (const branch of ['vectors', 'payloads', 'abilities']) {
      const list = DATA.evolutions.filter((e) => e.branch === branch);
      assert(list.length >= 6, `${branch} has only ${list.length}`);
      assert(list.some((e) => !e.prereqs.length), `${branch} has no root`);
      assert(list.some((e) => e.prereqs.length), `${branch} has no prerequisites`);
    }
    for (const id of ['email-attachments', 'usb-drives', 'shared-drives', 'vpn-tunnels', 'cloud-sync', 'guest-wifi', 'printers', 'poisoned-update',
      'popups', 'slowness', 'wallpaper', 'crypto-mining', 'data-theft', 'screen-lock', 'encryption', 'bricking',
      'av-evasion', 'patch-resistance', 'persistence', 'sleep-timer', 'air-gap-hop']) {
      assert(evo(id), 'missing evolution ' + id);
    }
  }],

  ['buying an evolution spends points and applies its effects', () => {
    const s = fresh(20);
    const spread = s.stats.spread;
    const price = evolveCost(s, world, 'usb-drives');
    assertEq(price, evo('usb-drives').cost);
    assert(evolve(s, world, 'usb-drives'), 'could not buy');
    assertEq(s.points, 20 - price);
    assertEq(s.stats.spread, spread + evo('usb-drives').effects.spread);
    assertEq(s.paid['usb-drives'], price);
    assertEq(evolveBlocker(s, world, 'usb-drives'), 'owned');
    assert(!evolve(s, world, 'usb-drives'), 'bought twice');
  }],

  ['prerequisites are enforced', () => {
    const s = fresh();
    assertEq(evolveBlocker(s, world, 'shared-drives'), 'locked');
    assert(!evolve(s, world, 'shared-drives'), 'bought without prerequisite');
    evolve(s, world, 'email-attachments');
    assert(evolve(s, world, 'shared-drives'), 'could not buy after prerequisite');
    // Two prerequisites: both are needed.
    evolve(s, world, 'popups');
    evolve(s, world, 'slowness');
    evolve(s, world, 'crypto-mining');
    assertEq(evolveBlocker(s, world, 'screen-lock'), 'locked');
  }],

  ['you can\'t buy what you can\'t afford', () => {
    const s = fresh(2);
    assertEq(evolveBlocker(s, world, 'usb-drives'), 'points');
    assert(!evolve(s, world, 'usb-drives'), 'bought on credit');
    assertEq(s.points, 2);
  }],

  ['costs rise with each evolution owned in the same branch only', () => {
    const s = fresh();
    const base = evolveCost(s, world, 'email-attachments');
    const otherBranch = evolveCost(s, world, 'popups');
    evolve(s, world, 'usb-drives');
    assert(evolveCost(s, world, 'email-attachments') > base, 'vector cost did not rise');
    assertEq(evolveCost(s, world, 'popups'), otherBranch, 'payload cost changed');
    evolve(s, world, 'printers');
    const g = DATA.balance.evolve.costGrowth;
    assertEq(evolveCost(s, world, 'email-attachments'), Math.round(evo('email-attachments').cost * (1 + g * 2)));
  }],

  ['devolving refunds part of the price and removes the effects', () => {
    const s = fresh(50);
    evolve(s, world, 'av-evasion');
    const noise = s.stats.noise;
    const points = s.points;
    const refund = devolveRefund(s, world, 'av-evasion');
    assertEq(refund, Math.floor(s.paid['av-evasion'] * DATA.balance.evolve.refundRate));
    assert(devolve(s, world, 'av-evasion'), 'could not devolve');
    assertEq(s.points, points + refund);
    assert(s.stats.noise > noise, 'noise did not go back up');
    assert(!s.evolved.includes('av-evasion') && !('av-evasion' in s.paid), 'still owned');
    assert(!devolve(s, world, 'av-evasion'), 'devolved twice');
  }],

  ['you can\'t devolve something another owned evolution needs', () => {
    const s = fresh();
    evolve(s, world, 'av-evasion');
    evolve(s, world, 'persistence');
    assertEq(dependents(s, world, 'av-evasion'), ['persistence']);
    assert(!devolve(s, world, 'av-evasion'), 'devolved a prerequisite');
    assert(devolve(s, world, 'persistence') && devolve(s, world, 'av-evasion'), 'could not devolve leaf-first');
  }],

  ['vectors open and devolving closes their links', () => {
    const s = fresh();
    const vpn = world.links.find((l) => l.requires === 'vpn-tunnels');
    assert(!linkOpen(s, world, vpn), 'VPN link open from the start');
    for (const id of ['email-attachments', 'shared-drives', 'vpn-tunnels']) evolve(s, world, id);
    assert(linkOpen(s, world, vpn), 'VPN link still closed');
    devolve(s, world, 'vpn-tunnels');
    assert(!linkOpen(s, world, vpn), 'VPN link still open after devolving');
  }],

  ['effects are capped', () => {
    const s = fresh(10000);
    for (const e of DATA.evolutions) evolve(s, world, e.id);
    for (const e of DATA.evolutions) evolve(s, world, e.id); // second pass for prerequisites
    step(s, world);
    for (const [k, cap] of Object.entries(DATA.balance.caps)) assert(s.fx[k] <= cap, `${k} over its cap`);
    for (const k of ['spread', 'noise', 'impact']) assert(s.stats[k] >= 0 && s.stats[k] <= DATA.balance.statMax, `${k} out of range`);
  }],

  ['site-type vectors speed up spread at those sites', () => {
    const grow = (evolved) => {
      const s = createState(world, { seed: 4 });
      s.evolved.push(...evolved);
      startInfection(s, world, 'retail-midwest');
      for (let i = 0; i < 24 * 6; i++) step(s, world);
      return s.sites.find((x) => x.id === 'retail-midwest').infected;
    };
    let plain = 0;
    let boosted = 0;
    for (let i = 0; i < 3; i++) {
      plain += grow([]);
      boosted += grow(['usb-drives', 'guest-wifi'].slice(0, 2));
    }
    assert(boosted > plain * 1.2, `guest Wi-Fi barely helped retail: ${plain} vs ${boosted}`);
  }],

  ['crypto-mining earns points over time', () => {
    const s = fresh(100);
    for (const id of ['popups', 'slowness', 'crypto-mining']) evolve(s, world, id);
    const before = s.points;
    for (let i = 0; i < 24 * 30 && s.status === 'running'; i++) {
      s.bubbles = [];
      step(s, world);
    }
    assert(s.points > before, 'no income');
  }],

  ['every evolution has a readable effect list', () => {
    for (const e of DATA.evolutions) {
      const lines = describeEffects(e, DATA);
      assert(lines.length > 0, `${e.id} has no described effects`);
    }
    const lines = describeEffects(evo('vpn-tunnels'), DATA).map((l) => l.text);
    assert(lines.some((l) => /Opens \d+ VPN link/.test(l)), 'link opening not described: ' + lines);
  }],
];

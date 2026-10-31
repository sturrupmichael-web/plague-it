// The defender AI: funding, picking responses, their effects, counters, the IR firm, and
// the news ticker's headline picking.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, step, advance, evolve, linkOpen, refresh } from '../src/sim/sim.js';
import { applyResponse, responseOptions, defenseTick, startDefense } from '../src/sim/defense.js';
import { eventHeadlines, ambientHeadline, headlineMatches } from '../src/news.js';

const world = createWorld(DATA);
const response = (id) => world.responses.get(id);
const site = (s, id) => s.sites[world.siteIndex.get(id)];

/** A running game, detected at once, with `evolved` owned and some infection spread around. */
function detectedGame({ evolved = [], seed = 1, difficultyId = 'normal' } = {}) {
  const s = createState(world, { seed, difficultyId });
  s.evolved.push(...evolved);
  startInfection(s, world, 'us-ny');
  for (const id of ['us-ny', 'us-nj', 'us-pa', 'ca-on']) {
    const x = site(s, id);
    const n = Math.floor(x.healthy / 2);
    x.healthy -= n;
    x.infected += n;
  }
  s.suspicion = DATA.balance.detection.threshold - 1e-9;
  step(s, world);
  assert(s.detectedAt !== null, 'not detected');
  return s;
}

export const tests = [
  ['SecOps does nothing before it notices you', () => {
    const quiet = createWorld({ ...DATA, balance: { ...DATA.balance, detection: { ...DATA.balance.detection, threshold: Infinity } } });
    const s = createState(quiet, { seed: 3 });
    startInfection(s, quiet, 'us-ny');
    advance(s, quiet, 40 * 24);
    assertEq(s.defense.funded, 0);
    assertEq(s.defense.active, []);
  }],

  ['funding flows after detection, faster with more Impact', () => {
    const fund = (impact) => {
      const s = detectedGame();
      s.stats.impact = impact;
      const before = s.defense.funded;
      defenseTick(s, world, 0.2);
      return s.defense.funded - before;
    };
    assert(fund(10) > fund(0) * 1.5, `impact barely matters: ${fund(0)} vs ${fund(10)}`);
  }],

  ['the AI targets the vectors you rely on', () => {
    const s = detectedGame({ evolved: ['email-attachments', 'shared-drives'] });
    const opts = responseOptions(s, world);
    const block = opts.find((o) => o.id === 'block-attachments');
    const usb = opts.find((o) => o.id === 'disable-usb');
    assert(block && usb, 'expected both early responses to be options');
    assert(block.weight > usb.weight * 2, `email response not favoured: ${block.weight} vs ${usb.weight}`);
    // Smarter difficulties lean on triggers harder.
    const easy = responseOptions(detectedGame({ evolved: ['email-attachments'], difficultyId: 'understaffed' }), world);
    const hard = responseOptions(detectedGame({ evolved: ['email-attachments'], difficultyId: 'competent' }), world);
    const w = (o) => o.find((x) => x.id === 'block-attachments').weight;
    assert(w(hard) > w(easy), 'competent SecOps should target harder');
  }],

  ['big responses need a higher alert level', () => {
    const s = detectedGame();
    s.defense.alert = 0;
    const ids = responseOptions(s, world).map((o) => o.id);
    assert(!ids.includes('reimage') && !ids.includes('isolate-site'), 'late responses offered at alert 0: ' + ids);
    s.defense.alert = 1;
    const later = responseOptions(s, world).map((o) => o.id);
    assert(later.includes('reimage') && later.includes('isolate-site'), 'late responses missing at alert 1: ' + later);
  }],

  ['the AI picks responses over time, saving up when it must', () => {
    const s = detectedGame();
    advance(s, world, 30 * 24);
    const used = s.log.filter((e) => e.type === 'response');
    assert(used.length >= 2, 'expected at least two responses in 30 days, got ' + used.length);
    const gaps = used.slice(1).map((e, i) => e.tick - used[i].tick);
    assert(gaps.every((g) => g >= Math.round(DATA.balance.defense.decisionEvery * 1) - 1), 'responses came too close together: ' + gaps);
    assert(s.defense.budget >= 0, 'overspent');
  }],

  ['blocking email attachments closes email links and its spread bonus; a counter halves it', () => {
    const s = detectedGame({ evolved: ['email-attachments'] });
    refresh(s, world);
    const spreadBefore = s.stats.spread;
    const email = world.links.find((l) => l.kind === 'email');
    assert(linkOpen(s, world, email), 'email link should start open');
    applyResponse(s, world, response('block-attachments'));
    refresh(s, world);
    assert(!linkOpen(s, world, email), 'email link still open');
    assertEq(s.stats.spread, spreadBefore - 1);
    // Antivirus Evasion counters it: half the effect.
    s.points = 999;
    assert(evolve(s, world, 'av-evasion'), 'could not evolve the counter');
    assertEq(s.dfx.linkFactor[email.index], 0.5);
    assert(linkOpen(s, world, email), 'countered link should carry infection again (at half strength)');
    assertEq(s.stats.spread, spreadBefore - 0.5);
  }],

  ['isolating a site cuts all its links, then lifts after its duration', () => {
    const s = detectedGame();
    applyResponse(s, world, response('isolate-site'), 'us-ny');
    const touching = world.links.filter((l) => l.from === 'us-ny' || l.to === 'us-ny');
    assert(touching.length > 3, 'New York should have plenty of links');
    assert(touching.every((l) => s.dfx.linkFactor[l.index] === 0), 'a link stayed open');
    assert(s.dfx.sites[world.siteIndex.get('us-ny')].spread < 1, 'spread inside not slowed');
    const others = world.links.filter((l) => l.from !== 'us-ny' && l.to !== 'us-ny');
    assert(others.every((l) => s.dfx.linkFactor[l.index] === 1), 'it closed links elsewhere');
    s.defense.nextDecision = Infinity;
    const until = s.defense.active[0].until;
    while (s.tick < until && s.status === 'running') step(s, world);
    assertEq(s.defense.active.length, 0);
    assert(s.events.some((e) => e.type === 'responseEnded' && e.site === 'us-ny'), 'no responseEnded event');
    refresh(s, world);
    assert(touching.every((l) => s.dfx.linkFactor[l.index] === 1), 'links not reopened');
  }],

  ['reimaging cleans much of a site at once; Deep Persistence halves that', () => {
    const cleaned = (evolved) => {
      const s = detectedGame({ evolved });
      const before = site(s, 'us-ny').infected;
      applyResponse(s, world, response('reimage'), 'us-ny');
      return (before - site(s, 'us-ny').infected) / before;
    };
    const plain = cleaned([]);
    const resisted = cleaned(['av-evasion', 'persistence', 'deep-persistence']);
    assert(Math.abs(plain - response('reimage').effects.cleanNow) < 0.01, 'cleaned ' + plain);
    assert(Math.abs(resisted - plain / 2) < 0.01, `counter didn't halve it: ${resisted} vs ${plain}`);
  }],

  ['site hardening makes a site harder to infect', () => {
    const s = detectedGame();
    applyResponse(s, world, response('emergency-patch'));
    const i = world.siteIndex.get('us-tx');
    const hardened = world.susceptibilityOf(DATA.sites[i].traits, s.dfx.sites[i]);
    assert(hardened < world.susceptibility[i] * 0.95, 'patching barely mattered');
  }],

  ['enough funding hires an incident response firm, which speeds remediation', () => {
    const s = detectedGame();
    s.defense.nextDecision = Infinity;
    s.defense.funded = DATA.balance.defense.irFirm.funding;
    step(s, world);
    assert(s.defense.irFirmAt !== null, 'no IR firm');
    assert(s.log.some((e) => e.type === 'irFirm'), 'not logged');
    assertEq(s.dfx.remediation, DATA.balance.defense.irFirm.remediation);
  }],

  ['a game with defenders still replays identically from its seed and survives JSON', () => {
    const play = () => {
      const s = detectedGame({ seed: 9 });
      advance(s, world, 25 * 24);
      return s;
    };
    const a = play();
    const b = play();
    assertEq(JSON.stringify(a.defense), JSON.stringify(b.defense));
    const copy = JSON.parse(JSON.stringify(a));
    advance(a, world, 10 * 24);
    advance(copy, world, 10 * 24);
    assertEq(JSON.stringify(copy.sites), JSON.stringify(a.sites));
    assertEq(JSON.stringify(copy.defense), JSON.stringify(a.defense));
  }],

  ['startDefense gives SecOps its opening budget', () => {
    const s = createState(world, { seed: 1 });
    startInfection(s, world, 'us-ny');
    s.detectedAt = s.tick;
    startDefense(s, world);
    assertEq(s.defense.budget, DATA.balance.defense.startBudget);
    assert(s.defense.nextDecision > s.tick, 'first decision should come later');
  }],

  // ── News ──────────────────────────────────────────────────────────────────
  ['event headlines match their conditions and fill placeholders', () => {
    const s = detectedGame();
    const seen = new Set();
    const [h] = eventHeadlines({ type: 'siteReached', site: 'us-ak' }, s, DATA, seen, () => 0);
    assert(h && h.text.includes('Alaska'), 'expected the Alaska headline, got ' + JSON.stringify(h));
    const [again] = eventHeadlines({ type: 'siteReached', site: 'us-ak' }, s, DATA, seen, () => 0);
    assert(!again || again.id !== h.id, '`once` headline repeated');
    const [r] = eventHeadlines({ type: 'response', id: 'isolate-site', site: 'us-tx' }, s, DATA, seen);
    assert(r.kind === 'defense' && r.text.startsWith('Texas'), 'response headline: ' + r?.text);
    const [f] = eventHeadlines({ type: 'siteFallen', site: 'us-wy' }, s, DATA, seen);
    assert(f.text.includes('Wyoming') && f.text.includes(s.strainName), f.text);
    for (const x of [h, r, f]) assert(!/[{}]/.test(x.text), 'unfilled placeholder: ' + x.text);
  }],

  ['ambient headlines follow the game: quiet ones before detection, alarmed ones after', () => {
    const before = createState(world, { seed: 1 });
    startInfection(before, world, 'us-ny');
    const after = detectedGame();
    const pre = DATA.headlines.filter((h) => !h.when?.event && headlineMatches(h, null, before, DATA));
    const post = DATA.headlines.filter((h) => !h.when?.event && headlineMatches(h, null, after, DATA));
    assert(pre.length >= 3 && post.length >= 3, `too few ambient headlines: ${pre.length} / ${post.length}`);
    assert(pre.every((h) => h.when?.detected !== true), 'a post-detection headline showed before detection');
    assert(post.every((h) => h.when?.detected !== false), 'a pre-detection headline showed after detection');
    const h = ambientHeadline(after, DATA, new Set(), post.slice(1).map((x) => x.id), () => 0);
    assertEq(h.id, post[0].id);
  }],
];

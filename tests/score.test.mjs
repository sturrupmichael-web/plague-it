// Scoring, the end-screen timeline data, and the sound recipes.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, advance, endNow, detectNow } from '../src/sim/sim.js';
import { scoreGame, gameSummary } from '../src/score.js';
import { timelineSeries, timelineMarkers } from '../src/ui/timeline.js';
import { SOUNDS } from '../src/audio.js';

const DAY = 24;
const worlds = new Map();
const worldFor = (id) => (worlds.has(id) ? worlds.get(id) : worlds.set(id, createWorld(DATA, id)).get(id));

/** A game that ends `status` on `day`, optionally detected on `detectDay`. */
function finished({ status = 'won', day = 60, detectDay = null, difficultyId = 'normal', scenarioId = 'standard', remediation = 0 } = {}) {
  const w = worldFor(scenarioId);
  const s = createState(w, { seed: 3, difficultyId });
  startInfection(s, w, 'us-ny');
  s.suspicion = -1e9;
  if (detectDay !== null) {
    advance(s, w, detectDay * DAY);
    detectNow(s, w);
    s.suspicion = -1e9;
  }
  // Freeze the world while the clock runs (no detection, no spread to end it early).
  while (s.tick < day * DAY) s.tick++;
  s.remediation = remediation;
  endNow(s, w, status);
  return { s, w };
}

export const tests = [
  ['a win scores more the faster and quieter it was', () => {
    const fast = scoreGame(finished({ day: 40 }).s, worldFor('standard'));
    const slow = scoreGame(finished({ day: 100 }).s, worldFor('standard'));
    const loud = scoreGame(finished({ day: 40, detectDay: 5 }).s, worldFor('standard'));
    assert(fast.total > slow.total, `fast ${fast.total} ≤ slow ${slow.total}`);
    assert(fast.total > loud.total, `quiet ${fast.total} ≤ loud ${loud.total}`);
    const cfg = DATA.balance.score;
    assertEq(fast.parts[0].value, cfg.win);
    assertEq(fast.parts[1].value, (cfg.parDays - 40) * cfg.perDayUnderPar);
    assertEq(fast.base, fast.parts.reduce((n, p) => n + p.value, 0));
  }],

  ['a loss scores less than any win', () => {
    const { s, w } = finished({ status: 'lost', day: 300, remediation: 100 });
    s.peakInfected = s.totals.devices; // even holding everything at once
    const loss = scoreGame(s, w);
    const win = scoreGame(finished({ day: 199, detectDay: 1, remediation: 99 }).s, worldFor('standard'));
    assert(loss.total < win.total, `loss ${loss.total} ≥ win ${win.total}`);
    assert(loss.total > 0, 'a loss scored nothing');
  }],

  ['harder difficulties and scenarios multiply the score', () => {
    const normal = scoreGame(finished().s, worldFor('standard'));
    const competent = scoreGame(finished({ difficultyId: 'competent' }).s, worldFor('standard'));
    const zero = scoreGame(finished({ scenarioId: 'zero-trust' }).s, worldFor('zero-trust'));
    assertEq(competent.mult, 1.5);
    assert(competent.total > normal.total * 1.4, 'competent not worth more');
    assert(zero.total > normal.total * 1.5, 'zero trust not worth more');
  }],

  ['the game summary has what best scores and stats keep', () => {
    const { s, w } = finished({ day: 30 });
    const g = gameSummary(s, w, 1234, 42);
    assertEq(g, { score: 1234, won: true, outcome: 'compromised', strain: 'worm', name: 'Worm', difficulty: 'normal', scenario: 'standard', days: 31, peak: s.peakInfected, evolutions: 0, at: 42 });
  }],

  ['the timeline turns history into shares and marks key moments', () => {
    const w = worldFor('standard');
    const s = createState(w, { seed: 9 });
    startInfection(s, w, 'us-ny');
    s.suspicion = -1e9;
    advance(s, w, 30 * DAY);
    detectNow(s, w);
    advance(s, w, 5 * DAY);
    const series = timelineSeries(s.history);
    assertEq(series.infected.length, s.history.length);
    for (const k of ['infected', 'remediated', 'encrypted', 'remediation']) {
      for (const [day, v] of series[k]) assert(day >= 0 && v >= 0 && v <= 1, `${k} out of range: ${day}, ${v}`);
    }
    assert(series.infected.at(-1)[1] > 0, 'nothing infected on the graph');
    const marks = timelineMarkers(s.log);
    assertEq(marks.map((m) => m.label), ['Detected']);
    assertEq(marks[0].day, 30);
  }],

  ['every sound recipe is well formed', () => {
    const waves = ['sine', 'square', 'sawtooth', 'triangle'];
    for (const [name, snd] of Object.entries(SOUNDS)) {
      assert(snd.gap >= 0 && snd.notes.length > 0, `${name}: no notes`);
      for (const n of snd.notes) {
        assert(n.f > 0 && (n.to === undefined || n.to > 0), `${name}: bad frequency`);
        assert(n.d > 0 && n.d <= 2 && (n.t ?? 0) >= 0, `${name}: bad timing`);
        assert(waves.includes(n.type ?? 'sine'), `${name}: bad wave`);
        assert((n.v ?? 0.2) > 0 && (n.v ?? 0.2) <= 0.5, `${name}: too loud`);
      }
    }
    for (const needed of ['click', 'pop', 'reached', 'evolve', 'detected', 'response', 'won', 'lost']) assert(SOUNDS[needed], `no ${needed} sound`);
  }],
];

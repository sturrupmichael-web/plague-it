// Saves: the plagueIT: prefix, cleaning of bad data, and blocked storage.

import { assert, assertEq } from './harness.mjs';
import { createStorage, PREFIX } from '../src/storage.js';
import {
  loadSettings, saveSettings, loadProfile, saveProfile, cleanName,
  DEFAULT_SETTINGS, DEFAULT_PROFILE, MAX_NAME, MAX_SCORES, DEFAULT_STATS,
  addScore, loadScores, saveScores, cleanScores, addGameToStats, loadStats, saveStats, cleanStats, resetProgress,
} from '../src/save.js';

function fakeLocalStorage() {
  const m = new Map();
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const throwing = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

export const tests = [
  ['every key is prefixed with plagueIT:', () => {
    const ls = fakeLocalStorage();
    const st = createStorage(ls);
    saveSettings(st, { speed: 2, muted: true });
    saveProfile(st, { strainName: 'Patchy' });
    assertEq(PREFIX, 'plagueIT:');
    assertEq([...ls.map.keys()].sort(), ['plagueIT:profile', 'plagueIT:settings']);
  }],

  ['settings and profile round-trip', () => {
    const st = createStorage(fakeLocalStorage());
    saveSettings(st, { speed: 3, muted: true, volume: 0.25, reduceMotion: true, ticker: false });
    assertEq(loadSettings(st), { speed: 3, muted: true, volume: 0.25, reduceMotion: true, ticker: false });
    saveSettings(st, { speed: 2, volume: 7 });
    assertEq(loadSettings(st).volume, 1);
    const p = { strainName: 'Mr. Sniffles', lastStrain: 'worm', lastDifficulty: 'competent', lastScenario: 'merger', beaten: ['worm', 'trojan'] };
    saveProfile(st, p);
    assertEq(loadProfile(st), p);
  }],

  ['missing, corrupt or wrong-typed saves fall back to defaults', () => {
    const ls = fakeLocalStorage();
    const st = createStorage(ls);
    assertEq(loadSettings(st), DEFAULT_SETTINGS);
    assertEq(loadProfile(st), DEFAULT_PROFILE);
    ls.setItem('plagueIT:settings', '{not json');
    assertEq(loadSettings(st), DEFAULT_SETTINGS);
    ls.setItem('plagueIT:settings', JSON.stringify({ speed: 99, muted: 'yes' }));
    assertEq(loadSettings(st), DEFAULT_SETTINGS);
    ls.setItem('plagueIT:settings', JSON.stringify([1, 2, 3]));
    assertEq(loadSettings(st), DEFAULT_SETTINGS);
    ls.setItem('plagueIT:profile', JSON.stringify({ strainName: 42, lastStrain: null }));
    assertEq(loadProfile(st), DEFAULT_PROFILE);
  }],

  ['strain names are cleaned and capped', () => {
    assertEq(cleanName('  Big\n\tBad   Worm  '), 'Big Bad Worm');
    assertEq(cleanName('x'.repeat(100)).length, MAX_NAME);
    assertEq(cleanName(null), '');
  }],

  ['blocked storage never throws', () => {
    const st = createStorage(throwing);
    assertEq(st.save('settings', { speed: 2 }), false);
    assertEq(st.load('settings', 'fallback'), 'fallback');
    st.remove('settings');
    assertEq(loadSettings(st), DEFAULT_SETTINGS);
    const none = createStorage(null);
    assertEq(none.save('x', 1), false);
    assertEq(none.load('x', 5), 5);
  }],

  ['other games\' keys on the same domain are left alone', () => {
    const ls = fakeLocalStorage();
    ls.setItem('settings', '"someone else"');
    ls.setItem('helpdesk:settings', '"another game"');
    const st = createStorage(ls);
    saveSettings(st, { speed: 2, muted: false });
    assertEq(ls.getItem('settings'), '"someone else"');
    assertEq(ls.getItem('helpdesk:settings'), '"another game"');
    assert(ls.map.size === 3, 'unexpected keys');
  }],

  ['best scores keep the top ten, best first, and report the rank', () => {
    const st = createStorage(fakeLocalStorage());
    let scores = loadScores(st);
    assertEq(scores, []);
    const game = (score, at) => ({ score, won: true, outcome: 'compromised', strain: 'worm', name: 'W', difficulty: 'normal', scenario: 'standard', days: 50, peak: 1000, evolutions: 5, at });
    let rank;
    for (let i = 1; i <= 12; i++) ({ scores, rank } = addScore(scores, game(i * 100, i)));
    assertEq(scores.length, MAX_SCORES);
    assertEq(rank, 1);
    assertEq(scores.map((x) => x.score), [1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300]);
    assertEq(addScore(scores, game(50, 99)).rank, null);
    assertEq(addScore(scores, game(950, 100)).rank, 4);
    saveScores(st, scores);
    assertEq(loadScores(st), scores);
  }],

  ['bad best-score entries are dropped or repaired', () => {
    const list = cleanScores([null, 'x', { score: 'lots', strain: 'worm' }, { score: 5.6, strain: 'worm', days: -3, name: 'a\u0000b' }, { score: 9 }]);
    assertEq(list.length, 1);
    assertEq(list[0].score, 6);
    assertEq(list[0].days, 1);
    assertEq(list[0].name, 'ab');
    assertEq(cleanScores({ not: 'a list' }), []);
  }],

  ['lifetime stats add up games, wins and records', () => {
    const st = createStorage(fakeLocalStorage());
    let stats = loadStats(st);
    assertEq(stats, DEFAULT_STATS);
    const g = (won, days, score, strain = 'worm') => ({ won, outcome: won ? 'compromised' : 'remediated', strain, days, peak: days * 100, evolutions: 3, score });
    stats = addGameToStats(stats, g(true, 80, 1500));
    stats = addGameToStats(stats, g(false, 40, 300));
    stats = addGameToStats(stats, g(true, 60, 1200, 'trojan'));
    assertEq(stats.games, 3);
    assertEq(stats.wins, 2);
    assertEq(stats.fastestWin, 60);
    assertEq(stats.best, 1500);
    assertEq(stats.peak, 8000);
    assertEq(stats.days, 180);
    assertEq(stats.outcomes, { compromised: 2, remediated: 1 });
    assertEq(stats.strains, { worm: { played: 2, won: 1 }, trojan: { played: 1, won: 1 } });
    saveStats(st, stats);
    assertEq(loadStats(st), stats);
    assertEq(cleanStats({ games: -4, wins: 'many', fastestWin: 0, strains: { worm: 'x' } }), DEFAULT_STATS);
  }],

  ['resetting progress forgets unlocks, scores and stats but keeps settings', () => {
    const ls = fakeLocalStorage();
    const st = createStorage(ls);
    saveSettings(st, { speed: 2, muted: true });
    saveProfile(st, { beaten: ['worm'] });
    saveScores(st, [{ score: 1, strain: 'worm' }]);
    saveStats(st, { games: 1 });
    resetProgress(st);
    assertEq([...ls.map.keys()], ['plagueIT:settings']);
  }],
];

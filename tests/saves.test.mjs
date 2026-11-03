// Saves: the plagueIT: prefix, cleaning of bad data, and blocked storage.

import { assert, assertEq } from './harness.mjs';
import { createStorage, PREFIX } from '../src/storage.js';
import {
  loadSettings, saveSettings, loadProfile, saveProfile, cleanName,
  DEFAULT_SETTINGS, DEFAULT_PROFILE, MAX_NAME,
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
    saveSettings(st, { speed: 3, muted: true });
    assertEq(loadSettings(st), { speed: 3, muted: true });
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
];

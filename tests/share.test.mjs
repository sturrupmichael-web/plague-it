// Sharing a score: the message, the link, and the share sheet → clipboard → by-hand
// fallbacks (with a stand-in navigator, so this runs in Node).

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { createState } from '../src/sim/state.js';
import { startInfection, endNow } from '../src/sim/sim.js';
import { scoreGame } from '../src/score.js';
import { shareMessage, shareScore, shareUrl, GAME_URL } from '../src/share.js';

function finished({ status = 'won', day = 30, scenarioId = 'standard', difficultyId = 'normal', strainName = 'Office Flu' } = {}) {
  const w = createWorld(DATA, scenarioId);
  const s = createState(w, { seed: 3, difficultyId, strainName });
  startInfection(s, w, 'us-ny');
  s.suspicion = -1e9;
  while (s.tick < day * 24) s.tick++;
  s.peakInfected = 123456;
  endNow(s, w, status);
  return { s, w, score: scoreGame(s, w) };
}

const MSG = { title: 'Plague IT', text: 'hello' };
const URL_ = 'https://example.com/plague-it/';
const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });

export const tests = [
  ['the share message has the score, strain, outcome, days and setting', () => {
    const { s, w, score } = finished();
    const { title, text } = shareMessage(s, w, score);
    assertEq(title, 'Plague IT');
    assert(text.includes(score.total.toLocaleString('en-US') + ' points'), text);
    assert(text.includes('Office Flu strain took the whole network in 31 days'), text);
    assert(text.includes('(Normal)'), text);
    assert(text.includes('123,456 infected'), text);
    assert(text.includes('Can you beat it?'), text);
    assert(!text.includes('http'), 'the link goes separately, as the share URL');
  }],

  ['a loss and a non-standard scenario read right', () => {
    const { s, w, score } = finished({ status: 'lost', scenarioId: 'merger', day: 1 });
    const { text } = shareMessage(s, w, score);
    assert(text.includes('got remediated in 2 days'), text);
    assert(text.includes(`(Normal, ${w.scenario.name})`), text);
    assert(text.includes('Think you can do better?'), text);
  }],

  ['the shared link drops the query, and local copies point at the live game', () => {
    const loc = (href) => new URL(href);
    assertEq(shareUrl(loc('https://michaelsturrup.com/plague-it/?seed=5&debug=1')), 'https://michaelsturrup.com/plague-it/');
    assertEq(shareUrl(loc('https://example.org/games/plague/index.html')), 'https://example.org/games/plague/index.html');
    assertEq(shareUrl(loc('http://127.0.0.1:8000/dev.html')), GAME_URL);
    assertEq(shareUrl(loc('http://localhost:8000/')), GAME_URL);
    assertEq(shareUrl(loc('file:///home/me/plague-it/index.html')), GAME_URL);
    assertEq(shareUrl(undefined), GAME_URL);
  }],

  ['uses the share sheet when there is one', async () => {
    const calls = [];
    const nav = { share: async (d) => calls.push(d), clipboard: { writeText: async () => assert(false, 'copied too') } };
    assertEq(await shareScore(MSG, URL_, { nav, doc: null }), 'shared');
    assertEq(calls, [{ title: 'Plague IT', text: 'hello', url: URL_ }]);
  }],

  ['closing the share sheet is not an error and copies nothing', async () => {
    let copied = false;
    const nav = { share: async () => { throw abort(); }, clipboard: { writeText: async () => (copied = true) } };
    assertEq(await shareScore(MSG, URL_, { nav, doc: null }), 'cancelled');
    assertEq(copied, false);
  }],

  ['falls back to the clipboard (text and link) without a share sheet, or when sharing fails', async () => {
    let copied = null;
    const clipboard = { writeText: async (t) => (copied = t) };
    assertEq(await shareScore(MSG, URL_, { nav: { clipboard }, doc: null }), 'copied');
    assertEq(copied, `hello\n${URL_}`);
    copied = null;
    const refuses = { share: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); }, clipboard };
    assertEq(await shareScore(MSG, URL_, { nav: refuses, doc: null }), 'copied');
    assertEq(copied, `hello\n${URL_}`);
    const cannot = { share: async () => assert(false, 'shared anyway'), canShare: () => false, clipboard };
    copied = null;
    assertEq(await shareScore(MSG, URL_, { nav: cannot, doc: null }), 'copied');
    assertEq(copied, `hello\n${URL_}`);
  }],

  ['with no share sheet and no clipboard, says to copy by hand', async () => {
    const denied = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
    assertEq(await shareScore(MSG, URL_, { nav: denied, doc: null }), 'manual');
    assertEq(await shareScore(MSG, URL_, { nav: {}, doc: null }), 'manual');
  }],
];

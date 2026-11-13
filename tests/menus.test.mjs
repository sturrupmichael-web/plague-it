// Browser tests for Phase 5: the title screen, stats and settings pages, scoring on the
// end screen, sound, and the debug panel. Desktop viewport, every target.

import { assert, assertEq, until } from './harness.mjs';

export const browser = true;

const state = (page) => page.evaluate(() => window.plagueIT.game.state);
const saved = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('plagueIT:' + k)), key);

/** Ends the current game in a win through the normal rules (not the debug panel). */
async function winNow(page) {
  await page.evaluate(() => {
    const s = window.plagueIT.game.state;
    for (const x of s.sites) {
      x.infected = x.devices;
      x.healthy = 0;
      x.remediated = 0;
      x.reachedAt ??= 0;
    }
    window.plagueIT.advance(1);
  });
}

export const tests = [
  ['the title screen leads to play, stats and settings', async (t) => {
    const page = await t.open({ title: true });
    assert(await page.isVisible('.panel.title'), 'no title screen');
    assertEq(await state(page), null);
    await page.click('#open-stats');
    assert(await page.isVisible('#stats-page'), 'no stats page');
    assert((await page.textContent('#scores')).includes('No games yet'), 'scores not empty');
    await page.click('#back');
    await page.click('#open-settings');
    assert(await page.isVisible('#settings-page'), 'no settings page');
    await page.click('#back');
    await page.click('#play');
    assert(await page.isVisible('#start'), 'Play did not open the setup screen');
    await page.click('#back');
    assert(await page.isVisible('.panel.title'), 'Back did not return to the title');
  }],

  ['settings save, and apply at once', async (t) => {
    const page = await t.open({ title: true });
    await page.click('#open-settings');
    await page.click('#set-sound');
    assertEq((await saved(page, 'settings')).muted, true);
    assertEq(await page.textContent('#mute'), '🔇');
    await page.click('#set-motion');
    assert(await page.evaluate(() => document.body.classList.contains('reduce-motion')), 'reduce motion not applied');
    await page.click('#set-ticker');
    await page.click('[data-speed-default="2"]');
    await page.fill('#volume', '0.3');
    const s = await saved(page, 'settings');
    assertEq([s.reduceMotion, s.ticker, s.speed, s.volume], [true, false, 2, 0.3]);
    // They stick after a reload, and the new game starts at the saved speed.
    await page.reload();
    await page.waitForFunction(() => window.plagueIT && !document.getElementById('boot'));
    assertEq(await page.textContent('#mute'), '🔇');
    await page.click('#play');
    await page.click('#start');
    assertEq(await page.evaluate(() => window.plagueIT.game.speed), 2);
  }],

  ['resetting progress takes two taps and forgets unlocks and scores', async (t) => {
    const page = await t.open({
      title: true,
      storage: {
        'plagueIT:profile': JSON.stringify({ beaten: ['worm'] }),
        'plagueIT:scores': JSON.stringify([{ score: 500, strain: 'worm' }]),
      },
    });
    await page.click('#open-settings');
    await page.click('#reset-progress');
    assert(await page.evaluate(() => localStorage.getItem('plagueIT:scores') !== null), 'reset after one tap');
    await page.click('#reset-progress');
    assertEq(await page.evaluate(() => localStorage.getItem('plagueIT:scores')), null);
    await page.click('#back');
    await page.click('#play');
    assert(await page.isDisabled('[data-strain="trojan"]'), 'Trojan still unlocked after reset');
  }],

  ['the end screen scores the game, draws the timeline and saves a best score', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => window.plagueIT.advance(24 * 5));
    await winNow(page);
    await until(() => page.isVisible('.panel.end.won'), 5000, 'no victory screen');
    assertEq(await page.textContent('#score-rank'), 'New best!');
    assert(await page.isVisible('.score-parts'), 'no score breakdown');
    await until(async () => (await page.textContent('#score-value')) !== '0', 3000, 'score never counted up');
    // The graph has drawn something.
    await until(() => page.evaluate(() => {
      const c = document.getElementById('timeline');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      return false;
    }), 3000, 'timeline is blank');
    const scores = await saved(page, 'scores');
    assertEq(scores.length, 1);
    assert(scores[0].won && scores[0].score > 1000, 'win not saved: ' + JSON.stringify(scores[0]));
    assertEq((await saved(page, 'stats')).games, 1);
    // Menu → Stats shows it.
    await page.click('#to-title');
    await page.click('#open-stats');
    assertEq(await page.locator('#scores li').count(), 1);
    assert((await page.textContent('#stats-page')).includes('1 won of 1'), 'Worm progress missing');
  }],

  ['the end screen shares the score through the share sheet, or copies it', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => {
      window.shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => window.shared.push(d) });
    });
    await page.evaluate(() => window.plagueIT.advance(24 * 5));
    await winNow(page);
    await until(() => page.isVisible('#share'), 5000, 'no share button');
    await page.click('#share');
    await until(() => page.evaluate(() => window.shared.length === 1), 2000, 'share sheet not used');
    const d = await page.evaluate(() => window.shared[0]);
    const total = (await saved(page, 'scores'))[0].score.toLocaleString('en-US');
    assert(d.text.includes(`${total} points`), 'score missing: ' + d.text);
    assert(d.text.includes('took the whole network'), 'outcome missing: ' + d.text);
    assertEq(d.url, 'https://michaelsturrup.com/plague-it/', 'a local copy should share the live game');
    // No share sheet: the clipboard gets the text and the link.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (x) => (window.copied = x) } });
    });
    await page.click('#share');
    await until(async () => (await page.textContent('#share-status')).includes('Copied'), 2000, 'no copied message');
    assert((await page.evaluate(() => window.copied)).endsWith('\nhttps://michaelsturrup.com/plague-it/'), 'link not copied');
    // Neither works: the text shows, selected, to copy by hand.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
      document.execCommand = () => false;
    });
    await page.click('#share');
    await until(() => page.isVisible('#share-text'), 2000, 'no copy-by-hand box');
    assert((await page.inputValue('#share-text')).includes(`${total} points`), 'box is missing the score');
  }],

  ['no share button when the debug panel was used', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => (window.plagueIT.game.state.cheated = true));
    await winNow(page);
    await until(() => page.isVisible('.panel.end.won'), 5000, 'no victory screen');
    assertEq(await page.locator('#share').count(), 0);
  }],

  ['sound: M mutes and unmutes, and game events play sounds', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => window.plagueIT.advance(24 * 3));
    const played = () => page.evaluate(() => window.plagueIT.sound.played);
    assert((await played()).includes('reached'), 'patient zero made no sound');
    await page.keyboard.press('m');
    assertEq(await page.textContent('#mute'), '🔇');
    assertEq((await saved(page, 'settings')).muted, true);
    const before = (await played()).length;
    await page.evaluate(() => window.plagueIT.sound.play('pop'));
    assertEq((await played()).length, before);
    await page.keyboard.press('m');
    assertEq(await page.textContent('#mute'), '🔊');
    await page.click('#mute');
    assertEq(await page.textContent('#mute'), '🔇');
  }],

  ['the debug panel: live numbers, cheats, a SecOps response, seed restart', async (t) => {
    const page = await t.open({ start: true });
    await page.click('#pause');
    assert(!(await page.isVisible('#debug')), 'debug panel open by default');
    await page.keyboard.press('`');
    assert(await page.isVisible('#debug'), 'backquote did not open the panel');
    await until(async () => (await page.textContent('#debug-live')).includes('seed test'), 2000, 'no live numbers');
    const p0 = (await state(page)).points;
    await page.click('#debug-points-big');
    assertEq((await state(page)).points, p0 + 250);
    const t0 = (await state(page)).tick;
    await page.click('#debug-skip-day');
    assertEq((await state(page)).tick, t0 + 24);
    assert((await state(page)).cheated, 'game not marked as cheated');
    await page.click('#debug-detect');
    assert((await state(page)).detectedAt !== null, 'not detected');
    await page.selectOption('#debug-response', 'reimage');
    await page.selectOption('#debug-site', 'us-ny');
    await page.click('#debug-fire');
    const active = (await state(page)).defense.active;
    assert(active.some((a) => a.id === 'reimage' && a.site === 'us-ny'), 'response not fired');
    // A cheated win isn't saved.
    await page.click('#debug-win');
    await until(() => page.isVisible('.panel.end.won'), 5000, 'no victory screen');
    assert((await page.textContent('#score-rank')).includes('not saved'), 'cheated score not flagged');
    assertEq(await saved(page, 'scores'), null);
    // Restart with a seed reuses the last setup.
    await page.fill('#debug-seed', 'abc');
    await page.click('#debug-restart');
    const s = await state(page);
    assertEq([s.seed, s.status, s.strainId, s.cheated], ['abc', 'picking', 'worm', false]);
    assert(await page.isHidden('#overlay'), 'overlay still up');
    await page.click('#debug-close');
    assert(await page.isHidden('#debug'), 'panel did not close');
  }],

  ['?debug=1 shows a debug button for phones', async (t) => {
    const page = await t.open({ query: '?seed=test&debug=1' });
    await page.click('#debug-toggle');
    assert(await page.isVisible('#debug'), 'button did not open the panel');
    const plain = await t.open();
    assert(await plain.isHidden('#debug-toggle'), 'debug button shown without ?debug');
  }],
];

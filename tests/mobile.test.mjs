// Browser tests on a phone (390×844, 3× pixels, touch). Each runs against dev.html,
// the built index.html, and index.html opened from disk.

import { assert, assertEq, until } from './harness.mjs';

export const browser = true;

const state = (page) => page.evaluate(() => window.plagueIT.game.state);
const camera = (page) => page.evaluate(() => window.plagueIT.camera());

/** Two-finger gesture via the Chrome DevTools Protocol (Playwright has no pinch helper). */
async function pinch(page, cx, cy, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const points = (d) => [{ x: cx - d / 2, y: cy, id: 0 }, { x: cx + d / 2, y: cy, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + ((to - from) * i) / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function drag(page, x0, y0, x1, y1, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 0 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export const tests = [
  ['phone: start a game and pick patient zero by tapping', async (t) => {
    const page = await t.open({ phone: true });
    await page.tap('#start');
    await t.tapSite(page, 'us-ny', true);
    assertEq((await state(page)).status, 'running');
    const fits = await page.evaluate(() => {
      const bar = document.getElementById('bottombar').getBoundingClientRect();
      const ev = document.getElementById('evolve').getBoundingClientRect();
      const pts = document.getElementById('points').getBoundingClientRect();
      return innerWidth === 390 && bar.bottom <= 845 && ev.right <= 391 && pts.right <= 391 && document.documentElement.scrollWidth <= 390;
    });
    assert(fits, 'the bottom bar overflows the phone screen');
    const cam = await camera(page);
    assert(cam.zoom > cam.fit * 1.5, 'a tall phone screen should start zoomed in');
    const dpr = await page.evaluate(() => document.getElementById('map').width / document.getElementById('map').getBoundingClientRect().width);
    assert(dpr > 2.5, 'canvas is not high-DPI: ' + dpr);
  }],

  ['phone: tapping a bubble collects it', async (t) => {
    const page = await t.open({ phone: true, start: true });
    // Zoom in so the bubble is a comfortable target, as a player would.
    const b = (await state(page)).bubbles[0];
    assert(b, 'no bubble');
    const [bx, by] = await page.evaluate((id) => window.plagueIT.bubbleClient(id), b.id);
    await pinch(page, bx, by, 60, 160);
    const [x, y] = await page.evaluate((id) => window.plagueIT.bubbleClient(id), b.id);
    await page.touchscreen.tap(x, y);
    await until(async () => (await state(page)).points === b.value, 2000, 'tap did not collect the bubble');
  }],

  ['phone: pinch zooms and one-finger drag pans', async (t) => {
    const page = await t.open({ phone: true });
    await page.tap('#start'); // Close the setup screen so the map gets the touches.
    const c0 = await camera(page);
    await pinch(page, 195, 350, 80, 260);
    const c1 = await camera(page);
    assert(c1.zoom > c0.zoom * 2, `pinch did not zoom: ${c0.zoom} → ${c1.zoom}`);
    await drag(page, 250, 400, 120, 330);
    const c2 = await camera(page);
    assert(c2.cx > c1.cx, `drag did not pan: ${c1.cx} → ${c2.cx}`);
    await pinch(page, 195, 350, 300, 40);
    const c3 = await camera(page);
    assert(c3.zoom < c1.zoom, 'pinch did not zoom out');
    assertEq((await state(page)).status, 'picking', 'a gesture was taken as a tap');
  }],

  ['phone: tapping a site opens its panel', async (t) => {
    const page = await t.open({ phone: true, start: true });
    await page.evaluate(() => {
      const g = window.plagueIT.game;
      for (const b of [...g.state.bubbles]) g.collectBubble(b.id);
    });
    await t.tapSite(page, 'ca-on', true);
    assert(await page.isVisible('#site-panel'), 'panel did not open');
    const inside = await page.evaluate(() => {
      const r = document.getElementById('site-panel').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    });
    assert(inside, 'panel is off screen');
  }],

  ['phone: evolve by tapping', async (t) => {
    const page = await t.open({ phone: true, start: true });
    await page.evaluate(() => (window.plagueIT.game.state.points = 20));
    await page.tap('#evolve');
    await page.tap('[data-branch="payloads"]');
    await page.tap('[data-evo="popups"]');
    await page.tap('#evolve-buy');
    assert((await state(page)).evolved.includes('popups'), 'not bought');
    const fits = await page.evaluate(() => {
      const r = document.getElementById('evolve-buy') ?? document.getElementById('devolve');
      const b = r.getBoundingClientRect();
      return b.bottom <= innerHeight && b.right <= innerWidth;
    });
    assert(fits, 'evolution buttons are off screen');
    await page.tap('.evo-close');
    assert(await page.isHidden('#evolution'), 'did not close');
  }],
];

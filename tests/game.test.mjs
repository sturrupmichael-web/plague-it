// Browser tests on a desktop viewport (1366×768) with the mouse. Each runs against
// dev.html, the built index.html, and index.html opened from disk.

import { assert, assertEq, until } from './harness.mjs';

export const browser = true;

const state = (page) => page.evaluate(() => window.plagueIT.game.state);
const camera = (page) => page.evaluate(() => window.plagueIT.camera());

export const tests = [
  ['loads to the setup screen with no errors', async (t) => {
    const page = await t.open();
    assert(await page.isVisible('#start'), 'no Deploy button');
    assert(await page.isVisible('#map'), 'no map canvas');
    assertEq(await page.evaluate(() => window.plagueIT.game.state), null);
    const size = await page.evaluate(() => {
      const c = document.getElementById('map');
      return { w: c.width, cssW: c.getBoundingClientRect().width };
    });
    assert(size.w >= size.cssW, 'canvas is not at device resolution');
  }],

  ['starting a game: name the strain, deploy, pick patient zero', async (t) => {
    const page = await t.open();
    await page.fill('#strain-name', '  Patchy  McPatchface ');
    await page.click('#start');
    assert(await page.isVisible('#banner'), 'no patient zero prompt');
    assertEq((await state(page)).status, 'picking');
    await t.tapSite(page, 'factory');
    assertEq((await state(page)).status, 'picking', 'started in the air-gapped factory');
    await t.tapSite(page, 'office-london');
    const s = await state(page);
    assertEq(s.status, 'running');
    assertEq(s.patientZero, 'office-london');
    assertEq(s.strainName, 'Patchy McPatchface');
    assert(await page.isHidden('#banner'), 'prompt still showing');
    await until(async () => (await state(page)).tick > 5, 5000, 'the clock is not running');
    const saved = await page.evaluate(() => localStorage.getItem('plagueIT:profile'));
    assert(saved?.includes('Patchy McPatchface'), 'strain name not saved: ' + saved);
  }],

  ['infection spreads and the bottom bar shows it', async (t) => {
    const page = await t.open({ start: true });
    await page.click('#pause'); // So the numbers hold still while we compare them.
    await page.evaluate(() => window.plagueIT.advance(24 * 20 - window.plagueIT.game.state.tick));
    await page.waitForTimeout(100);
    const s = await state(page);
    assert(s.totals.infected > 100, 'only ' + s.totals.infected + ' infected');
    const shown = Number((await page.textContent('#tot-infected')).replace(/,/g, ''));
    assertEq(shown, s.totals.infected);
    assertEq(await page.textContent('#stat-spread .value'), String(s.stats.spread));
    assert((await page.textContent('#clock')).startsWith('Day 21'), 'clock: ' + (await page.textContent('#clock')));
  }],

  ['popping a bubble with the mouse adds points', async (t) => {
    const page = await t.open({ start: true });
    const b = (await state(page)).bubbles[0];
    assert(b, 'no bubble after patient zero');
    const [x, y] = await page.evaluate((id) => window.plagueIT.bubbleClient(id), b.id);
    await page.mouse.click(x, y);
    const s = await state(page);
    assertEq(s.points, b.value);
    assert(!s.bubbles.some((x) => x.id === b.id), 'bubble still there');
    await until(async () => (await page.textContent('#points-value')) === String(b.value), 2000, 'points not shown');
  }],

  ['clicking a site opens its panel', async (t) => {
    const page = await t.open({ start: true });
    // Pop the patient-zero bubble first so it can't cover the site.
    await page.evaluate(() => {
      const g = window.plagueIT.game;
      for (const b of [...g.state.bubbles]) g.collectBubble(b.id);
    });
    await t.tapSite(page, 'warehouse-port');
    assert(await page.isVisible('#site-panel'), 'panel not open');
    assert((await page.textContent('#site-panel h2')) === 'North Sea Port Warehouse', 'wrong site');
    await page.click('#site-panel .close');
    assert(await page.isHidden('#site-panel'), 'panel did not close');
  }],

  ['mouse wheel zooms and dragging pans', async (t) => {
    const page = await t.open();
    await page.click('#start'); // Close the setup screen so the map gets the mouse.
    const c0 = await camera(page);
    await page.mouse.move(683, 380);
    await page.mouse.wheel(0, -600);
    await until(async () => (await camera(page)).zoom > c0.zoom * 1.5, 2000, 'did not zoom in');
    const c1 = await camera(page);
    await page.mouse.move(700, 400);
    await page.mouse.down();
    await page.mouse.move(600, 350, { steps: 5 });
    await page.mouse.up();
    const c2 = await camera(page);
    assert(c2.cx > c1.cx && c2.cy > c1.cy, `did not pan: ${JSON.stringify([c1, c2])}`);
    await page.mouse.wheel(0, 5000);
    await until(async () => Math.abs((await camera(page)).zoom - c0.fit) < 1e-6, 2000, 'cannot zoom back out to fit');
  }],

  ['pause and speed buttons control the clock', async (t) => {
    const page = await t.open({ start: true });
    await page.click('#pause');
    const t0 = (await state(page)).tick;
    await page.waitForTimeout(300);
    assertEq((await state(page)).tick, t0, 'ticked while paused');
    await page.click('[data-speed="3"]');
    assertEq(await page.evaluate(() => window.plagueIT.game.speed), 3);
    await until(async () => (await state(page)).tick > t0, 2000, 'did not resume');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plagueIT:settings')));
    assertEq(saved.speed, 3);
    await page.keyboard.press('Space');
    assert(await page.evaluate(() => window.plagueIT.game.paused), 'space did not pause');
  }],

  ['the same seed plays out the same in the browser', async (t) => {
    const run = async () => {
      const page = await t.open({ start: true, query: '?seed=repeatable' });
      await page.click('#pause');
      return page.evaluate(() => {
        const g = window.plagueIT.game;
        const startTick = g.state.tick;
        g.advance(24 * 30 - startTick);
        return g.state.sites.map((s) => s.infected);
      });
    };
    assertEq(await run(), await run());
  }],

  ['still works when storage is blocked', async (t) => {
    const page = await t.open({ query: '?seed=1' });
    // Break localStorage after load, as some private modes do.
    await page.evaluate(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await page.click('#start');
    await t.tapSite(page, 'hq');
    await page.click('[data-speed="2"]');
    assertEq((await state(page)).status, 'running');
  }],

  ['evolving a trait from the evolution screen', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => (window.plagueIT.game.state.points = 30));
    await page.click('#evolve');
    assert(await page.isVisible('#evolution'), 'evolution screen did not open');
    assert(await page.evaluate(() => window.plagueIT.game.paused), 'game not paused while evolving');
    // A locked node can't be bought.
    await page.click('[data-evo="shared-drives"]');
    assert(await page.isDisabled('#evolve-buy'), 'locked evolution was buyable');
    await page.click('[data-evo="usb-drives"]');
    const spread = (await state(page)).stats.spread;
    await page.click('#evolve-buy');
    const s = await state(page);
    assert(s.evolved.includes('usb-drives'), 'not bought');
    assertEq(s.points, 25);
    assertEq(s.stats.spread, spread + 1);
    assert(await page.locator('[data-evo="usb-drives"].owned').count(), 'node not shown as owned');
    // Other tabs.
    await page.click('[data-branch="abilities"]');
    await page.click('[data-evo="av-evasion"]');
    await page.click('#evolve-buy');
    assert((await state(page)).evolved.includes('av-evasion'), 'ability not bought');
    // Devolve for a refund.
    const before = (await state(page)).points;
    await page.click('#devolve');
    const after = await state(page);
    assert(!after.evolved.includes('av-evasion') && after.points > before, 'devolve did not refund');
    await page.keyboard.press('Escape');
    assert(await page.isHidden('#evolution'), 'did not close');
    assert(!(await page.evaluate(() => window.plagueIT.game.paused)), 'still paused after closing');
  }],

  ['detection shows the Remediation bar', async (t) => {
    const page = await t.open({ start: true });
    assert(await page.isHidden('#remediation'), 'bar visible before detection');
    await page.evaluate(() => {
      const g = window.plagueIT.game;
      g.state.suspicion = 1e9;
      g.advance(24 * 3);
    });
    await until(() => page.isVisible('#remediation'), 2000, 'bar never appeared');
    assert(Number((await page.textContent('#remediation .value')).replace('%', '')) >= 0, 'no percentage');
  }],

  ['reaching the end screen and playing again', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => {
      const s = window.plagueIT.game.state;
      s.detectedAt = 0;
      s.remediation = 99.999;
    });
    await until(() => page.isVisible('.panel.end'), 5000, 'no end screen');
    assert((await page.textContent('.panel.end h1')) === 'Remediated', 'wrong outcome');
    await page.click('#play-again');
    assert(await page.isVisible('#start'), 'not back at setup');
    await page.click('#start');
    await t.tapSite(page, 'office-asia');
    assertEq((await state(page)).status, 'running');
    assertEq((await state(page)).remediation, 0);
  }],

  ['winning shows the victory screen', async (t) => {
    const page = await t.open({ start: true });
    await page.evaluate(() => {
      const s = window.plagueIT.game.state;
      for (const x of s.sites) {
        x.infected = x.devices - 1;
        x.healthy = 1;
        x.remediated = 0;
      }
      s.evolved.push('air-gap-hop');
      s.sites.forEach((x) => (x.reachedAt ??= 0));
      window.plagueIT.game.speed = 3;
    });
    await page.evaluate(() => window.plagueIT.game.advance(24 * 10));
    await until(() => page.isVisible('.panel.end.won'), 5000, 'no victory screen');
  }],
];

// Shared test helpers: assertions, a tiny static file server for the repo, and
// Playwright pages with the game loaded.
//
// Browser tests run once per TARGET:
//   dev    dev.html over http (the source modules)
//   built  index.html over http (the published single file)
//   file   index.html opened straight from disk (file://)
// Every page a test opens is watched: any console error or uncaught exception fails
// the test, even if the test itself passed.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DESKTOP = { width: 1366, height: 768 };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export class AssertionError extends Error {}
export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new AssertionError(msg);
}
export function assertEq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

/** Serves the repository folder on a free port. Returns { url, close() }. */
export async function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

let browser = null;
export async function getBrowser() {
  if (!browser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  }
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

export function targets(serverUrl) {
  return [
    { name: 'dev', url: serverUrl + 'dev.html' },
    { name: 'built', url: serverUrl + 'index.html' },
    { name: 'file', url: pathToFileURL(join(ROOT, 'index.html')).href },
  ];
}

/**
 * The object a browser test receives. t.open() opens the game in a fresh browser
 * context and resolves once it's running.
 *   t.open({ phone: true })        phone viewport with touch
 *   t.open({ phone: { width: 844, height: 390 } })   a phone of another size (or on its side)
 *   t.open({ query: '?seed=5' })   extra URL query (default '?seed=test')
 *   t.open({ start: true, site })  also click Deploy and pick patient zero (default site 'us-ny')
 *   t.open({ title: true })        stay on the title screen (by default it clicks Play)
 */
export function browserContext(target) {
  const opened = [];
  const t = {
    target: target.name,
    async open({ phone = false, query = '?seed=test', start = false, site = 'us-ny', storage = null, title = false } = {}) {
      const opts = phone ? { ...PHONE, ...(typeof phone === 'object' ? { viewport: phone } : {}) } : { viewport: DESKTOP };
      const ctx = await (await getBrowser()).newContext(opts);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      });
      if (storage) {
        await page.addInitScript((s) => {
          for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
        }, storage);
      }
      opened.push({ ctx, errors });
      await page.goto(target.url + query);
      await page.waitForFunction(() => window.plagueIT && !document.getElementById('boot'), null, { timeout: 15000 });
      if (!title) await page.click('#play');
      if (start) {
        await page.click('#start');
        await t.tapSite(page, site, phone);
      }
      page.errors = errors;
      return page;
    },
    /** Clicks (mouse) or taps (touch) a site on the map. */
    async tapSite(page, id, touch = false) {
      // Let layout and the camera settle first (the HUD can change size as a game starts).
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const [x, y] = await page.evaluate((s) => window.plagueIT.siteClient(s), id);
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    },
  };
  t.finish = async () => {
    const errors = opened.flatMap((o) => o.errors);
    await Promise.all(opened.map((o) => o.ctx.close()));
    if (errors.length) throw new AssertionError('errors on the page:\n' + errors.join('\n'));
  };
  return t;
}

/** Repeats `fn` until it returns truthy or `ms` pass. */
export async function until(fn, ms = 5000, msg = 'timed out') {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new AssertionError(msg);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Runs every test: `npm test`.
//   npm test              everything (builds index.html first, for the browser tests)
//   npm test -- node      only the Node tests (no browser needed)
//   npm test -- <word>    only tests whose file or name contains <word>, e.g. `npm test -- sim`
//
// Every tests/*.test.mjs file exports `tests`: an array of [name, async fn]. A file that
// also exports `browser = true` runs in Chromium, once per target (dev.html, built
// index.html, index.html from disk); its fn receives a helper `t` (see harness.mjs).

import { readdirSync } from 'node:fs';
import { ROOT, serve, closeBrowser, targets, browserContext } from './harness.mjs';
import { build } from '../build.mjs';

const args = process.argv.slice(2);
const nodeOnly = args.includes('node');
const filters = args.filter((a) => a !== 'node');
const matches = (file, name) => !filters.length || filters.some((f) => file.includes(f) || name.includes(f));

const files = readdirSync(ROOT + 'tests').filter((f) => f.endsWith('.test.mjs')).sort();
const suites = [];
for (const f of files) {
  const mod = await import(`./${f}`);
  if (!Array.isArray(mod.tests)) throw new Error(`tests/${f} must export \`tests\`, an array of [name, fn]`);
  suites.push({ file: f, browser: mod.browser === true, tests: mod.tests.filter(([name]) => matches(f, name)) });
}

let passed = 0;
let failed = 0;
let skipped = 0;
async function runOne(label, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ok    ${label} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${label}\n        ${String(e.stack ?? e).split('\n').slice(0, 6).join('\n        ')}`);
  }
}

console.log('Node tests');
for (const s of suites.filter((s) => !s.browser)) {
  for (const [name, fn] of s.tests) await runOne(`${s.file.replace('.test.mjs', '')}: ${name}`, fn);
}

const browserSuites = suites.filter((s) => s.browser && s.tests.length);
if (nodeOnly) {
  skipped = browserSuites.reduce((n, s) => n + s.tests.length, 0);
} else if (browserSuites.length) {
  await build({ quiet: true });
  const server = await serve();
  try {
    for (const target of targets(server.url)) {
      console.log(`Browser tests: ${target.name} (${target.url.replace(/\?.*/, '')})`);
      for (const s of browserSuites) {
        for (const [name, fn] of s.tests) {
          await runOne(`${target.name} ${s.file.replace('.test.mjs', '')}: ${name}`, async () => {
            const t = browserContext(target);
            try {
              await fn(t);
            } catch (e) {
              await t.finish().catch(() => {});
              throw e;
            }
            await t.finish();
          });
        }
      }
    }
  } finally {
    await closeBrowser();
    server.close();
  }
}

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} browser tests skipped` : ''}`);
process.exit(failed ? 1 : 0);

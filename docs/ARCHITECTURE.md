# Plague IT: architecture and data schemas

This is the map of the code as of Phase 2. The full README (how to add content, the
balance knobs, deploying) comes in Phase 5.

## Running it

```sh
npm install
npm run serve          # python3 -m http.server 8000, then open http://localhost:8000/dev.html
npm run lint
npm run build          # writes index.html (not committed)
npm test               # Node tests, then browser tests against dev.html, index.html, and index.html from disk
npm test -- node       # Node tests only (no browser)
npm test -- sim        # only tests whose file or name contains "sim"
```

Add `?seed=anything` to the URL to replay the same game.

## Modules

```
data/                 all content and numbers (plain JS modules, bundled by the build)
  index.js            DATA: the one object the engine reads everything through
src/
  sim/                the simulation: pure functions over plain JSON state, no DOM
    rng.js            seeded RNG (mulberry32); its whole state is state.rng
    world.js          static lookups derived once from DATA (site index, susceptibility, links)
    state.js          createState(): a fresh game
    stats.js          Spread / Noise / Impact = strain base + owned evolutions
    sim.js            step() = one fixed tick; startInfection(), collectBubble(), evolve(), devolve()
    bot.js            autopilot that plays whole games headlessly (balance tests)
  game.js             fixed-timestep driver: real time × speed → whole ticks; pause, 1×/2×/3×
  render/             canvas only, reads state, never writes it
    geo.js            lon/lat → map units (equirectangular, 1000 units wide)
    camera.js         pan/zoom limits, screen ↔ map conversion
    map.js            draws land dots, links, sites, bubbles and effects; hit-tests bubbles and sites
  input/pointer.js    Pointer Events: drag to pan, pinch and wheel to zoom, tap
  ui/                 DOM: top and bottom bars, setup, site panel, evolution screen, end screen
  storage.js          localStorage wrapper ("plagueIT:" prefix, try/catch everywhere)
  save.js             what's saved (settings, profile) and how loaded data is cleaned
  validate.js         checks data/ for mistakes; run by the data tests
  main.js             wires everything together and runs the frame loop
```

Rules that keep it testable:

- **The simulation never touches the DOM, canvas, clock or Math.random.** It runs the same
  in the browser, in Node tests and in headless balance runs.
- **The state is plain JSON.** `JSON.parse(JSON.stringify(state))` resumes identically,
  which is how saves will work and what the determinism tests check.
- **One tick = one in-game hour.** At 1× there are `BALANCE.ticksPerSecond` ticks per
  real second. Rendering runs at screen rate; frame rate never changes the outcome.
- **Player actions are functions applied between ticks** (startInfection, collectBubble,
  and in Phase 2 evolve/devolve), so a game is reproducible from its seed plus its actions.
- **Events** (siteReached, bubbleSpawned, bubbleCollected) are queued on the state and
  drained by the UI each frame for effects and, later, sound and the news ticker.

## How spread works

Each site holds counts: `healthy`, `infected`, `remediated` (and `devices`, the total).

- **Inside a site** (logistic growth), per tick:
  `new = within × Spread × strain.withinSite × susceptibility × infected × healthy / devices`,
  rounded randomly so the average is right.
- **susceptibility** = `(1 − patch × 0.55) × (1 − savvy × 0.45) × (1 − maturity × 0.35)`
  (weights in `BALANCE.spread.traitWeights`).
- **Between sites**, per open link and direction, per tick, the chance to seed one machine is
  `between × Spread × strain.betweenSites × linkWeight × (infected / devices at the source)
   × target connectivity × target susceptibility`.
- A link with `requires` only carries infection once that evolution is owned. Air-gapped
  sites only connect over `airgap` links, which need Air-Gap Hopping.
- **Bubbles**: one always appears when a site is first reached; otherwise each tick a site
  with new infections has a `newInfections × perInfectionChance` chance to drop one. They
  expire after `ttl` ticks, with at most `maxOnMap` at once.

## Evolution, detection and remediation (Phase 2)

- **Buying**: price = `cost × (1 + evolve.costGrowth × owned in that branch) × strain.evolveCost`.
  All prerequisites must be owned. **Devolving** refunds `evolve.refundRate` of what you paid
  and is blocked while an owned evolution needs it. The game pauses while the evolution
  screen is open.
- **Effects** add up across owned evolutions: the three stats, `siteTypeSpread`,
  `remediationResist`, `cleanResist`, `reinfect`, `pointsPerDay`, `jump` (caps in `balance.caps`).
  Spread has diminishing returns (`Spread ^ spread.power`).
- **Detection**: each tick, hidden suspicion grows by
  `detection.rate × (Noise + Impact × impactWeight) ^ power × √(share infected) × difficulty.detection`.
  At `detection.threshold` SecOps notices, the Remediation bar appears, and you get a bubble.
- **Remediation**: the bar fills by `remediation.rate × (1 + Impact × impactBoost) × difficulty
  × strain × (1 − remediationResist)` per tick. Machines are cleaned in proportion to the
  site's working machines, so **a fully compromised site can't be cleaned**. Cleaned machines
  can be retaken at `reinfectFactor` of a healthy machine's rate.
- **Win**: every endpoint infected (including the air-gapped factory, so you need Air-Gap
  Hopping). **Lose**: the bar reaches 100%, or the last infected machine is cleaned.
- **Balance tests** play 8 seeds per strain and difficulty with the autopilot: the `smart`
  plan must win at least once, and the `idle` and `reckless` plans must lose. Current
  results for the Worm: smart wins about 7/8 on Understaffed and Normal, about 4/8 on
  Competent SecOps.

## Data schemas

Every file in `data/` starts with a commented schema. In short:

| File | What it holds | Key fields |
|---|---|---|
| `balance.js` | global numbers | `ticksPerSecond`, `statMax`, `spread.{power, within, between, traitWeights}`, `linkKinds.{kind}.weight`, `bubbles.*`, `evolve.{costGrowth, refundRate}`, `caps`, `detection.*`, `remediation.*` |
| `strains.js` | playable strains | `id, name, tagline, description, unlockedBy, base.{spread, noise, impact}, modifiers.{withinSite, betweenSites, bubbleChance, bubbleValue, evolveCost, remediation}` |
| `sites.js` | company locations | `id, name, type, lon, lat, devices, traits.{patch, savvy, maturity, connectivity}` (0–1), `airGapped`, `blurb` |
| `links.js` | network links | `from, to, kind (lan/wan/vpn/cloud/email/airgap), requires (evolution id or null)` |
| `evolutions.js` | the three trees (24 nodes) | `id, branch, name, description, cost, prereqs[], effects.{spread, noise, impact, siteTypeSpread, remediationResist, cleanResist, reinfect, pointsPerDay, jump}, pos.{col, row}` |
| `difficulties.js` | difficulty settings | `detection, remediation, aiInterval, scoreMult` multipliers |
| `responses.js` | defender responses (Phase 3) | `minAlert, cost, weight, triggers, effects.{closesLinks, siteTraits, remediation}, scope` |
| `scenarios.js` | special scenarios (Phase 4) | `sitesScale, balance overrides, scripted events` |
| `headlines.js` | news ticker (Phase 3) | `text, when.{event, site, minStat}, once` |
| `world.js` | map outlines | `[lon, lat]` polygons, `dotSpacing`, visible latitudes |

`npm test` runs `src/validate.js` over all of it: unique ids, values in range, every
reference resolving (link sites, link `requires`, prerequisites, `unlockedBy`), no
prerequisite cycles, every connected site reachable without evolutions, and air-gapped
sites reachable only over airgap links.

## Build and deploy

`build.mjs` bundles `src/main.js` (with all of `data/`) with esbuild (ES2022, ESM,
minified), inlines it and the CSS into `dev.html`'s markup, adds a "generated, do not
edit" comment and a CSP with the sha256 of each inline script, and writes `index.html`.
It fails if `dev.html` still references any local file. The Tests workflow runs lint,
build and tests on every push and pull request; Deploy publishes only `index.html` to
GitHub Pages after Tests succeeds on `main`.

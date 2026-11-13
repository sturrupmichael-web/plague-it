# Plague IT

A threat-map strategy game where **you play the malware**. Start on one laptop somewhere
in the USA or Canada, spread across a company's network, evolve, and take every endpoint
before SecOps cleans you out.

Plain JavaScript, a canvas and esbuild. No runtime dependencies: the published game is a
single self-contained `index.html` that also works straight from disk. Everything is
fictional: the company, the strains, the defenses and the headlines are made up, and
the "malware" is flavor names and stat changes only.

- **7 strains** (Worm, Trojan, Macro Virus, Botnet, Rootkit, Polymorphic, Ransomware), each
  unlocked by winning with the one before.
- **6 scenarios** (Standard, Holiday Skeleton Crew, Intern Summer, The Merger, Zero Trust
  Rollout, Patch Tuesday) and **3 difficulties**.
- A SecOps AI that funds itself, notices what you rely on and fights back with 8 responses,
  each with an evolution that counters it.
- 82 news ticker headlines, a score with best-ten table and lifetime stats, synthesized
  sound effects, and a debug panel for playtesting.

## Play it

- **Online:** <https://michaelsturrup.com/plague-it/> (once deployed, see below).
- **Locally:**

  ```sh
  npm install
  npm run serve        # then open http://localhost:8000/dev.html
  ```

  `dev.html` loads the source modules directly, so a browser refresh shows any edit. Or run
  `npm run build` and open `index.html` (double-clicking it works too).

- **On your phone:** with `npm run serve` running, find your computer's local IP
  (`ipconfig getifaddr en0` on a Mac, `hostname -I` on Linux) and open
  `http://<that-ip>:8000/dev.html` on a phone on the same Wi-Fi. Or use the deployed URL.

### Controls

| | Mouse / keyboard | Touch |
|---|---|---|
| Pick patient zero, open a region | click | tap |
| Collect a bubble (Exploit Points) | click it | tap it |
| Pan / zoom | drag / wheel, `+` `-` | drag / pinch |
| Pause / speed | `Space`, `1` `2` `3` | the buttons at the top |
| Evolve | `E` | the Evolve button |
| Mute | `M` | 🔊 |
| Debug panel | `` ` `` (backquote) | open with `?debug=1`, then 🐞 |

### URL options

| Option | What it does |
|---|---|
| `?seed=anything` | Every game uses this seed, so it plays out the same way given the same moves |
| `?unlock=all` | Every strain is playable this visit (not saved) |
| `?debug=1` | Shows the 🐞 button for the debug panel (for phones, which have no backquote key) |

## Build and test

```sh
npm run lint           # ESLint
npm run build          # writes index.html (git-ignored; CI builds its own)
npm test               # Node tests, then browser tests against dev.html, index.html over http, and index.html from disk
npm test -- node       # Node tests only (no browser)
npm test -- menus      # only test files or names containing "menus"
```

The browser tests use Playwright with Chromium (pinned in `package.json`). If Playwright
can't find a browser, run `npx playwright install chromium`, or point `CHROMIUM` at a
Chromium binary. Every browser test also fails on any console error or uncaught
exception.

The balance tests (`tests/balance.test.mjs`) play whole games with an autopilot for every
strain, difficulty and scenario, and check that a good plan can win, a bad one loses, and
a game takes a sensible time. Run them after any balance change.

## The debug panel

Press `` ` `` (or open the page with `?debug=1` and tap 🐞). It shows live numbers the HUD
hides (FPS, seed, tick, suspicion, the SecOps budget, funding and alert, active responses)
and has:

- **+25 / +250 ⬢** Exploit Points.
- **Skip 1 day / 10 days**: runs the simulation forward instantly.
- **Detect now**, **Win**, **Lose**.
- **Fire**: puts any SecOps response in force now, at the site you pick (it defaults to the
  most infected one).
- **Restart** with a seed: the same strain, scenario and difficulty, new seed.
- **Unlock every strain** for this visit.

Any cheat marks the game, and a marked game's score isn't saved (the end screen says so).

## How to add content

All content lives in `data/`, one file per kind, each starting with a commented schema.
`npm test` validates all of it (unique ids, references that resolve, values in range) and
names the file and field of any mistake. Keep it fictional and game-level: original names,
flavor text and stat changes, no real companies, products, malware or techniques.

- **A headline** (`data/headlines.js`): add `{ id, text, when }`. `when` picks the moment:
  `event` (siteReached, detected, response, mutated…), `site`, `tag`, `strain`, `scenario`,
  `detected`, `minShare`/`maxShare`, `minStat`, `minRemediation`. Without `event` it's
  ambient filler. Text can use `{site}`, `{strain}`, `{company}` and `{day}`.
- **An evolution** (`data/evolutions.js`): `{ id, branch, name, description, cost, prereqs,
  effects, pos }`. `pos` is its column and row in its branch's tree.
- **A SecOps response** (`data/responses.js`): what it costs, when the AI wants it
  (`minAlert`, `triggers`), what it does (`effects`), and the evolutions that counter it
  (`counteredBy`). Give it a `headline` for the ticker.
- **A strain** (`data/strains.js`): base stats, `modifiers`, optional `special` mechanics,
  and `unlockedBy`. Add a line for it to the balance tests' expectations if it needs one.
- **A scenario** (`data/scenarios.js`): site changes, partial `balance` overrides (deep-merged),
  and the optional rules `merger`, `defenseFromStart` and `patchDeadline`. `scoreMult` sets
  what it's worth.
- **A network link** (`data/links.js`): `{ from, to, kind, requires }`. Borders between
  neighboring regions are added automatically.
- **The map** is generated: `node tools/build-geo.mjs` rebuilds `data/geo.js` from Natural
  Earth (public domain). Region flavor (tags, blurbs) is in `data/sites.js`.
- **A sound** (`src/audio.js`): add a recipe of notes to `SOUNDS` and call `sound.play(name)`.

## Balance knobs

Start with these; every number is commented where it lives.

| Where | Knob | What it changes |
|---|---|---|
| `data/balance.js` | `ticksPerSecond` | Game speed at 1× (one tick is one in-game hour; 3 gives a 10 to 15 minute game) |
| | `spread.within`, `spread.between`, `spread.power` | How fast infection grows inside a region and jumps between them |
| | `spread.traitWeights` | How much patching, user savvy and IT maturity protect a region |
| | `bubbles.*`, `startingPoints`, `evolve.costGrowth` | The Exploit Point economy |
| | `detection.rate`, `detection.threshold` | How soon SecOps notices |
| | `remediation.rate`, `cleanRate`, `reinfectFactor` | How fast the Remediation bar fills and machines get cleaned and retaken |
| | `defense.*` | The SecOps AI: funding, how often it decides, alert growth, counters, the IR firm |
| | `caps` | Limits on stacked evolution effects |
| | `score.*` | Scoring: the win bonus, par days, stealth and speed bonuses, loss scoring |
| `data/difficulties.js` | `detection`, `remediation`, `aiInterval`, `funding`, `smarts`, `scoreMult` | Each difficulty as multipliers |
| `data/scenarios.js` | `balance`, `sites`, `scoreMult` | Each scenario's overrides |
| `data/strains.js` | `base`, `modifiers`, `special` | Each strain |
| `data/responses.js` | `cost`, `weight`, `minAlert`, `effects` | Each SecOps response |

Scoring (`src/score.js`): a win scores 1000, plus 10 per day under 120 days, 4 per day
undetected, and 4 per point the Remediation bar stayed under 100. A loss scores up to 600
for the most machines you held at once, plus 2 per day survived (up to 120). The total is
multiplied by the difficulty (0.75, 1, 1.5) and the scenario (0.8 to 1.6), so a loss
always scores less than a win on the same settings.

Sharing (`src/share.js`): the end screen's **Share score** button opens the phone's share
sheet (Web Share API). Without one it copies the message and link to the clipboard, and if
that's blocked it shows the text to copy by hand. The link is the page the game was played
on (without `?seed` or `?debug`), or the live game when played from a local copy. Games
where the debug panel was used can't be shared.

## What's saved

Everything is in `localStorage` under keys starting `plagueIT:` (so it can't clash with
other games on the same domain): `settings`, `profile` (strain name, last choices,
strains beaten), `scores` (best ten) and `stats` (lifetime totals). Saves are cleaned on
load, so a corrupted or hand-edited save falls back to defaults instead of breaking the
game, and the game still runs when storage is blocked. Settings has **Reset progress**.

## Deploy to michaelsturrup.com/plague-it/

The site michaelsturrup.com is the GitHub Pages user site
(`sturrupmichael-web.github.io`, which has the CNAME). Any other repository of the same
account that publishes to Pages is served under it by repository name, so this repo
appears at **michaelsturrup.com/plague-it/** with no DNS changes. **Don't add a CNAME
file here**: it would take the domain away from the main site.

1. In this repository on GitHub: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**. (One time.)
2. Merge to `main`. The **Tests** workflow runs lint, build and every test. When it passes
   on `main`, the **Deploy** workflow (`.github/workflows/deploy.yml`) builds that exact
   commit and publishes only `index.html` (plus `.nojekyll`) to Pages.
3. A minute or two later it's live at <https://michaelsturrup.com/plague-it/>. You can
   also run Deploy by hand from the Actions tab (**Run workflow**).

The page uses no absolute paths, so it works under `/plague-it/`, at any other path, and
from disk. Its Content Security Policy allows only its own inline script (by hash), and
nothing from other sites.

### The card on michaelsturrup.com

The home page's game cards come from `games.json` in `sturrupmichael-web.github.io`, with
a 1200×630 screenshot in `images/`. Plague IT's entry is:

```json
{
  "title": "Plague IT",
  "slug": "plague-it",
  "description": "You are the malware: start on one laptop, evolve, and take every endpoint across the USA and Canada before SecOps cleans you out.",
  "url": "https://michaelsturrup.com/plague-it/",
  "thumbnail": "images/plague-it.webp",
  "thumbnailAlt": "A dark threat map of the USA and Canada with most states and provinces glowing red, network links arcing between them and SecOps defenses listed in the corner",
  "tags": ["Strategy", "Threat map", "Phone + desktop"],
  "status": "new"
}
```

To retake the screenshot: build, open `index.html` at 1200×630, play into the middle of
a game, and save a WebP under about 150 KB.

## Project layout

```
data/        content and numbers (strains, evolutions, responses, scenarios, headlines, map)
src/sim/     the simulation: pure functions over plain JSON state, no DOM (runs in Node)
src/render/  the canvas map and camera
src/ui/      DOM screens: HUD, title, setup, evolution, site panel, ticker, end screen, debug
src/audio.js synthesized sound effects (Web Audio)
src/score.js scoring
src/share.js the end screen's Share score message and fallbacks
src/save.js  what's saved and how loaded saves are cleaned
tests/       Node and Playwright tests (tests/run.mjs runs them all)
tools/       the map generator
build.mjs    bundles everything into index.html
dev.html     the page for development (loads src/ directly)
```

`docs/ARCHITECTURE.md` has the details: how spread, detection, remediation and the SecOps
AI work, every data schema, and the rules that keep the simulation testable.

// Entry point: wires the game controller, the map renderer, input and the UI together
// and runs the frame loop. Module boundaries:
//   src/sim/      the simulation (pure, no DOM; runs in Node tests too)
//   src/game.js   fixed-timestep driver around the simulation
//   src/render/   canvas drawing and the camera
//   src/input/    mouse and touch
//   src/ui/       DOM panels and bars
//   src/storage.js, src/save.js   localStorage
//   data/         all content and balance numbers

import { DATA } from '../data/index.js';
import { Game } from './game.js';
import { MapRenderer } from './render/map.js';
import { attachPointer } from './input/pointer.js';
import { Hud } from './ui/hud.js';
import { SitePanel } from './ui/sitePanel.js';
import { showSetup } from './ui/setup.js';
import { EvolutionScreen } from './ui/evolution.js';
import { showEndScreen } from './ui/endScreen.js';
import { Ticker } from './ui/ticker.js';
import { applyResponse } from './sim/defense.js';
import { $ } from './ui/dom.js';
import { createStorage } from './storage.js';
import { loadSettings, saveSettings, loadProfile, saveProfile, cleanName } from './save.js';

const storage = createStorage();
const settings = loadSettings(storage);
const profile = loadProfile(storage);
const params = new URLSearchParams(location.search);

const game = new Game(DATA);
game.speed = settings.speed;
const canvas = $('#map');
const renderer = new MapRenderer(canvas, game.world);

const hud = new Hud(game, {
  onSpeed: (speed) => {
    game.speed = speed;
    game.paused = false;
    settings.speed = speed;
    saveSettings(storage, settings);
  },
  onPause: () => {
    game.paused = !game.paused;
  },
  onEncrypt: () => game.triggerEncryption(),
});
const sitePanel = new SitePanel(game, { onClose: () => (renderer.selectedSite = null) });
const evolution = new EvolutionScreen(game, { onChange: () => sitePanel.update(true) });
const ticker = new Ticker(game);
$('#evolve').addEventListener('click', () => evolution.open());

function newGame() {
  evolution.close();
  sitePanel.close();
  document.body.classList.remove('detected');
  const shown = playtestUnlocked ? { ...profile, beaten: DATA.strains.map((s) => s.id) } : profile;
  showSetup(DATA, shown, ({ strainId, difficultyId, scenarioId, strainName }) => {
    Object.assign(profile, { strainName: cleanName(strainName), lastStrain: strainId, lastDifficulty: difficultyId, lastScenario: scenarioId });
    saveProfile(storage, profile);
    const seed = params.get('seed') ?? String(Math.floor(Math.random() * 1e9));
    game.newGame({ strainId, difficultyId, scenarioId, seed, strainName: profile.strainName });
    renderer.world = game.world;
    ticker.reset();
    document.body.classList.add('in-game');
    hud.showBanner('Choose patient zero: tap a site to drop the first infection.');
  }, {
    // Until the Phase 5 debug panel: lets a playtester try every strain (not saved).
    onUnlockAll: () => {
      playtestUnlocked = true;
      newGame();
    },
  });
}
let playtestUnlocked = params.get('unlock') === 'all';

/** Records a win (unlocking the next strain). Returns the strain it unlocked, if any. */
function recordWin(state) {
  if (profile.beaten.includes(state.strainId)) return null;
  profile.beaten.push(state.strainId);
  saveProfile(storage, profile);
  return DATA.strains.find((s) => s.unlockedBy === state.strainId) ?? null;
}

attachPointer(canvas, {
  onPan: (dx, dy) => renderer.camera.pan(dx, dy),
  onZoom: (f, x, y) => renderer.camera.zoomAt(f, x, y),
  onTap: (x, y) => {
    const s = game.state;
    if (s) {
      const b = renderer.bubbleAt(s, x, y);
      if (b) {
        const [bx, by] = renderer.bubbleWorld(b);
        const value = game.collectBubble(b.id);
        renderer.addEffect('pop', bx, by, { value });
        return;
      }
    }
    const site = renderer.siteAt(x, y);
    if (s?.status === 'picking') {
      if (!site) return;
      if (site.airGapped) return hud.toast('That site is air-gapped. Start somewhere connected.');
      if (s.sites[site.index].pending) return hud.toast(`${site.name} isn't part of the company until day ${game.world.merger.tick / 24}.`);
      renderer.selectedSite = null;
      game.startInfection(site.id);
      hud.showBanner('');
      hud.toast(`Patient zero: ${site.name}`);
      return;
    }
    if (site) {
      renderer.selectedSite = site.id;
      sitePanel.open(site.id);
    } else if (sitePanel.siteId) {
      sitePanel.close();
    }
  },
});

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (!$('#overlay').hidden) return;
  if (e.key === 'e' || e.key === 'E') {
    if (evolution.isOpen) evolution.close();
    else evolution.open();
    return;
  }
  if (e.key === 'Escape' && evolution.isOpen) {
    evolution.close();
    return;
  }
  if (evolution.isOpen) return;
  if (e.key === ' ') {
    e.preventDefault();
    game.paused = !game.paused;
  } else if (['1', '2', '3'].includes(e.key)) {
    game.speed = Number(e.key);
    game.paused = false;
  } else if (e.key === 'Escape') {
    sitePanel.close();
  } else if (e.key === '+' || e.key === '=') {
    renderer.camera.zoomAt(1.25, renderer.camera.viewW / 2, renderer.camera.viewH / 2);
  } else if (e.key === '-') {
    renderer.camera.zoomAt(0.8, renderer.camera.viewW / 2, renderer.camera.viewH / 2);
  }
});

new ResizeObserver(() => renderer.resize()).observe(canvas);
addEventListener('resize', () => renderer.resize());

let lastFrame = performance.now();
function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  game.update(dt);
  ticker.update(Math.min(dt, 0.25));
  for (const e of game.drainEvents()) {
    ticker.onEvent(e);
    if (e.type === 'siteReached') {
      const site = renderer.siteById.get(e.site);
      const m = site.metros[game.state.sites[site.index].entry ?? 0] ?? site;
      renderer.addEffect('reached', m.x, m.y);
    } else if (e.type === 'detected') {
      document.body.classList.add('detected');
      hud.toast('SecOps has noticed unusual activity. Remediation has begun.', 5000);
    } else if (e.type === 'response') {
      const r = game.world.responses.get(e.id);
      const where = e.site ? ` in ${game.data.sites[game.world.siteIndex.get(e.site)].name}` : '';
      const counter = (r.counteredBy ?? []).map((id) => game.world.evolutions.get(id)?.name).filter(Boolean);
      const hint = e.countered ? ' Your evolutions blunt it.' : counter.length ? ` Counter: ${counter.join(' or ')}.` : '';
      hud.toast(`SecOps: ${r.name}${where}.${hint}`, 4500);
      if (e.site) {
        const site = renderer.siteById.get(e.site);
        renderer.addEffect('defense', site.x, site.y);
      }
    } else if (e.type === 'irFirm') {
      hud.toast('The CIO hired an incident response firm. Remediation speeds up.', 4500);
    } else if (e.type === 'mutated') {
      const evo = game.world.evolutions.get(e.id);
      hud.toast(e.gained ? `Mutation! Your strain grew ${evo.name}.` : `Mutation! Your strain shed ${evo.name}.`, 3500);
      sitePanel.update(true);
    } else if (e.type === 'merger') {
      hud.toast('The acquisition closed. A whole new network of unpatched machines just joined.', 4500);
    } else if (e.type === 'encryption') {
      document.body.classList.add('detected');
      hud.toast('Encryption triggered. Everyone knows. Lock it all down before they clean you out.', 4500);
    } else if (e.type === 'gameOver') {
      evolution.close();
      const unlocked = e.status === 'won' ? recordWin(game.state) : null;
      setTimeout(() => showEndScreen(game, newGame, { unlocked }), 900);
    }
  }
  renderer.draw(game.state, now, { picking: game.state?.status === 'picking' });
  hud.update();
  sitePanel.update();
  evolution.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small handle for tests and (in Phase 5) the debug panel. Positions are page (client)
// coordinates, ready for mouse.click / touchscreen.tap.
const toClient = ([x, y]) => {
  const r = canvas.getBoundingClientRect();
  return [r.left + x, r.top + y];
};
window.plagueIT = {
  game,
  renderer,
  siteClient: (id) => toClient(renderer.siteScreen(id)),
  bubbleClient: (id) => {
    const b = game.state?.bubbles.find((x) => x.id === id);
    return b ? toClient(renderer.bubbleScreen(b)) : null;
  },
  lonLatClient: (lon, lat) => toClient(renderer.camera.worldToScreen(...renderer.proj.project(lon, lat))),
  camera: () => ({ cx: renderer.camera.cx, cy: renderer.camera.cy, zoom: renderer.camera.zoom, fit: renderer.camera.fitZoom }),
  advance: (ticks) => game.advance(ticks),
  /** Puts a SecOps response in force now (tests; the Phase 5 debug panel). */
  respond: (id, site = null) => applyResponse(game.state, game.world, game.world.responses.get(id), site),
  evolution,
  ticker,
};

$('#boot')?.remove();
newGame();

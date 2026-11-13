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
import { showTitle, showStats, showSettings } from './ui/menus.js';
import { DebugPanel } from './ui/debug.js';
import { Ticker } from './ui/ticker.js';
import { Sound } from './audio.js';
import { scoreGame, gameSummary } from './score.js';
import { applyResponse } from './sim/defense.js';
import { $ } from './ui/dom.js';
import { createStorage } from './storage.js';
import {
  loadSettings, saveSettings, loadProfile, saveProfile, cleanName, cleanProfile,
  loadScores, saveScores, addScore, loadStats, saveStats, addGameToStats, resetProgress,
} from './save.js';

const storage = createStorage();
const settings = loadSettings(storage);
const profile = loadProfile(storage);
const params = new URLSearchParams(location.search);
const sound = new Sound(settings);
const systemReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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

/** Applies the settings that change how the page looks and sounds. */
function applySettings() {
  const reduce = settings.reduceMotion || systemReducedMotion;
  document.body.classList.toggle('reduce-motion', reduce);
  renderer.reduceMotion = reduce;
  ticker.enabled = settings.ticker;
  const mute = $('#mute');
  mute.textContent = settings.muted ? '🔇' : '🔊';
  mute.setAttribute('aria-label', settings.muted ? 'Sound off' : 'Sound on');
  mute.classList.toggle('on', settings.muted);
}
function setMuted(muted) {
  sound.setMuted(muted);
  saveSettings(storage, settings);
  applySettings();
  if (!muted) sound.play('click');
}
$('#mute').addEventListener('click', () => setMuted(!settings.muted));

/** Leaves any game in progress and clears the play field. */
function clearGame() {
  evolution.close();
  sitePanel.close();
  hud.showBanner('');
  document.body.classList.remove('detected', 'in-game');
  game.state = null;
  ticker.reset();
}

function title() {
  clearGame();
  showTitle({
    play: () => newGame(),
    stats: () => showStats(DATA, { stats: loadStats(storage), scores: loadScores(storage), profile: unlockedProfile() }, title),
    settings: () => showSettings(settings, {
      onChange: () => {
        sound.setMuted(settings.muted);
        game.speed = settings.speed;
        saveSettings(storage, settings);
        applySettings();
      },
      onReset: () => {
        resetProgress(storage);
        Object.assign(profile, cleanProfile(null));
      },
      onBack: title,
    }),
  });
}

/** The profile as the setup screen sees it (every strain open once the debug panel unlocked them). */
function unlockedProfile() {
  return playtestUnlocked ? { ...profile, beaten: DATA.strains.map((s) => s.id) } : profile;
}

function newGame() {
  clearGame();
  showSetup(DATA, unlockedProfile(), ({ strainId, difficultyId, scenarioId, strainName }) => {
    Object.assign(profile, { strainName: cleanName(strainName), lastStrain: strainId, lastDifficulty: difficultyId, lastScenario: scenarioId });
    saveProfile(storage, profile);
    startGame(params.get('seed') ?? String(Math.floor(Math.random() * 1e9)));
  }, { onBack: title });
}

/** Starts a game with the last setup choices (the setup screen, or the debug panel's Restart). */
function startGame(seed) {
  clearGame();
  $('#overlay').hidden = true;
  game.newGame({ strainId: profile.lastStrain, difficultyId: profile.lastDifficulty, scenarioId: profile.lastScenario, seed, strainName: profile.strainName });
  game.speed = settings.speed;
  renderer.world = game.world;
  ticker.reset();
  document.body.classList.add('in-game');
  hud.showBanner('Choose patient zero: tap a site to drop the first infection.');
}
let playtestUnlocked = params.get('unlock') === 'all';

/** Records a win (unlocking the next strain). Returns the strain it unlocked, if any. */
function recordWin(state) {
  if (profile.beaten.includes(state.strainId)) return null;
  profile.beaten.push(state.strainId);
  saveProfile(storage, profile);
  return DATA.strains.find((s) => s.unlockedBy === state.strainId) ?? null;
}

/** Scores a finished game and, unless the debug panel was used, saves it. */
function recordGame(state) {
  const score = scoreGame(state, game.world);
  if (state.cheated) return { score, rank: null, unlocked: null, cheated: true };
  const summary = gameSummary(state, game.world, score.total);
  const { scores, rank } = addScore(loadScores(storage), summary);
  saveScores(storage, scores);
  saveStats(storage, addGameToStats(loadStats(storage), summary));
  const unlocked = state.status === 'won' ? recordWin(state) : null;
  return { score, rank, unlocked, cheated: false };
}

const debug = new DebugPanel(game, {
  unlockAll: () => {
    playtestUnlocked = true;
    hud.toast('Every strain unlocked for this visit.');
    if ($('.panel.setup')) newGame();
  },
  restart: (seed) => {
    if (!game.state) return hud.toast('Start a game first: Restart reuses its strain, scenario and difficulty.');
    startGame(seed || String(Math.floor(Math.random() * 1e9)));
  },
});
if (params.has('debug')) {
  const btn = $('#debug-toggle');
  btn.hidden = false;
  btn.addEventListener('click', () => debug.toggle());
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
        sound.play('pop');
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
      const m = site.metros[game.state.sites[site.index].entry ?? 0] ?? site;
      renderer.addEffect('zero', m.x, m.y);
      sound.play('reached');
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
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === '`') {
    debug.toggle();
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    setMuted(!settings.muted);
    return;
  }
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
      sound.play('reached');
    } else if (e.type === 'siteFallen') {
      const site = renderer.siteById.get(e.site);
      renderer.addEffect('fallen', site.x, site.y);
    } else if (e.type === 'siteCleaned') {
      const site = renderer.siteById.get(e.site);
      renderer.addEffect('cleaned', site.x, site.y);
    } else if (e.type === 'evolved') {
      sound.play('evolve');
    } else if (e.type === 'devolved') {
      sound.play('devolve');
    } else if (e.type === 'detected') {
      sound.play('detected');
      document.body.classList.add('detected');
      hud.toast('SecOps has noticed unusual activity. Remediation has begun.', 5000);
    } else if (e.type === 'response') {
      const r = game.world.responses.get(e.id);
      const where = e.site ? ` in ${game.data.sites[game.world.siteIndex.get(e.site)].name}` : '';
      const counter = (r.counteredBy ?? []).map((id) => game.world.evolutions.get(id)?.name).filter(Boolean);
      const hint = e.countered ? ' Your evolutions blunt it.' : counter.length ? ` Counter: ${counter.join(' or ')}.` : '';
      hud.toast(`SecOps: ${r.name}${where}.${hint}`, 4500);
      sound.play('response');
      if (e.site) {
        const site = renderer.siteById.get(e.site);
        renderer.addEffect('defense', site.x, site.y);
      }
    } else if (e.type === 'irFirm') {
      hud.toast('The CIO hired an incident response firm. Remediation speeds up.', 4500);
    } else if (e.type === 'mutated') {
      const evo = game.world.evolutions.get(e.id);
      sound.play('mutated');
      hud.toast(e.gained ? `Mutation! Your strain grew ${evo.name}.` : `Mutation! Your strain shed ${evo.name}.`, 3500);
      sitePanel.update(true);
    } else if (e.type === 'merger') {
      hud.toast('The acquisition closed. A whole new network of unpatched machines just joined.', 4500);
    } else if (e.type === 'encryption') {
      document.body.classList.add('detected');
      sound.play('encrypt');
      hud.toast('Encryption triggered. Everyone knows. Lock it all down before they clean you out.', 4500);
    } else if (e.type === 'gameOver') {
      evolution.close();
      sound.play(e.status);
      const result = recordGame(game.state);
      const shown = game.state;
      setTimeout(() => {
        // (Skip if a new game started in the meantime.)
        if (game.state === shown) showEndScreen(game, newGame, { ...result, animate: !document.body.classList.contains('reduce-motion'), onMenu: title });
      }, 900);
    }
  }
  renderer.draw(game.state, now, { picking: game.state?.status === 'picking' });
  hud.update();
  sitePanel.update();
  evolution.update();
  debug.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small handle for tests and the browser console. Positions are page (client)
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
  /** Puts a SecOps response in force now (tests; the debug panel has a button for it). */
  respond: (id, site = null) => applyResponse(game.state, game.world, game.world.responses.get(id), site),
  evolution,
  ticker,
  sound,
  debug,
  settings,
};

// Button clicks in menus get a soft click.
$('#overlay').addEventListener('click', (e) => {
  if (e.target.closest('button')) sound.play('click');
});

applySettings();
$('#boot')?.remove();
title();

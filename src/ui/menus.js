// The title screen, the stats page and the settings page. Each one replaces the
// overlay's contents, like the setup and end screens.

import { $, el, fmt } from './dom.js';
import { strainUnlocked } from '../save.js';

function show(panel) {
  const overlay = $('#overlay');
  overlay.replaceChildren(panel);
  overlay.hidden = false;
}

/** @param on  { play, stats, settings } */
export function showTitle(on) {
  show(el('div', { class: 'panel title' },
    el('h1', { class: 'logo big', 'data-text': 'PLAGUEIT' }, 'PLAGUE', el('span', {}, 'IT')),
    el('p', { class: 'kicker' }, 'You are the malware. One laptop. Every endpoint. Before SecOps finds you.'),
    el('div', { class: 'menu' },
      el('button', { type: 'button', id: 'play', class: 'primary', onclick: on.play }, 'Play'),
      el('button', { type: 'button', id: 'open-stats', class: 'secondary', onclick: on.stats }, 'Stats & best scores'),
      el('button', { type: 'button', id: 'open-settings', class: 'secondary', onclick: on.settings }, 'Settings')),
    el('details', { class: 'howto' },
      el('summary', {}, 'How to play'),
      el('ul', {},
        el('li', {}, 'Pick a strain and drop patient zero on any state or province.'),
        el('li', {}, 'Tap the red bubbles for Exploit Points, then spend them in Evolve to spread faster, stay quieter or hit harder.'),
        el('li', {}, 'Noise gets you noticed. Once SecOps detects you, the Remediation bar fills and they start fighting back.'),
        el('li', {}, 'Infect every machine before the bar reaches 100%. Win with a strain to unlock the next one.'),
        el('li', {}, 'Keys: Space pauses, 1–3 set speed, E opens Evolve, M mutes.'))),
  ));
}

/** The stats page: lifetime totals, best scores and strain progress. */
export function showStats(data, { stats, scores, profile }, onBack) {
  const name = (list, id) => list.find((x) => x.id === id)?.name ?? id;
  const tile = (label, value) => el('div', { class: 'end-stat' }, el('b', {}, value), el('span', {}, label));
  const winRate = stats.games ? `${Math.round((stats.wins / stats.games) * 100)}%` : '–';
  show(el('div', { class: 'panel stats-page', id: 'stats-page' },
    el('h2', {}, 'Stats'),
    el('div', { class: 'end-stats' },
      tile('games played', fmt(stats.games)),
      tile('wins', fmt(stats.wins)),
      tile('win rate', winRate),
      tile('best score', fmt(stats.best)),
      tile('fastest win (days)', stats.fastestWin === null ? '–' : String(stats.fastestWin)),
      tile('most machines at once', fmt(stats.peak))),
    el('h3', {}, 'Best scores'),
    scores.length
      ? el('ol', { class: 'scores', id: 'scores' }, scores.map((s) =>
        el('li', {},
          el('b', {}, fmt(s.score)),
          el('span', {}, s.name && s.name !== name(data.strains, s.strain) ? `${s.name} · ${name(data.strains, s.strain)}` : name(data.strains, s.strain)),
          el('small', {}, `${s.won ? 'Won' : 'Lost'} on day ${s.days} · ${name(data.difficulties, s.difficulty)} · ${name(data.scenarios, s.scenario)}`))))
      : el('p', { class: 'desc', id: 'scores' }, 'No games yet. Your best ten will show up here.'),
    el('h3', {}, 'Strains'),
    el('ul', { class: 'strain-progress' }, data.strains.map((s) => {
      const st = stats.strains[s.id] ?? { played: 0, won: 0 };
      const open = strainUnlocked(s, profile);
      return el('li', { class: open ? '' : 'locked' },
        el('span', {}, open ? s.name : `🔒 ${s.name}`),
        el('small', {}, open ? `${st.won} won of ${st.played}` : `Beat ${name(data.strains, s.unlockedBy)}`));
    })),
    el('button', { type: 'button', id: 'back', class: 'secondary', onclick: onBack }, 'Back'),
  ));
}

/**
 * The settings page. `onChange(settings)` is called after every change;
 * `onReset()` forgets unlocks, scores and stats (after a second tap).
 */
export function showSettings(settings, { onChange, onReset, onBack }) {
  const toggle = (id, key, label, hint) => el('label', { class: 'toggle', for: id },
    el('input', { id, type: 'checkbox', checked: key === 'sound' ? !settings.muted : settings[key], onchange: (e) => {
      if (key === 'sound') settings.muted = !e.target.checked;
      else settings[key] = e.target.checked;
      onChange(settings);
    } }),
    el('span', {}, label, hint ? el('small', {}, hint) : null));
  const volume = el('input', { id: 'volume', type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), oninput: (e) => {
    settings.volume = Number(e.target.value);
    onChange(settings);
  } });
  const speeds = [1, 2, 3].map((n) => el('button', { type: 'button', class: 'seg' + (settings.speed === n ? ' on' : ''), 'data-speed-default': String(n), onclick: () => {
    settings.speed = n;
    for (const b of speeds) b.classList.toggle('on', b === speeds[n - 1]);
    onChange(settings);
  } }, `${n}×`));
  const reset = el('button', { type: 'button', id: 'reset-progress', class: 'danger', onclick: () => {
    if (!reset.classList.contains('armed')) {
      reset.classList.add('armed');
      reset.textContent = 'Really forget everything? Tap again';
      return;
    }
    onReset();
    reset.classList.remove('armed');
    reset.textContent = 'Progress reset';
    reset.disabled = true;
  } }, 'Reset progress');
  show(el('div', { class: 'panel settings-page', id: 'settings-page' },
    el('h2', {}, 'Settings'),
    toggle('set-sound', 'sound', 'Sound effects'),
    el('label', { class: 'range', for: 'volume' }, el('span', {}, 'Volume'), volume),
    toggle('set-motion', 'reduceMotion', 'Reduce motion', 'Fewer map effects and no screen animations'),
    toggle('set-ticker', 'ticker', 'News ticker'),
    el('div', { class: 'label' }, 'Starting speed'), el('div', { class: 'segs' }, speeds),
    el('div', { class: 'label' }, 'Progress'),
    el('p', { class: 'desc' }, 'Forgets unlocked strains, best scores and stats. Settings stay.'),
    reset,
    el('button', { type: 'button', id: 'back', class: 'secondary', onclick: onBack }, 'Back'),
  ));
}

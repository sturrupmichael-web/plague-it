// The end screen: did you take the whole network, or did SecOps clean you out? Shows
// the score (counting up) and its breakdown, where it ranks among your best scores,
// the timeline graph, and the game's key numbers.

import { $, el, fmt } from './dom.js';
import { drawTimeline, TIMELINE_LEGEND } from './timeline.js';
import { shareMessage, shareScore, shareUrl } from '../share.js';

const OUTCOMES = {
  compromised: ['Network compromised', 'Every endpoint answers to you now. Somewhere, a help desk phone is ringing forever.'],
  remediated: ['Remediated', 'SecOps rebuilt, patched and reimaged their way back. Your strain is a case study now.'],
  eradicated: ['Wiped out', 'The last infected machine was cleaned. Nobody will ever know you were here. Almost nobody.'],
  encrypted: ['Everything encrypted', 'Every file is locked. The CFO is googling "how to buy cryptocurrency". You win.'],
  patched: ['Patched out', 'The global patch landed before you finished. One update, and you\'re a footnote.'],
};

/**
 * @param opts {
 *   unlocked:  the strain this win unlocked, if any
 *   score:     scoreGame() result
 *   rank:      1-based place in the best scores, or null
 *   cheated:   the debug panel was used, so the score wasn't saved
 *   animate:   count up and draw in (off with reduced motion)
 *   onMenu:    back to the title screen
 * }
 */
export function showEndScreen(game, onPlayAgain, { unlocked = null, score = null, rank = null, cheated = false, animate = true, onMenu = null } = {}) {
  const s = game.state;
  const [title, text] = OUTCOMES[s.outcome] ?? ['Game over', ''];
  const days = Math.floor(s.endedAt / 24) + 1;
  const reached = s.sites.filter((x) => x.reachedAt !== null).length;
  const overlay = $('#overlay');
  const stat = (label, value) => el('div', { class: 'end-stat' }, el('b', {}, value), el('span', {}, label));
  const scoreValue = el('b', { id: 'score-value' }, animate ? '0' : fmt(score?.total ?? 0));
  const canvas = el('canvas', { id: 'timeline', 'aria-label': 'Timeline: share of machines infected and remediated each day' });
  const ransom = s.history.some((h) => h[4] > 0);
  const scenario = game.world.scenario;
  const difficulty = game.world.difficulties.get(s.difficultyId);

  overlay.replaceChildren(el('div', { class: `panel end ${s.status}` },
    el('div', { class: 'end-kicker' }, s.status === 'won' ? 'Victory' : 'Defeat'),
    el('h1', {}, title),
    el('p', { class: 'kicker' }, `${s.strainName}: ${text}`),
    score
      ? el('div', { class: 'score' },
        el('div', { class: 'score-main' }, el('span', {}, 'Score'), scoreValue,
          cheated
            ? el('em', { class: 'rank cheated', id: 'score-rank' }, 'Debug panel used: not saved')
            : rank === 1
              ? el('em', { class: 'rank best', id: 'score-rank' }, 'New best!')
              : rank
                ? el('em', { class: 'rank', id: 'score-rank' }, `#${rank} in your best scores`)
                : null),
        el('ul', { class: 'score-parts' },
          score.parts.map((p) => el('li', {}, el('span', {}, p.label), el('b', {}, fmt(p.value)))),
          el('li', { class: 'mult' }, el('span', {}, `× ${difficulty?.name ?? ''}${scenario.id === 'standard' ? '' : `, ${scenario.name}`}`), el('b', {}, `× ${score.mult}`))))
      : null,
    el('div', { class: 'timeline' }, canvas,
      el('div', { class: 'timeline-legend' },
        TIMELINE_LEGEND.filter(([k]) => k !== 'encrypted' || ransom).map(([k, label, color]) =>
          el('span', { class: k }, el('i', { style: `background:${color}` }), label)))),
    el('div', { class: 'end-stats' },
      stat('days', String(days)),
      stat('peak infected', fmt(s.peakInfected)),
      stat(`of ${s.sites.length} sites reached`, String(reached)),
      stat('evolutions', String(s.evolved.length)),
      stat('detected on day', s.detectedAt === null ? 'never' : String(Math.floor(s.detectedAt / 24) + 1)),
      stat('remediation', `${Math.floor(s.remediation)}%`)),
    unlocked ? el('p', { class: 'unlocked', id: 'unlocked' }, `New strain unlocked: ${unlocked.name}`) : null,
    score && !cheated ? shareRow(game, score) : null,
    el('div', { class: 'end-actions' },
      onMenu ? el('button', { type: 'button', id: 'to-title', class: 'secondary', onclick: onMenu }, 'Menu') : null,
      el('button', { type: 'button', id: 'play-again', class: 'primary', onclick: onPlayAgain }, 'Play again')),
  ));
  overlay.hidden = false;
  drawTimeline(canvas, s, { animate });
  if (score && animate) countUp(scoreValue, score.total, 1100);
}

/**
 * The Share button: the phone's share sheet, or the clipboard, or (when neither works)
 * a box with the text selected, ready to copy by hand.
 */
function shareRow(game, score) {
  const msg = shareMessage(game.state, game.world, score);
  const url = shareUrl();
  const status = el('span', { class: 'share-status', id: 'share-status', role: 'status', 'aria-live': 'polite' });
  const manual = el('textarea', { class: 'share-text', id: 'share-text', readonly: '', rows: '4', hidden: '', 'aria-label': 'Your score, to copy' });
  manual.value = `${msg.text}\n${url}`;
  const button = el('button', { type: 'button', id: 'share', class: 'share' }, 'Share score');
  button.addEventListener('click', async () => {
    button.disabled = true;
    const result = await shareScore(msg, url);
    button.disabled = false;
    button.dataset.result = result;
    status.textContent = result === 'copied' ? 'Copied! Paste it anywhere.' : result === 'manual' ? 'Copy this:' : '';
    manual.hidden = result !== 'manual';
    if (result === 'manual') {
      manual.focus();
      manual.select();
    }
  });
  return el('div', { class: 'share-row' }, button, status, manual);
}

/** Counts a number up from 0 over `ms` (eased). */
function countUp(node, to, ms) {
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / ms);
    node.textContent = fmt(to * (1 - (1 - p) ** 3));
    if (p < 1 && node.isConnected) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

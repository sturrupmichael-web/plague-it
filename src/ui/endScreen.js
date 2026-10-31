// The end screen: did you take the whole network, or did SecOps clean you out?
// (Phase 5 adds the timeline graph, the score and best scores.)

import { $, el, fmt } from './dom.js';

const OUTCOMES = {
  compromised: ['Network compromised', 'Every endpoint answers to you now. Somewhere, a help desk phone is ringing forever.'],
  remediated: ['Remediated', 'SecOps rebuilt, patched and reimaged their way back. Your strain is a case study now.'],
  eradicated: ['Wiped out', 'The last infected machine was cleaned. Nobody will ever know you were here. Almost nobody.'],
};

export function showEndScreen(game, onPlayAgain) {
  const s = game.state;
  const [title, text] = OUTCOMES[s.outcome] ?? ['Game over', ''];
  const days = Math.floor(s.endedAt / 24) + 1;
  const reached = s.sites.filter((x) => x.reachedAt !== null).length;
  const overlay = $('#overlay');
  const stat = (label, value) => el('div', { class: 'end-stat' }, el('b', {}, value), el('span', {}, label));
  overlay.replaceChildren(el('div', { class: `panel end ${s.status}` },
    el('div', { class: 'end-kicker' }, s.status === 'won' ? 'Victory' : 'Defeat'),
    el('h1', {}, title),
    el('p', { class: 'kicker' }, `${s.strainName}: ${text}`),
    el('div', { class: 'end-stats' },
      stat('days', String(days)),
      stat('peak infected', fmt(s.peakInfected)),
      stat(`of ${s.sites.length} sites reached`, String(reached)),
      stat('evolutions', String(s.evolved.length)),
      stat('detected on day', s.detectedAt === null ? 'never' : String(Math.floor(s.detectedAt / 24) + 1)),
      stat('remediation', `${Math.floor(s.remediation)}%`)),
    el('button', { type: 'button', id: 'play-again', class: 'primary', onclick: onPlayAgain }, 'Play again'),
  ));
  overlay.hidden = false;
}

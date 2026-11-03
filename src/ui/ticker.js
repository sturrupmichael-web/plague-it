// The news ticker: headlines scroll across a strip under the top bar. Event headlines
// (and defender responses, marked in red) queue up and play in order; when the queue is
// empty, an ambient headline that fits the current state plays every so often.
// Headlines are picked by src/news.js.

import { $, el } from './dom.js';
import { eventHeadlines, ambientHeadline } from '../news.js';

/** Scroll speed in CSS pixels per second. */
const SPEED = 80;
/** Real seconds of quiet between ambient headlines. */
const AMBIENT_GAP = 6;
const MAX_QUEUE = 5;

export class Ticker {
  constructor(game) {
    this.game = game;
    this.root = $('#ticker');
    this.track = $('#ticker .track');
    /** Every headline shown this game, oldest first: { id, text, kind }. For tests too. */
    this.history = [];
    this.reset();
  }

  reset() {
    if (this.current) this.stop();
    this.queue = [];
    this.seen = new Set();
    this.history = [];
    this.quiet = AMBIENT_GAP - 1.5;
    this.track.replaceChildren();
  }

  /** Feed it the game's events (call with each drained event). */
  onEvent(event) {
    const s = this.game.state;
    if (!s) return;
    for (const h of eventHeadlines(event, s, this.game.data, this.seen)) {
      // Defender moves jump the queue; drop the oldest filler if it's getting long.
      if (h.kind === 'defense') {
        // Breaking news: a SecOps move cuts off whatever filler is scrolling.
        this.queue.unshift(h);
        if (this.current && this.current.h.kind !== 'defense') this.stop();
      } else {
        this.queue.push(h);
      }
      if (this.queue.length > MAX_QUEUE) this.queue.pop();
    }
  }

  /** Call every frame with the real seconds since the last one. */
  update(dt) {
    const s = this.game.state;
    const visible = !!s && s.status !== 'picking';
    if (this.root.hidden === visible) this.root.hidden = !visible;
    if (!visible) return;
    const paused = this.game.paused || s.status !== 'running';
    if (this.current) {
      const { anim } = this.current;
      if (paused && anim.playState === 'running') anim.pause();
      else if (!paused && anim.playState === 'paused') anim.play();
      return;
    }
    if (paused) return;
    this.quiet += dt;
    let next = this.queue.shift();
    if (!next && this.quiet >= AMBIENT_GAP) {
      next = ambientHeadline(s, this.game.data, this.seen, this.history.slice(-8).map((h) => h.id));
      this.quiet = 0;
    }
    if (next) this.play(next);
  }

  stop() {
    this.current.anim.cancel();
    this.current.item.remove();
    this.current = null;
  }

  play(h) {
    this.history.push(h);
    const label = h.kind === 'defense' ? 'SECOPS' : 'NEWS';
    const item = el('span', { class: `item ${h.kind}` }, el('b', {}, label), ' ', h.text);
    this.track.replaceChildren(item);
    const from = this.track.clientWidth;
    const to = -item.offsetWidth;
    const anim = item.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: ((from - to) / SPEED) * 1000, easing: 'linear', fill: 'forwards' },
    );
    this.current = { h, anim, item };
    anim.onfinish = () => {
      item.remove();
      this.current = null;
      this.quiet = 0;
    };
  }
}

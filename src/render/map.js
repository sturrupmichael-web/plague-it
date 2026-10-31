// Draws the threat map on a canvas: dotted continents, network links, glowing site
// nodes and Exploit Point bubbles. Reads the game state; never changes it.
// Sizes of nodes, lines and text are in screen pixels, so they stay crisp and readable
// at every zoom level; positions are in map units, converted by the camera.

import { Camera } from './camera.js';
import { createProjection, pointInPolygon } from './geo.js';

const COLORS = {
  bg: '#05070a',
  land: 'rgba(120, 150, 170, 0.22)',
  linkLocked: 'rgba(110, 130, 150, 0.18)',
  linkOpen: 'rgba(90, 170, 200, 0.28)',
  linkHot: [255, 60, 60],
  siteClean: [94, 200, 220],
  siteInfected: [255, 52, 52],
  remediated: [90, 140, 255],
  label: 'rgba(210, 225, 235, 0.85)',
  bubble: [255, 70, 70],
  bubbleSite: [255, 190, 70],
};

/** Bubble hit radius in CSS pixels: big enough for a fingertip. */
export const BUBBLE_HIT = 26;
const SITE_HIT = 22;

export class MapRenderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.proj = createProjection(data.map);
    this.camera = new Camera(this.proj.width, this.proj.height);
    this.sites = data.sites.map((s) => {
      const [x, y] = this.proj.project(s.lon, s.lat);
      return { ...s, x, y };
    });
    this.siteById = new Map(this.sites.map((s) => [s.id, s]));
    this.links = data.links.map((l) => ({ ...l, a: this.siteById.get(l.from), b: this.siteById.get(l.to) }));
    this.landDots = this.buildLand();
    this.selectedSite = null;
    /** Short-lived visual effects (bubble pops, site-reached rings). */
    this.effects = [];
    this.dpr = 1;
    this.resize();
  }

  /** Matches the canvas backing store to its CSS size times devicePixelRatio. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.resize(w, h);
  }

  buildLand() {
    const polys = this.data.landmasses.map((poly) => poly.map(([lon, lat]) => this.proj.project(lon, lat)));
    const step = this.data.map.dotSpacing;
    const path = new Path2D();
    const r = step * 0.28;
    for (let y = step / 2; y < this.proj.height; y += step) {
      for (let x = step / 2; x < this.proj.width; x += step) {
        if (polys.some((p) => pointInPolygon(x, y, p))) {
          path.moveTo(x + r, y);
          path.arc(x, y, r, 0, Math.PI * 2);
        }
      }
    }
    return path;
  }

  /** Screen (CSS px, relative to the canvas) position of a site. */
  siteScreen(id) {
    const s = this.siteById.get(id);
    return this.camera.worldToScreen(s.x, s.y);
  }

  bubbleScreen(b) {
    const s = this.siteById.get(b.site);
    return this.camera.worldToScreen(s.x + b.dx, s.y + b.dy);
  }

  /** The bubble under a screen point, or null. Newest first. */
  bubbleAt(state, sx, sy) {
    for (let i = state.bubbles.length - 1; i >= 0; i--) {
      const [bx, by] = this.bubbleScreen(state.bubbles[i]);
      if (Math.hypot(bx - sx, by - sy) <= BUBBLE_HIT) return state.bubbles[i];
    }
    return null;
  }

  /** The site under a screen point, or null (nearest within reach). */
  siteAt(sx, sy) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.sites) {
      const [x, y] = this.camera.worldToScreen(s.x, s.y);
      const d = Math.hypot(x - sx, y - sy);
      if (d < Math.max(SITE_HIT, this.siteRadius(s) + 6) && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  siteRadius(site) {
    const zoomBoost = Math.sqrt(this.camera.zoom / this.camera.fitZoom);
    return (4 + Math.sqrt(site.devices) / 6) * Math.min(1.8, 0.8 + 0.2 * zoomBoost);
  }

  addEffect(type, x, y, extra = {}) {
    this.effects.push({ type, x, y, t0: performance.now(), ...extra });
  }

  /**
   * Draws one frame.
   * @param state  game state (or null on the setup screen)
   * @param now    performance.now() in ms, for animations
   * @param opts   { picking: bool } highlights sites that can be patient zero
   */
  draw(state, now, opts = {}) {
    const { ctx, camera: cam, dpr } = this;
    const W = cam.viewW;
    const H = cam.viewH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, 'rgba(20, 40, 55, 0.35)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // Land, in map coordinates.
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.cx * z), dpr * (H / 2 - cam.cy * z));
    ctx.fillStyle = COLORS.land;
    ctx.fill(this.landDots);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const siteState = state ? new Map(state.sites.map((s) => [s.id, s])) : new Map();
    this.drawLinks(state, siteState, now);
    this.drawSites(siteState, now, opts);
    if (state) this.drawBubbles(state, now);
    this.drawEffects(now);
  }

  linkCurve(l) {
    const [ax, ay] = this.camera.worldToScreen(l.a.x, l.a.y);
    const [bx, by] = this.camera.worldToScreen(l.b.x, l.b.y);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    // Bow every link upward a little, like flight paths.
    const bow = 0.18;
    const sign = dx >= 0 ? -1 : 1;
    return { ax, ay, bx, by, qx: mx + dy * bow * sign, qy: my - Math.abs(dx) * bow };
  }

  drawLinks(state, siteState, now) {
    const { ctx } = this;
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const c = this.linkCurve(l);
      const open = !l.requires || (state && state.evolved.includes(l.requires));
      const ia = siteState.get(l.from)?.infected ?? 0;
      const ib = siteState.get(l.to)?.infected ?? 0;
      ctx.beginPath();
      ctx.moveTo(c.ax, c.ay);
      ctx.quadraticCurveTo(c.qx, c.qy, c.bx, c.by);
      if (!open) {
        ctx.setLineDash([2, 5]);
        ctx.lineDashOffset = 0;
        ctx.strokeStyle = COLORS.linkLocked;
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }
      if (ia || ib) {
        const [r, g, b] = COLORS.linkHot;
        const both = ia && ib;
        ctx.setLineDash([6, 8]);
        // Dashes flow away from the infected end.
        const dir = ia && !ib ? -1 : ib && !ia ? 1 : -1;
        ctx.lineDashOffset = ((now / 40) * dir) % 14;
        ctx.strokeStyle = `rgba(${r},${g},${b},${both ? 0.55 : 0.8})`;
        ctx.lineWidth = both ? 1.3 : 1.8;
        ctx.stroke();
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = COLORS.linkOpen;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // A spark travels along a link that just carried an infection.
      const last = state?.linkActivity[i];
      if (last != null && state.tick - last < 36) {
        const t = (state.tick - last) / 36;
        const from = siteState.get(l.from)?.reachedAt ?? 0;
        const to = siteState.get(l.to)?.reachedAt ?? 0;
        const forward = to >= from;
        const u = forward ? t : 1 - t;
        const x = (1 - u) * (1 - u) * c.ax + 2 * (1 - u) * u * c.qx + u * u * c.bx;
        const y = (1 - u) * (1 - u) * c.ay + 2 * (1 - u) * u * c.qy + u * u * c.by;
        glow(ctx, x, y, 7, COLORS.linkHot, 0.9 * (1 - t * 0.5));
      }
    }
    ctx.setLineDash([]);
  }

  drawSites(siteState, now, opts) {
    const { ctx, camera: cam } = this;
    const showLabels = cam.zoom > cam.fitZoom * 2.2;
    const labels = [];
    for (const s of this.sites) {
      const st = siteState.get(s.id);
      const [x, y] = cam.worldToScreen(s.x, s.y);
      if (x < -60 || y < -60 || x > cam.viewW + 60 || y > cam.viewH + 60) continue;
      const r = this.siteRadius(s);
      const frac = st ? st.infected / st.devices : 0;
      const col = st?.infected ? mix(COLORS.siteClean, COLORS.siteInfected, Math.min(1, 0.55 + frac)) : COLORS.siteClean;
      const pulse = frac > 0 ? 0.15 * Math.sin(now / 300 + s.x) : 0;
      glow(ctx, x, y, r * (2.6 + pulse), col, 0.35 + frac * 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.9)`;
      ctx.fill();
      // Ring: share of machines infected.
      if (st && st.infected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = 'rgba(255, 90, 90, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (s.airGapped) {
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (opts.picking && !s.airGapped) {
        const k = (now / 900 + s.x / 100) % 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + k * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 80, ${0.7 * (1 - k)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (this.selectedSite === s.id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (showLabels || this.selectedSite === s.id) labels.push({ s, x, y: y + r + 8 });
    }
    // Labels last, biggest sites (and the selected one) first, skipping any that would
    // overlap a label already drawn.
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.label;
    labels.sort((a, b) => (b.s.id === this.selectedSite) - (a.s.id === this.selectedSite) || b.s.devices - a.s.devices);
    const placed = [];
    for (const l of labels) {
      const w = ctx.measureText(l.s.name).width + 6;
      const box = [l.x - w / 2, l.y, l.x + w / 2, l.y + 14];
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
      placed.push(box);
      ctx.fillText(l.s.name, l.x, l.y);
    }
  }

  drawBubbles(state, now) {
    const { ctx } = this;
    const ttl = this.data.balance.bubbles.ttl;
    for (const b of state.bubbles) {
      const [x, y] = this.bubbleScreen(b);
      const age = (state.tick - b.born) / ttl;
      const appear = Math.min(1, (state.tick - b.born + 1) / 4);
      const fade = age > 0.8 ? 1 - (age - 0.8) / 0.2 : 1;
      const col = b.kind === 'site' ? COLORS.bubbleSite : COLORS.bubble;
      const size = (12 + Math.sin(now / 220 + b.id) * 1.2) * (0.6 + 0.4 * appear);
      glow(ctx, x, y, size * 2.2, col, 0.45 * fade);
      hexPath(ctx, x, y, size);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.92 * fade})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = '700 11px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(20,0,0,${fade})`;
      ctx.fillText('+' + b.value, x, y + 0.5);
    }
  }

  drawEffects(now) {
    const { ctx } = this;
    this.effects = this.effects.filter((e) => now - e.t0 < 600);
    for (const e of this.effects) {
      const t = (now - e.t0) / 600;
      const [x, y] = this.camera.worldToScreen(e.x, e.y);
      if (e.type === 'pop') {
        ctx.beginPath();
        ctx.arc(x, y, 12 + t * 26, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 120, ${1 - t})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '700 13px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 220, 160, ${1 - t})`;
        ctx.fillText('+' + e.value, x, y - 16 - t * 20);
      } else if (e.type === 'reached') {
        ctx.beginPath();
        ctx.arc(x, y, 8 + t * 40, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.8 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

function glow(ctx, x, y, r, [cr, cg, cb], a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

export { Camera };

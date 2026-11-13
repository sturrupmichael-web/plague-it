// Draws the threat map on a canvas: states and provinces filled by how compromised they
// are, metro areas as dots that turn red as infection spreads out from where it landed,
// network links, facilities and Exploit Point bubbles. Reads the game state; never
// changes it. Sizes of dots, lines and text are in screen pixels, so they stay crisp at
// every zoom; positions are in map units, converted by the camera.

import { Camera } from './camera.js';
import { createProjection, pointInRing } from './geo.js';

const COLORS = {
  bg: '#05070a',
  water: '#04070b',
  region: [22, 33, 43],
  regionHot: [178, 26, 34],
  regionCleaned: [40, 70, 150],
  regionEncrypted: [120, 40, 170],
  regionPending: [12, 17, 22],
  border: 'rgba(130, 170, 195, 0.32)',
  linkLocked: 'rgba(110, 130, 150, 0.2)',
  linkOpen: 'rgba(90, 170, 200, 0.3)',
  linkClosed: 'rgba(110, 150, 255, 0.45)',
  linkHot: [255, 60, 60],
  metro: [110, 190, 210],
  metroInfected: [255, 70, 70],
  facility: [94, 200, 220],
  label: 'rgba(215, 228, 236, 0.82)',
  bubble: [255, 70, 70],
  bubbleSite: [255, 190, 70],
};
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Bubble hit radius in CSS pixels: big enough for a fingertip. */
export const BUBBLE_HIT = 26;

export class MapRenderer {
  /** @param world  from createWorld(DATA): the renderer uses its links so indices match the state */
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.data = world.data;
    this.proj = createProjection(this.data.map, this.data.sites);
    this.camera = new Camera(this.proj.width, this.proj.height);
    this.camera.focus = this.proj.project(...this.data.map.focus);
    this.sites = this.data.sites.map((s, index) => {
      const p = (lon, lat) => this.proj.project(lon, lat, s.id);
      const rings = (s.rings ?? []).map((ring) => {
        const out = new Float32Array(ring.length);
        for (let i = 0; i < ring.length; i += 2) [out[i], out[i + 1]] = p(ring[i], ring[i + 1]);
        return out;
      });
      const path = new Path2D();
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of rings) {
        path.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) path.lineTo(r[i], r[i + 1]);
        path.closePath();
        for (let i = 0; i < r.length; i += 2) {
          x0 = Math.min(x0, r[i]);
          x1 = Math.max(x1, r[i]);
          y0 = Math.min(y0, r[i + 1]);
          y1 = Math.max(y1, r[i + 1]);
        }
      }
      const [x, y] = p(s.lon, s.lat);
      const metros = (s.metros ?? []).map((m) => {
        const [mx, my] = p(m.lon, m.lat);
        return { ...m, x: mx, y: my, r: 1.1 + Math.sqrt(m.pop) / 1600 };
      });
      return { ...s, index, x, y, rings, path, bbox: [x0, y0, x1, y1], metros, order: null };
    });
    this.siteById = new Map(this.sites.map((s) => [s.id, s]));
    this.links = world.links.map((l) => ({ ...l, a: this.sites[l.a], b: this.sites[l.b] }));
    this.lakes = new Path2D();
    for (const ring of this.data.lakes ?? []) {
      for (let i = 0; i < ring.length; i += 2) {
        const [lx, ly] = this.proj.project(ring[i], ring[i + 1]);
        if (i) this.lakes.lineTo(lx, ly);
        else this.lakes.moveTo(lx, ly);
      }
      this.lakes.closePath();
    }
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

  /** Screen (CSS px, relative to the canvas) position of a site's anchor (its biggest metro). */
  siteScreen(id) {
    const s = this.siteById.get(id);
    return this.camera.worldToScreen(s.x, s.y);
  }

  bubbleWorld(b) {
    const s = this.siteById.get(b.site);
    const m = b.metro != null ? s.metros[b.metro] : null;
    return [(m ? m.x : s.x) + b.dx, (m ? m.y : s.y) + b.dy];
  }

  bubbleScreen(b) {
    return this.camera.worldToScreen(...this.bubbleWorld(b));
  }

  /** The bubble under a screen point, or null. Newest first. */
  bubbleAt(state, sx, sy) {
    for (let i = state.bubbles.length - 1; i >= 0; i--) {
      const [bx, by] = this.bubbleScreen(state.bubbles[i]);
      if (Math.hypot(bx - sx, by - sy) <= BUBBLE_HIT) return state.bubbles[i];
    }
    return null;
  }

  /**
   * The site under a screen point, or null. A point right on a site's anchor wins (so
   * tiny regions like DC can be tapped), then facilities, then whichever outline contains it.
   */
  siteAt(sx, sy) {
    const cam = this.camera;
    let best = null;
    let bestD = Infinity;
    // The nearest anchor within reach wins: 9px for regions, 18px for facility markers.
    for (const s of this.sites) {
      const [x, y] = cam.worldToScreen(s.x, s.y);
      const d = Math.hypot(x - sx, y - sy);
      if (d < (s.rings.length ? 9 : 18) && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) return best;
    const [wx, wy] = cam.screenToWorld(sx, sy);
    for (const s of this.sites) {
      const [x0, y0, x1, y1] = s.bbox;
      if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
      if (s.rings.some((r) => pointInRing(wx, wy, r))) return s;
    }
    return null;
  }

  /** Effects that only decorate are skipped with reduced motion; feedback ('pop') stays. */
  addEffect(type, x, y, extra = {}) {
    if (this.reduceMotion && type !== 'pop') return;
    this.effects.push({ type, x, y, t0: performance.now(), ...extra });
  }

  /** Metro thresholds: the share of the site infected at which each metro turns red. */
  metroOrder(site, entry) {
    if (site.order && site.order.entry === entry) return site.order.at;
    const start = site.metros[entry ?? 0] ?? site;
    const idx = site.metros.map((m, i) => i).sort((a, b) =>
      Math.hypot(site.metros[a].x - start.x, site.metros[a].y - start.y) - Math.hypot(site.metros[b].x - start.x, site.metros[b].y - start.y));
    const total = site.metros.reduce((n, m) => n + Math.max(1, m.pop), 0) || 1;
    const at = new Array(site.metros.length);
    let cum = 0;
    for (const i of idx) {
      at[i] = cum / total;
      cum += Math.max(1, site.metros[i].pop);
    }
    site.order = { entry, at };
    return at;
  }

  /**
   * Draws one frame.
   * @param state  game state (or null on the setup screen)
   * @param now    performance.now() in ms, for animations
   * @param opts   { picking: bool } highlights the regions that can be patient zero
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

    const siteState = state ? state.sites : null;

    // Regions, lakes and borders, in map coordinates.
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.cx * z), dpr * (H / 2 - cam.cy * z));
    ctx.lineJoin = 'round';
    const pulse = opts.picking ? 0.35 + 0.25 * Math.sin(now / 300) : 0;
    for (const s of this.sites) {
      if (!s.rings.length) continue;
      const st = siteState?.[s.index];
      let col = COLORS.region;
      if (st && (st.infected || st.remediated)) {
        const f = st.infected / st.devices;
        const r = st.remediated / st.devices;
        col = mix(col, COLORS.regionCleaned, Math.min(1, r * 1.5));
        col = mix(col, COLORS.regionHot, st.infected ? Math.min(1, 0.22 + f * 0.95) : 0);
        if (st.encrypted) col = mix(col, COLORS.regionEncrypted, Math.min(1, 0.3 + (st.encrypted / st.devices) * 0.7));
      }
      // The Merger: regions that haven't joined yet are dark.
      if (st?.pending) col = COLORS.regionPending;
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fill(s.path);
    }
    ctx.fillStyle = COLORS.water;
    ctx.fill(this.lakes);
    ctx.lineWidth = 0.8 / z;
    ctx.strokeStyle = COLORS.border;
    for (const s of this.sites) if (s.rings.length) ctx.stroke(s.path);
    ctx.stroke(this.lakes);
    if (opts.picking) {
      ctx.strokeStyle = `rgba(255, 80, 80, ${pulse})`;
      ctx.lineWidth = 1.4 / z;
      for (const s of this.sites) if (s.rings.length) ctx.stroke(s.path);
    }
    // Inset boxes (Hawaii), so it's clear they aren't drawn where they really are.
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.strokeStyle = 'rgba(130, 170, 195, 0.3)';
    ctx.lineWidth = 1 / z;
    for (const id of Object.keys(this.data.map.insets ?? {})) {
      const s = this.siteById.get(id);
      if (!s) continue;
      const [x0, y0, x1, y1] = s.bbox;
      const p = 8;
      ctx.strokeRect(x0 - p, y0 - p, x1 - x0 + 2 * p, y1 - y0 + 2 * p);
    }
    ctx.setLineDash([]);
    // Sites under a SecOps response get a blue outline (dashed while cut off).
    for (const a of state?.defense.active ?? []) {
      const s = a.site && this.siteById.get(a.site);
      if (!s?.rings.length) continue;
      const isolated = this.world.responses.get(a.id)?.effects?.closesLinks?.includes('*');
      ctx.setLineDash(isolated ? [5 / z, 3 / z] : []);
      ctx.strokeStyle = isolated ? 'rgba(120, 160, 255, 0.95)' : 'rgba(110, 150, 255, 0.6)';
      ctx.lineWidth = (isolated ? 2.2 : 1.5) / z;
      ctx.stroke(s.path);
    }
    ctx.setLineDash([]);
    const sel = this.selectedSite && this.siteById.get(this.selectedSite);
    if (sel?.rings.length) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2 / z;
      ctx.stroke(sel.path);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.drawLinks(state, now);
    this.drawMetros(siteState, now);
    this.drawFacilities(siteState, now, opts);
    this.drawLabels();
    if (state) this.drawBubbles(state, now);
    this.drawEffects(now);
  }

  linkCurve(l) {
    const [ax, ay] = this.camera.worldToScreen(l.a.x, l.a.y);
    const [bx, by] = this.camera.worldToScreen(l.b.x, l.b.y);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const len = Math.hypot(bx - ax, by - ay);
    // Bow links upward a little, like flight paths; short border hops barely bow.
    const bow = l.kind === 'border' ? 0.05 : 0.16;
    return { ax, ay, bx, by, qx: mx, qy: my - len * bow };
  }

  drawLinks(state, now) {
    const { ctx } = this;
    const sites = state?.sites;
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const border = l.kind === 'border';
      const last = state?.linkActivity[i];
      const sparking = last != null && state.tick - last < 36;
      if (border && !sparking) continue;
      const c = this.linkCurve(l);
      if (!border) {
        const open = !l.requires || (state && state.evolved.includes(l.requires));
        const closed = open && state?.dfx && state.dfx.linkFactor[i] === 0;
        const ia = sites?.[l.a.index].infected ?? 0;
        const ib = sites?.[l.b.index].infected ?? 0;
        ctx.beginPath();
        ctx.moveTo(c.ax, c.ay);
        ctx.quadraticCurveTo(c.qx, c.qy, c.bx, c.by);
        if (closed) {
          ctx.setLineDash([3, 4]);
          ctx.lineDashOffset = 0;
          ctx.strokeStyle = COLORS.linkClosed;
          ctx.lineWidth = 1.2;
        } else if (!open) {
          ctx.setLineDash([2, 5]);
          ctx.lineDashOffset = 0;
          ctx.strokeStyle = COLORS.linkLocked;
          ctx.lineWidth = 1;
        } else if (ia || ib) {
          const [r, g, b] = COLORS.linkHot;
          ctx.setLineDash([6, 8]);
          const dir = ia && !ib ? -1 : 1;
          ctx.lineDashOffset = ((now / 40) * dir) % 14;
          ctx.strokeStyle = `rgba(${r},${g},${b},${ia && ib ? 0.5 : 0.8})`;
          ctx.lineWidth = ia && ib ? 1.2 : 1.7;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = COLORS.linkOpen;
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
      // A spark travels along a link (or across a border) that just carried an infection.
      if (sparking) {
        const t = (state.tick - last) / 36;
        const forward = (sites[l.b.index].reachedAt ?? 0) >= (sites[l.a.index].reachedAt ?? 0);
        const u = forward ? t : 1 - t;
        const x = (1 - u) * (1 - u) * c.ax + 2 * (1 - u) * u * c.qx + u * u * c.bx;
        const y = (1 - u) * (1 - u) * c.ay + 2 * (1 - u) * u * c.qy + u * u * c.by;
        glow(this.ctx, x, y, 7, COLORS.linkHot, 0.9 * (1 - t * 0.5));
      }
    }
    ctx.setLineDash([]);
  }

  drawMetros(siteState, now) {
    const { ctx, camera: cam } = this;
    const boost = Math.min(2, Math.sqrt(cam.zoom / cam.fitZoom));
    for (const s of this.sites) {
      if (!s.rings.length) continue;
      const st = siteState?.[s.index];
      const share = st?.devices ? st.infected / st.devices : 0;
      const encShare = st?.devices ? st.encrypted / st.devices : 0;
      const at = st?.infected ? this.metroOrder(s, st.entry) : null;
      for (let i = 0; i < s.metros.length; i++) {
        const m = s.metros[i];
        const [x, y] = cam.worldToScreen(m.x, m.y);
        if (x < -10 || y < -10 || x > cam.viewW + 10 || y > cam.viewH + 10) continue;
        const r = m.r * boost;
        const hot = at && share > at[i];
        if (st?.pending) {
          ctx.fillStyle = `rgba(${COLORS.metro.join(',')},0.15)`;
        } else if (hot && encShare > at[i]) {
          ctx.fillStyle = 'rgb(200, 110, 255)';
        } else if (hot) {
          if (r > 2) glow(ctx, x, y, r * 3.2, COLORS.metroInfected, 0.35 + 0.1 * Math.sin(now / 400 + i));
          ctx.fillStyle = `rgb(${COLORS.metroInfected.join(',')})`;
        } else {
          ctx.fillStyle = `rgba(${COLORS.metro.join(',')},0.55)`;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawFacilities(siteState, now, opts) {
    const { ctx, camera: cam } = this;
    for (const s of this.sites) {
      if (s.rings.length) continue;
      const st = siteState?.[s.index];
      const [x, y] = cam.worldToScreen(s.x, s.y);
      const frac = st ? st.infected / st.devices : 0;
      const col = st?.infected ? mix(COLORS.facility, COLORS.metroInfected, Math.min(1, 0.55 + frac)) : COLORS.facility;
      glow(ctx, x, y, 16, col, 0.4);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.selectedSite === s.id) {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (opts.picking) continue;
    }
  }

  drawLabels() {
    const { ctx, camera: cam } = this;
    const zoomed = cam.zoom > cam.fitZoom * 1.5;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.label;
    const order = [...this.sites].sort((a, b) => (b.id === this.selectedSite) - (a.id === this.selectedSite) || b.devices - a.devices);
    const placed = [];
    for (const s of order) {
      if (!zoomed && s.id !== this.selectedSite) continue;
      const [x, y0] = cam.worldToScreen(s.x, s.y);
      const y = y0 + 7;
      if (x < -50 || x > cam.viewW + 50 || y < -20 || y > cam.viewH + 20) continue;
      const w = ctx.measureText(s.name).width + 6;
      const box = [x - w / 2, y, x + w / 2, y + 14];
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
      placed.push(box);
      ctx.fillText(s.name, x, y);
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
      const col = b.kind === 'infection' ? COLORS.bubble : COLORS.bubbleSite;
      const size = (12 + Math.sin(now / 220 + b.id) * 1.2) * (0.6 + 0.4 * appear);
      glow(ctx, x, y, size * 2.2, col, 0.45 * fade);
      hexPath(ctx, x, y, size);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.92 * fade})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(20,0,0,${fade})`;
      ctx.fillText('+' + b.value, x, y + 0.5);
    }
  }

  drawEffects(now) {
    const { ctx } = this;
    const life = (e) => EFFECT_LIFE[e.type] ?? 600;
    this.effects = this.effects.filter((e) => now - e.t0 < life(e));
    for (const e of this.effects) {
      // (Clamped: an effect added during a long frame can be stamped after this frame's `now`.)
      const t = Math.max(0, (now - e.t0) / life(e));
      const [x, y] = this.camera.worldToScreen(e.x, e.y);
      if (e.type === 'pop') {
        ctx.beginPath();
        ctx.arc(x, y, 12 + t * 26, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 120, ${1 - t})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `700 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 220, 160, ${1 - t})`;
        ctx.fillText('+' + e.value, x, y - 16 - t * 20);
      } else if (e.type === 'reached') {
        ctx.beginPath();
        ctx.arc(x, y, 8 + t * 40, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.8 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'fallen' || e.type === 'zero') {
        // A site fully taken (or patient zero): a double red shockwave.
        const big = e.type === 'zero' ? 110 : 70;
        for (const k of [0, 0.25]) {
          const u = Math.max(0, t - k) / (1 - k);
          ctx.beginPath();
          ctx.arc(x, y, 6 + u * big, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 50, 50, ${0.9 * (1 - u)})`;
          ctx.lineWidth = 3 * (1 - u) + 0.5;
          ctx.stroke();
        }
      } else if (e.type === 'cleaned') {
        ctx.beginPath();
        ctx.arc(x, y, 40 - t * 34, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120, 200, 255, ${1 - t})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'defense') {
        for (const k of [0, 0.3]) {
          const u = Math.max(0, t - k) / (1 - k);
          ctx.beginPath();
          ctx.arc(x, y, 60 - u * 50, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(110, 150, 255, ${0.9 * u * (1 - u) * 3})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }
  }
}

/** How long each map effect lasts, in ms. */
const EFFECT_LIFE = { pop: 600, reached: 600, defense: 1600, fallen: 1100, zero: 1400, cleaned: 900 };

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

// The end screen's timeline graph: the share of machines infected, remediated and
// encrypted each day (from state.history), the Remediation bar as a dotted line, and
// markers for the key moments (detection, the IR firm, the merger, Encrypt). It draws
// itself in from left to right.

const COLORS = {
  infected: '#ff3b3b',
  encrypted: '#ffb020',
  remediated: '#4d8dff',
  remediation: '#9fb3c8',
  grid: 'rgba(255,255,255,0.08)',
  text: '#8a97a8',
};

const MARKERS = {
  detected: { label: 'Detected', color: '#ffd23b' },
  irFirm: { label: 'IR firm', color: '#4d8dff' },
  merger: { label: 'Merger', color: '#9fe870' },
  encryption: { label: 'Encrypt', color: '#ffb020' },
};

/**
 * Turns state.history into chart series, each a list of [day, share 0..1]
 * (remediation is the bar's 0..1). Pure, for tests.
 */
export function timelineSeries(history) {
  const out = { infected: [], remediated: [], encrypted: [], remediation: [] };
  for (const [tick, healthy, infected, remediated, encrypted = 0, bar = 0] of history) {
    const devices = healthy + infected + remediated || 1;
    const day = tick / 24;
    out.infected.push([day, infected / devices]);
    out.remediated.push([day, remediated / devices]);
    out.encrypted.push([day, encrypted / devices]);
    out.remediation.push([day, bar / 100]);
  }
  return out;
}

/** Key moments to mark on the graph: [{ day, label, color }]. */
export function timelineMarkers(log) {
  return log.filter((e) => MARKERS[e.type]).map((e) => ({ day: e.tick / 24, ...MARKERS[e.type] }));
}

/**
 * Draws the graph into `canvas` (sized to its CSS box). `animate` draws it in over
 * ~1.2 s; returns a function that stops the animation.
 */
export function drawTimeline(canvas, state, { animate = true } = {}) {
  const series = timelineSeries(state.history);
  const markers = timelineMarkers(state.log);
  const days = Math.max(1, (state.endedAt ?? state.tick) / 24);
  const dpr = globalThis.devicePixelRatio || 1;
  const w = canvas.clientWidth || 480;
  const h = canvas.clientHeight || 160;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const pad = { l: 30, r: 8, t: 16, b: 18 };
  const x = (d) => pad.l + (d / days) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - v * (h - pad.t - pad.b);
  const ransom = series.encrypted.some(([, v]) => v > 0);

  const draw = (p) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = COLORS.text;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (const v of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(w - pad.r, y(v));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(`${v * 100}%`, pad.l - 4, y(v) + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Day 1', pad.l, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`Day ${Math.floor(days) + 1}`, w - pad.r, h - 4);
    const upTo = days * p;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, x(upTo) + 1, h);
    ctx.clip();
    // Infected as a filled area, the rest as lines.
    area(series.infected, COLORS.infected);
    line(series.remediated, COLORS.remediated, 2);
    if (ransom) line(series.encrypted, COLORS.encrypted, 2);
    line(series.remediation, COLORS.remediation, 1.5, [2, 3]);
    ctx.restore();
    ctx.textAlign = 'center';
    for (const m of markers) {
      if (m.day > upTo) continue;
      ctx.strokeStyle = m.color;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x(m.day), pad.t);
      ctx.lineTo(x(m.day), h - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, Math.min(w - pad.r - 20, Math.max(pad.l + 20, x(m.day))), 10);
    }
  };
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach(([d, v], i) => (i ? ctx.lineTo(x(d), y(v)) : ctx.moveTo(x(d), y(v))));
  };
  const line = (pts, color, width, dash = []) => {
    if (!pts.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    path(pts);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const area = (pts, color) => {
    if (!pts.length) return;
    path(pts);
    ctx.lineTo(x(pts.at(-1)[0]), y(0));
    ctx.lineTo(x(pts[0][0]), y(0));
    ctx.closePath();
    ctx.fillStyle = color + '40';
    ctx.fill();
    line(pts, color, 2);
  };

  if (!animate) {
    draw(1);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / 1200);
    draw(1 - (1 - p) ** 3);
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export const TIMELINE_LEGEND = [
  ['infected', 'Infected', COLORS.infected],
  ['remediated', 'Remediated', COLORS.remediated],
  ['encrypted', 'Encrypted', COLORS.encrypted],
  ['remediation', 'Remediation bar', COLORS.remediation],
];

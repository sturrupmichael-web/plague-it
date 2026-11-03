// Mouse and touch input for the map, using Pointer Events (one code path for both).
//   one finger / mouse drag  → pan
//   two-finger pinch         → zoom (and pan with the midpoint)
//   mouse wheel / trackpad   → zoom at the cursor
//   quick tap or click       → onTap (bubbles first, then sites; decided by the caller)
// Coordinates passed to the callbacks are CSS pixels relative to the element.

const TAP_SLOP = 10; // px a press may wander and still count as a tap
const TAP_MS = 500;

export function attachPointer(el, { onPan, onZoom, onTap }) {
  const pointers = new Map(); // pointerId → { x, y }
  let gesture = null; // { startX, startY, t0, moved, multi }
  let pinch = null; // { dist, mx, my }

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; harmless.
    }
    if (pointers.size === 1) gesture = { startX: x, startY: y, t0: performance.now(), moved: false, multi: false };
    if (pointers.size === 2) {
      if (gesture) gesture.multi = true;
      pinch = pinchInfo();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const [x, y] = local(e);
    if (pointers.size === 1) {
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (gesture && !gesture.moved && Math.hypot(x - gesture.startX, y - gesture.startY) > TAP_SLOP) gesture.moved = true;
      if (gesture?.moved) onPan(dx, dy);
    } else if (pointers.size === 2 && pinch) {
      p.x = x;
      p.y = y;
      const now = pinchInfo();
      if (pinch.dist > 0 && now.dist > 0) onZoom(now.dist / pinch.dist, now.mx, now.my);
      onPan(now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const [x, y] = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      const g = gesture;
      gesture = null;
      if (e.type === 'pointerup' && g && !g.moved && !g.multi && performance.now() - g.t0 < TAP_MS) {
        onTap(x, y, e.pointerType);
      }
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [x, y] = local(e);
      // Pixel-mode deltas from trackpads are small and frequent; line-mode from mice are chunky.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      onZoom(Math.exp(-delta * 0.0015), x, y);
    },
    { passive: false },
  );
}

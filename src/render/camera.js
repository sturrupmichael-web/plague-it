// The map camera: which part of the map is on screen and how zoomed in it is.
// (cx, cy) is the map point at the centre of the screen; zoom is CSS pixels per map unit.
// Zoom is limited between "whole map fits" and maxZoomFactor times that.

export class Camera {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.viewW = 1;
    this.viewH = 1;
    this.cx = worldW / 2;
    this.cy = worldH / 2;
    this.zoom = 1;
    this.fitZoom = 1;
    this.maxZoomFactor = 8;
    this.initialised = false;
  }

  /** Call when the canvas size changes. Keeps the relative zoom level. */
  resize(viewW, viewH) {
    const rel = this.zoom / this.fitZoom;
    this.viewW = viewW;
    this.viewH = viewH;
    this.fitZoom = Math.min(viewW / this.worldW, viewH / this.worldH);
    this.zoom = this.fitZoom * rel;
    if (!this.initialised && viewW > 1 && viewH > 1) {
      this.initialised = true;
      this.reset();
    }
    this.clamp();
  }

  /**
   * The starting view. Landscape screens see the whole map. On a tall phone screen the
   * whole map would be a thin strip, so it starts zoomed in until the map fills about
   * half the height, centred over the Atlantic; pinch out to see everything.
   */
  reset() {
    const tall = this.viewH / this.viewW > (this.worldH / this.worldW) * 1.6;
    this.zoom = tall ? Math.min(this.fitZoom * this.maxZoomFactor, (this.viewH * 0.5) / this.worldH) : this.fitZoom;
    this.zoom = Math.max(this.zoom, this.fitZoom);
    this.cx = tall ? this.worldW * 0.4 : this.worldW / 2;
    this.cy = this.worldH / 2;
    this.clamp();
  }

  worldToScreen(x, y) {
    return [(x - this.cx) * this.zoom + this.viewW / 2, (y - this.cy) * this.zoom + this.viewH / 2];
  }

  screenToWorld(sx, sy) {
    return [(sx - this.viewW / 2) / this.zoom + this.cx, (sy - this.viewH / 2) / this.zoom + this.cy];
  }

  /** Moves the map by a screen-space drag of (dx, dy) pixels. */
  pan(dx, dy) {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clamp();
  }

  /** Zooms by `factor`, keeping the map point under screen (sx, sy) where it is. */
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.fitZoom, Math.min(this.fitZoom * this.maxZoomFactor, this.zoom * factor));
    this.cx = wx - (sx - this.viewW / 2) / this.zoom;
    this.cy = wy - (sy - this.viewH / 2) / this.zoom;
    this.clamp();
  }

  /** Keeps the map on screen: the centre can't leave the visible-map area. */
  clamp() {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    const fitX = halfW * 2 >= this.worldW;
    const fitY = halfH * 2 >= this.worldH;
    this.cx = fitX ? this.worldW / 2 : Math.max(halfW, Math.min(this.worldW - halfW, this.cx));
    this.cy = fitY ? this.worldH / 2 : Math.max(halfH, Math.min(this.worldH - halfH, this.cy));
  }
}

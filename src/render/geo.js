// Map projection: longitude/latitude to map units. The map is WORLD_W units wide
// (equirectangular, cropped to MAP.view's latitudes). Used by rendering only.

export const WORLD_W = 1000;

export function createProjection(map) {
  const { latTop, latBottom } = map.view;
  const scale = WORLD_W / 360;
  return {
    width: WORLD_W,
    height: (latTop - latBottom) * scale,
    project: (lon, lat) => [(lon + 180) * scale, (latTop - lat) * scale],
  };
}

/** Even-odd point-in-polygon test, for polygons of [x, y] points. */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

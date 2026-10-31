// The map: an Albers equal-area conic projection centred on North America, plus insets
// for places drawn away from their real position (Hawaii). The renderer fits the result
// to a map 1000 units wide.
//
// projection: { lon0, lat0, lat1, lat2 }  central meridian, origin latitude, two standard parallels
// insets:     { site: { at: [x, y] } }     where the site's centre is drawn, as fractions of the
//                                          map's width and height (0,0 top left)

export const MAP = {
  projection: { lon0: -100, lat0: 50, lat1: 35, lat2: 65 },
  insets: {
    'us-hi': { at: [0.2, 0.9] },
  },
  /** Extra space around the map, as a share of its width. */
  padding: 0.02,
  /** Where a tall phone screen starts, zoomed in: [lon, lat]. */
  focus: [-90, 40],
};

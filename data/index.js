// Everything in data/, in one object. The engine only ever reads content through this,
// so tests and the build see exactly what the game sees.

import { BALANCE } from './balance.js';
import { STRAINS } from './strains.js';
import { SITES } from './sites.js';
import { LINKS } from './links.js';
import { EVOLUTIONS } from './evolutions.js';
import { RESPONSES } from './responses.js';
import { SCENARIOS } from './scenarios.js';
import { HEADLINES } from './headlines.js';
import { DIFFICULTIES } from './difficulties.js';
import { MAP, LANDMASSES } from './world.js';

export const DATA = {
  balance: BALANCE,
  strains: STRAINS,
  sites: SITES,
  links: LINKS,
  evolutions: EVOLUTIONS,
  responses: RESPONSES,
  scenarios: SCENARIOS,
  headlines: HEADLINES,
  difficulties: DIFFICULTIES,
  map: MAP,
  landmasses: LANDMASSES,
};

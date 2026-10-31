// Balance knobs: the numbers the engine uses that aren't tied to one strain, site or
// evolution. Tune freely; the tests in tests/balance.test.mjs will tell you if a change
// makes a strain impossible to win or impossible to lose.
//
// Units: the simulation advances in fixed "ticks". One tick is one in-game hour.
// At 1× speed the game runs TICKS_PER_SECOND ticks per real second.

export const BALANCE = {
  /** Simulation ticks per real second at 1× speed (2× and 3× multiply this). */
  ticksPerSecond: 12,
  /** In-game hours per tick. Only used for the clock display (Day N, HH:00). */
  hoursPerTick: 1,
  /** The speed buttons. */
  speeds: [1, 2, 3],

  /** Stats are shown as bars from 0 to this. Strain base + evolutions can't exceed it. */
  statMax: 20,

  spread: {
    // Inside a site, each tick: newInfections = within * Spread * susceptibility
    //   * infected * (healthy / devices). Classic logistic growth.
    within: 0.0085,
    // Along a link, each tick: chance to seed one machine at the far site =
    //   between * Spread * linkWeight * (infected / devices at the near site)
    //   * target connectivity * target susceptibility.
    between: 0.006,
    // How much each site trait (0 = wide open, 1 = locked down) cuts susceptibility.
    // susceptibility = (1 - patch*w.patch) * (1 - savvy*w.savvy) * (1 - maturity*w.maturity)
    traitWeights: { patch: 0.55, savvy: 0.45, maturity: 0.35 },
    // Infection only spreads out of a site once it has at least this many infected machines.
    minInfectedToJump: 1,
  },

  /** Link weights by kind: how strongly each kind of network link carries infection. */
  linkKinds: {
    lan: { weight: 1.4, label: 'Campus LAN' },
    wan: { weight: 1.0, label: 'WAN circuit' },
    vpn: { weight: 1.2, label: 'Site VPN' },
    cloud: { weight: 1.1, label: 'Cloud sync' },
    email: { weight: 0.9, label: 'Email flow' },
    airgap: { weight: 0.5, label: 'Sneakernet (air gap)' },
  },

  bubbles: {
    /** Points for the bubble that appears when you first reach a site. */
    siteReached: 4,
    /** Chance per newly infected machine that an infection bubble spawns. */
    perInfectionChance: 0.035,
    /** Points range for an infection bubble (inclusive). */
    infectionValue: [1, 2],
    /** Bubbles vanish after this many ticks if not collected. */
    ttl: 240,
    /** At most this many bubbles on the map at once (new ones are skipped). */
    maxOnMap: 8,
    /** How far (map units) a bubble sits from its site's centre: between jitter[0] and jitter[1]. */
    jitter: [10, 20],
  },

  /** Exploit Points you start the game with. */
  startingPoints: 0,

  /** A world-totals snapshot is recorded every N ticks for the end-screen graph. */
  historyEvery: 24,
};

// Balance knobs: the numbers the engine uses that aren't tied to one strain, site or
// evolution. Tune freely; the tests in tests/balance.test.mjs will tell you if a change
// makes a strain impossible to win or impossible to lose.
//
// Units: the simulation advances in fixed "ticks". One tick is one in-game hour.
// At 1× speed the game runs TICKS_PER_SECOND ticks per real second.

export const BALANCE = {
  /** Simulation ticks per real second at 1× speed (2× and 3× multiply this). */
  ticksPerSecond: 3,
  /** In-game hours per tick. Only used for the clock display (Day N, HH:00). */
  hoursPerTick: 1,
  /** The speed buttons. */
  speeds: [1, 2, 3],

  map: {
    /** One endpoint per this many people in a region's metros. */
    peoplePerDevice: 1000,
    /** Regions with no top-500 metro (the northern territories) still get this many endpoints. */
    minDevices: 30,
  },

  /** Stats are shown as bars from 0 to this. Strain base + evolutions can't exceed it. */
  statMax: 20,

  spread: {
    // Spread has diminishing returns: the engine uses Spread ^ power (6 → 3.5, 12 → 5.7).
    power: 0.7,
    // Inside a site, each tick: newInfections = within * Spread^power * susceptibility
    //   * infected * (healthy / devices). Classic logistic growth.
    within: 0.0145,
    // Along a link, each tick: chance to seed one machine at the far site =
    //   between * Spread^power * linkWeight * (infected / devices at the near site)
    //   * target connectivity * target susceptibility.
    between: 0.0103,
    // How much each site trait (0 = wide open, 1 = locked down) cuts susceptibility.
    // susceptibility = (1 - patch*w.patch) * (1 - savvy*w.savvy) * (1 - maturity*w.maturity)
    traitWeights: { patch: 0.55, savvy: 0.45, maturity: 0.35 },
    // Infection only spreads out of a site once it has at least this many infected machines.
    minInfectedToJump: 1,
  },

  /** Link weights by kind: how strongly each kind of network link carries infection. */
  linkKinds: {
    border: { weight: 1.0, label: 'Shared border' },
    wan: { weight: 1.0, label: 'WAN circuit' },
    vpn: { weight: 1.2, label: 'Site VPN' },
    cloud: { weight: 1.1, label: 'Cloud sync' },
    email: { weight: 0.9, label: 'Email flow' },
    airgap: { weight: 0.5, label: 'Sneakernet (air gap)' },
  },

  bubbles: {
    /** Bubble for being detected (a consolation prize from the chaos). */
    detected: 6,
    /** Points for the bubble that appears when you first reach a site. */
    siteReached: 1,
    /** Each tick, chance of an infection bubble at a site = this × (machines newly infected
     *  there ÷ the site's machines). About this many bubbles per site over its takeover. */
    perShare: 1.2,
    /** Points range for an infection bubble (inclusive). */
    infectionValue: [1, 2],
    /** Bubbles vanish after this many ticks if not collected. */
    ttl: 240,
    /** At most this many bubbles on the map at once (new infection bubbles are skipped). */
    maxOnMap: 8,
    /** How far (map units) a bubble sits from the metro it appears at: between jitter[0] and jitter[1]. */
    jitter: [2, 6],
  },

  /** Exploit Points you start the game with. */
  startingPoints: 0,

  evolve: {
    /** Each evolution already owned in a branch makes the next one in that branch this much dearer (0.15 = +15%). */
    costGrowth: 0.15,
    /** Share of the price paid that devolving gives back. */
    refundRate: 0.5,
  },

  /** Caps on the summed evolution effects, so stacking can't make you untouchable. */
  caps: { remediationResist: 0.6, cleanResist: 0.75, reinfect: 0.9 },

  detection: {
    // Each tick before detection: suspicion += rate × (noise + impact × impactWeight) ^ power
    //   × sqrt(share of all machines infected) × difficulty.detection.
    // SecOps notices when suspicion reaches `threshold`.
    rate: 0.07,
    power: 1.5,
    impactWeight: 0.5,
    threshold: 100,
  },

  remediation: {
    // After detection, the Remediation bar (0–100%) fills each tick by
    //   rate × (1 + impact × impactBoost) × difficulty.remediation × strain remediation
    //   × (1 − remediationResist).
    rate: 0.09,
    impactBoost: 0.04,
    // Machines are cleaned at each site each tick:
    //   cleanRate × (cleanFloor + bar progress 0..1) × (0.5 + site maturity) × infected
    //   × (share of the site's machines still working) × difficulty.remediation × (1 − cleanResist).
    // IT needs working machines to clean with, so a fully compromised site can't be cleaned.
    cleanRate: 0.02,
    cleanFloor: 0.3,
    // Cleaned (remediated) machines can be infected again, but they're patched:
    // they count this much as a healthy machine (raised by `reinfect` effects).
    reinfectFactor: 0.25,
  },

  /** A world-totals snapshot is recorded every N ticks for the end-screen graph. */
  historyEvery: 24,
};

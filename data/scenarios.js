// Scenarios: special setups that change the starting state and the rules. Picked on the
// setup screen; 'standard' (no changes) is always first. src/sim/world.js builds a
// scenario's world from data/ plus these changes, so the engine reads them like any
// other data.
//
// {
//   id, name, tagline, description
//   sites: {                 changes to every connected site (not air-gapped facilities)
//     devices:  × endpoint counts (rounded, at least BALANCE.map.minDevices)
//     traits:   { patch | savvy | maturity: + } added to every site's traits (clamped 0.02..0.95)
//   }
//   balance:  partial BALANCE overrides, deep-merged (e.g. { detection: { rate: 0.04 } })
//   merger: {                part of the map belongs to another company until a day
//     atDay:    the day the acquisition closes and its machines join the network
//     country:  'US' | 'CA': which country's regions are acquired
//     traits:   { patch | savvy | maturity: + } added to the acquired regions (usually negative)
//   }
//   defenseFromStart: true   SecOps' AI runs from day one (alert and funding count from
//                            the start); the Remediation bar still waits for detection
//   patchDeadline: { atDay }  a global patch lands on this day: if you haven't won by then,
//                            you lose
//   scoreMult: × final score (default 1): harder scenarios are worth more
// }

export const SCENARIOS = [
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'A normal week at a normal company.',
    description: 'No twists. The baseline every other scenario changes.',
  },
  {
    id: 'skeleton-crew',
    name: 'Holiday Skeleton Crew',
    scoreMult: 0.9,
    tagline: 'Everyone is out of office.',
    description: 'It\'s the last week of December. Detection is slow and SecOps decides slowly, but with most staff away there are fewer people to click things.',
    sites: { devices: 0.6 },
    balance: {
      detection: { rate: 0.035 },
      spread: { within: 0.012 },
      defense: { decisionEvery: 60, fundingPerDay: 3 },
    },
  },
  {
    id: 'intern-summer',
    name: 'Intern Summer',
    scoreMult: 0.8,
    tagline: 'Everyone clicks everything.',
    description: 'Three hundred interns and a shared password spreadsheet. Users are far less savvy, but the help desk is staffed up and notices sooner.',
    sites: { traits: { savvy: -0.3 } },
    balance: { detection: { rate: 0.11 } },
  },
  {
    id: 'merger',
    name: 'The Merger',
    scoreMult: 1.15,
    tagline: 'Congratulations on the acquisition.',
    description: 'The company is buying a Canadian rival. On day 20 its network joins yours, full of unpatched machines. Canada is off limits until then.',
    merger: { atDay: 20, country: 'CA', traits: { patch: -0.25, maturity: -0.2 } },
  },
  {
    id: 'zero-trust',
    name: 'Zero Trust Rollout',
    scoreMult: 1.6,
    tagline: 'Never trust, always verify, mostly annoy.',
    description: 'Brutal mode. A security overhaul is already underway: SecOps hardens defenses from day one, before it has even noticed you, and every site starts more mature.',
    sites: { traits: { maturity: 0.1, savvy: 0.05 } },
    defenseFromStart: true,
    balance: { defense: { startBudget: 25 } },
  },
  {
    id: 'patch-tuesday',
    name: 'Patch Tuesday',
    scoreMult: 1.3,
    tagline: 'A race against the update.',
    description: 'A company-wide patch lands on day 70 and will wipe you out. Take every machine before it does. Everyone is busy testing the patch, so detection is slower and unpatched machines fall faster.',
    patchDeadline: { atDay: 70 },
    balance: { detection: { rate: 0.045 }, spread: { within: 0.0175, between: 0.012 } },
  },
];

// Evolutions: what you spend Exploit Points on, in three branches.
//
// {
//   id:          string, unique (links and other evolutions refer to it). Don't rename
//                once released: saves and scores will refer to it.
//   branch:      'vectors' (how you spread) | 'payloads' (symptoms) | 'abilities' (resistances)
//   name:        display name
//   description: what it does, in game terms (abstract flavour only)
//   cost:        base Exploit Point cost. The real price grows with every evolution you
//                already own in the same branch: cost × (1 + BALANCE.evolve.costGrowth × owned),
//                times the strain's evolveCost modifier.
//   prereqs:     ids in the SAME branch that must ALL be owned first ([] for roots).
//                You can't devolve something while an evolution that needs it is owned.
//   effects: {   all optional; they add up across everything you own
//     spread, noise, impact      added to the three core stats (can be negative)
//     tagSpread: { tag: x }       +x (e.g. 0.25 = +25%) spread inside regions with that tag
//                                 (tags are listed in data/sites.js TAGS; a region with two
//                                 matching tags gets both)
//     remediationResist: x       remediation progresses x slower (0.15 = 15% slower; total capped)
//     cleanResist: x             infected machines are x harder to clean (total capped)
//     reinfect: x                cleaned machines are x easier to re-infect
//     pointsPerDay: x            Exploit Points per in-game day, at 100% of machines infected
//                                (scaled by the share you've infected)
//     jump: x                    chance per tick (at 100% infected) to seed a random connected
//                                site, ignoring links
//   },
//   pos: { col, row }  where the node sits in its branch's tree: row 0 at the top, col 0
//                      on the left. Each (col, row) must be unique within a branch.
// }
//
// Links in data/links.js can name an evolution in `requires`; owning it opens the link.

export const EVOLUTIONS = [
  // ── Vectors: how you spread ────────────────────────────────────────────────
  {
    id: 'email-attachments', branch: 'vectors', name: 'Email Attachments',
    description: 'Hitch a ride on invoices nobody ordered. Opens email links and spreads better in corporate and finance regions.',
    cost: 5, prereqs: [], effects: { spread: 1, noise: 1, tagSpread: { corporate: 0.15, finance: 0.15 } }, pos: { col: 0, row: 0 },
  },
  {
    id: 'usb-drives', branch: 'vectors', name: 'USB Drives',
    description: 'The free conference thumb drive strikes again. Strong in logistics, retail and manufacturing regions.',
    cost: 5, prereqs: [], effects: { spread: 1, tagSpread: { logistics: 0.25, retail: 0.15, manufacturing: 0.25 } }, pos: { col: 2, row: 0 },
  },
  {
    id: 'shared-drives', branch: 'vectors', name: 'Shared Drives',
    description: 'Every team folder named "FINAL" is a home. Big boost in corporate and finance regions.',
    cost: 8, prereqs: ['email-attachments'], effects: { spread: 1, noise: 1, tagSpread: { corporate: 0.2, finance: 0.2 } }, pos: { col: 0, row: 1 },
  },
  {
    id: 'printers', branch: 'vectors', name: 'Networked Printers',
    description: 'Nobody has ever updated a printer. Spreads quietly wherever paper jams.',
    cost: 7, prereqs: ['usb-drives'], effects: { spread: 1, tagSpread: { corporate: 0.1, government: 0.15, logistics: 0.15 } }, pos: { col: 2, row: 1 },
  },
  {
    id: 'guest-wifi', branch: 'vectors', name: 'Guest Wi-Fi',
    description: 'The password is on a laminated card at the till. Huge boost in retail and tourism regions.',
    cost: 8, prereqs: ['usb-drives'], effects: { spread: 1, noise: 1, tagSpread: { retail: 0.4, tourism: 0.3 } }, pos: { col: 3, row: 1 },
  },
  {
    id: 'vpn-tunnels', branch: 'vectors', name: 'VPN Tunnels',
    description: 'Ride the remote-access tunnels between branches. Opens VPN links between distant offices.',
    cost: 10, prereqs: ['shared-drives'], effects: { spread: 1, noise: 1 }, pos: { col: 0, row: 2 },
  },
  {
    id: 'cloud-sync', branch: 'vectors', name: 'Cloud Sync',
    description: 'Every synced folder is a free plane ticket. Opens cloud links across the continent and boosts tech regions.',
    cost: 13, prereqs: ['vpn-tunnels'], effects: { spread: 1, noise: 1, tagSpread: { tech: 0.3 } }, pos: { col: 1, row: 3 },
  },
  {
    id: 'poisoned-update', branch: 'vectors', name: 'Poisoned Software Update',
    description: 'Ship yourself inside the company\'s own update. Jumps straight to random sites, links or not. Very loud.',
    cost: 22, prereqs: ['cloud-sync', 'printers'], effects: { spread: 2, noise: 3, jump: 0.05 }, pos: { col: 2, row: 4 },
  },

  // ── Payloads: symptoms. Early ones are quiet, late ones are loud. ──────────
  {
    id: 'popups', branch: 'payloads', name: 'Pop-ups',
    description: 'Congratulations, you are the millionth visitor. A trickle of ad money, and only a little suspicious.',
    cost: 4, prereqs: [], effects: { impact: 1, noise: 1, pointsPerDay: 1 }, pos: { col: 1, row: 0 },
  },
  {
    id: 'slowness', branch: 'payloads', name: 'Mysterious Slowness',
    description: 'Everything takes a little longer. Users blame Mondays. Makes clean-up crews slower too.',
    cost: 5, prereqs: ['popups'], effects: { impact: 1, cleanResist: 0.05 }, pos: { col: 0, row: 1 },
  },
  {
    id: 'wallpaper', branch: 'payloads', name: 'Wallpaper Swap',
    description: 'Every desktop is now a picture of a very serious goose. Mostly harmless. Mostly.',
    cost: 4, prereqs: ['popups'], effects: { impact: 1, noise: 1, pointsPerDay: 1 }, pos: { col: 2, row: 1 },
  },
  {
    id: 'crypto-mining', branch: 'payloads', name: 'Crypto-Mining',
    description: 'The fans spin up and the points roll in. Steady Exploit Point income from every infected machine.',
    cost: 10, prereqs: ['slowness'], effects: { impact: 2, noise: 1, pointsPerDay: 5 }, pos: { col: 0, row: 2 },
  },
  {
    id: 'data-theft', branch: 'payloads', name: 'Data Theft',
    description: 'Quietly copy the spreadsheets nobody reads. Pays well, but someone eventually notices the bandwidth.',
    cost: 12, prereqs: ['wallpaper'], effects: { impact: 2, noise: 2, pointsPerDay: 6 }, pos: { col: 2, row: 2 },
  },
  {
    id: 'screen-lock', branch: 'payloads', name: 'Screen Lock',
    description: 'Nobody can log in, including the people trying to clean you up. Loud.',
    cost: 15, prereqs: ['crypto-mining', 'data-theft'], effects: { impact: 4, noise: 3, cleanResist: 0.2 }, pos: { col: 1, row: 3 },
  },
  {
    id: 'encryption', branch: 'payloads', name: 'Encryption',
    description: 'Every file becomes a very expensive puzzle. Cleaning crews stall, but the whole company is now watching.',
    cost: 20, prereqs: ['screen-lock'], effects: { impact: 5, noise: 4, cleanResist: 0.25, remediationResist: 0.1 }, pos: { col: 1, row: 4 },
  },
  {
    id: 'bricking', branch: 'payloads', name: 'Bricked Machines',
    description: 'Turn laptops into doorstops. Remediation crawls when IT has nothing left to work on.',
    cost: 25, prereqs: ['encryption'], effects: { impact: 6, noise: 4, remediationResist: 0.2 }, pos: { col: 1, row: 5 },
  },

  // ── Abilities: resistances ────────────────────────────────────────────────
  {
    id: 'av-evasion', branch: 'abilities', name: 'Antivirus Evasion',
    description: 'Look boring to the scanner. Lowers noise.',
    cost: 6, prereqs: [], effects: { noise: -2 }, pos: { col: 1, row: 0 },
  },
  {
    id: 'patch-resistance', branch: 'abilities', name: 'Patch Resistance',
    description: 'Shrug off the first round of fixes. Slows remediation and makes cleaned machines easier to retake.',
    cost: 9, prereqs: ['av-evasion'], effects: { remediationResist: 0.15, reinfect: 0.3 }, pos: { col: 0, row: 1 },
  },
  {
    id: 'persistence', branch: 'abilities', name: 'Reboot Persistence',
    description: 'Have you tried turning it off and on again? It didn\'t help. Infected machines are harder to clean.',
    cost: 9, prereqs: ['av-evasion'], effects: { cleanResist: 0.25 }, pos: { col: 2, row: 1 },
  },
  {
    id: 'patch-resistance-2', branch: 'abilities', name: 'Self-Repairing Core',
    description: 'Every fix gets undone overnight. Slows remediation a lot.',
    cost: 18, prereqs: ['patch-resistance'], effects: { remediationResist: 0.2, reinfect: 0.3 }, pos: { col: 0, row: 2 },
  },
  {
    id: 'sleep-timer', branch: 'abilities', name: 'Sleep Timer',
    description: 'Only wake up when nobody is looking. Lowers noise a lot.',
    cost: 11, prereqs: ['persistence'], effects: { noise: -3 }, pos: { col: 1, row: 2 },
  },
  {
    id: 'deep-persistence', branch: 'abilities', name: 'Deep Persistence',
    description: 'Hide below the operating system, where the cleaning tools don\'t look.',
    cost: 15, prereqs: ['persistence'], effects: { cleanResist: 0.25, remediationResist: 0.05 }, pos: { col: 2, row: 2 },
  },
  {
    id: 'air-gap-hop', branch: 'abilities', name: 'Air-Gap Hopping',
    description: 'Wait patiently on a maintenance USB stick. Reaches isolated sites like the air-gapped factory floor.',
    cost: 14, prereqs: ['persistence'], effects: { noise: 1 }, pos: { col: 3, row: 2 },
  },
  {
    id: 'hide-in-plain-sight', branch: 'abilities', name: 'Hide in Plain Sight',
    description: 'Dress up as the IT department\'s own tools. Lowers noise and slows remediation.',
    cost: 16, prereqs: ['sleep-timer', 'patch-resistance'], effects: { noise: -2, remediationResist: 0.1 }, pos: { col: 1, row: 3 },
  },
];

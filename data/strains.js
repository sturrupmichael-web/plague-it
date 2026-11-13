// Strains: the malware you play. Beating a strain (on any difficulty) unlocks the next.
//
// {
//   id:          string, unique, used in saves (don't rename once released)
//   name:        display name
//   tagline:     one line for the setup screen
//   description: a sentence or two on how it plays
//   unlockedBy:  id of the strain you must beat to unlock this one, or null (always unlocked)
//   base: {      starting stats, on the 0..BALANCE.statMax scale
//     spread:    how fast it moves between machines and sites
//     noise:     how visible it is (drives detection)
//     impact:    how much damage it does (drives defender funding and remediation)
//   },
//   modifiers: { optional multipliers, all default to 1 when omitted:
//     withinSite:      × spread inside a site
//     betweenSites:    × chance to jump along links
//     bubbleChance:    × chance an infection drops an Exploit Point bubble
//     bubbleValue:     × points per bubble
//     evolveCost:      × evolution costs
//     remediation:     × remediation speed (the bar and cleaning)
//     detection:       × how fast suspicion builds before detection
//   },
//   special: {   optional strain mechanics:
//     startsWith:    evolution ids owned from the start, for free (no refund if devolved)
//     tagSpread:     { tag: x } built-in spread bonus in regions with that tag (like the effect)
//     linkWeights:   { link kind: × } how well it travels over that kind of link
//     pointsPerDay:  built-in Exploit Point income at 100% infected (scaled by share infected)
//     cleanResist:   built-in resistance to cleaning (added to evolutions', still capped)
//     statMult:      { spread | noise | impact: × } applied to what evolutions add to that stat
//     evolutionCost: { evolution id: × } cheaper or dearer specific evolutions
//     mutation:      { everyDays, gainChance } every N days it mutates: with gainChance it
//                    gains a random evolution it could buy, for free; otherwise it loses a
//                    random owned one (one nothing else needs), with no refund
//     ransom:        { encryptRate, remediation, budget }: the Encrypt button. Once pressed,
//                    each tick encryptRate of each site's unencrypted infected machines get
//                    encrypted (they can't be cleaned, only reimaged). SecOps is alerted at
//                    once (detected, alert maxed, `budget` extra funding) and remediation
//                    runs × `remediation`. You win when every machine is encrypted.
//   },
// }

export const STRAINS = [
  {
    id: 'worm',
    name: 'Worm',
    tagline: 'Fast, loud, and proud of it.',
    description: 'The beginner strain. Tears through networks on its own, but nobody could call it subtle.',
    unlockedBy: null,
    base: { spread: 6, noise: 7, impact: 1 },
    modifiers: { withinSite: 1.15, betweenSites: 1.2 },
  },
  {
    id: 'trojan',
    name: 'Trojan',
    tagline: 'Looks like a calendar invite. Isn\'t.',
    description: 'Starts slow but stays nearly invisible. SecOps takes far longer to notice, so you have time to build before you go loud.',
    unlockedBy: 'worm',
    base: { spread: 4, noise: 3, impact: 0 },
    modifiers: { withinSite: 0.95, betweenSites: 0.95, detection: 0.7 },
  },
  {
    id: 'macro',
    name: 'Macro Virus',
    tagline: 'Please enable content to view this document.',
    description: 'Lives in shared documents. Starts with Email Attachments, travels twice as well over email links, and thrives in corporate, finance and government regions. Weak everywhere else.',
    unlockedBy: 'trojan',
    base: { spread: 4, noise: 4, impact: 1 },
    modifiers: { withinSite: 1, betweenSites: 1 },
    special: {
      startsWith: ['email-attachments'],
      tagSpread: { corporate: 0.35, finance: 0.35, government: 0.25 },
      linkWeights: { email: 2 },
      evolutionCost: { 'shared-drives': 0.5, 'cloud-sync': 0.6 },
    },
  },
  {
    id: 'botnet',
    name: 'Botnet',
    tagline: 'Every laptop a little earner.',
    description: 'Barely hurts anyone, which keeps SecOps\' budget small. Earns Exploit Points from every infected machine, but payloads only do half the damage.',
    unlockedBy: 'macro',
    base: { spread: 4, noise: 6, impact: 0 },
    modifiers: { bubbleValue: 0.8 },
    special: { pointsPerDay: 5, statMult: { impact: 0.5 } },
  },
  {
    id: 'rootkit',
    name: 'Rootkit',
    tagline: 'Below the OS, beyond reach.',
    description: 'Hard to clean and slow to remediate, but buried this deep, every evolution costs more.',
    unlockedBy: 'botnet',
    base: { spread: 5, noise: 5, impact: 1 },
    modifiers: { remediation: 0.7, evolveCost: 1.2 },
    special: { cleanResist: 0.25 },
  },
  {
    id: 'polymorphic',
    name: 'Polymorphic',
    tagline: 'Never the same twice.',
    description: 'Mutates on its own every few days: usually it picks up a free evolution, sometimes it sheds one you paid for. Good or bad, SecOps can\'t pin it down.',
    unlockedBy: 'rootkit',
    base: { spread: 5, noise: 5, impact: 1 },
    modifiers: { evolveCost: 1.1 },
    special: { mutation: { everyDays: 5, gainChance: 0.65 } },
  },
  {
    id: 'ransomware',
    name: 'Ransomware',
    tagline: 'Your files are now a hostage negotiation.',
    description: 'A quiet spreader with one huge finisher. Press Encrypt and every infected machine starts locking up, but everyone notices at once. Win by encrypting every machine, so time it right.',
    unlockedBy: 'polymorphic',
    base: { spread: 5, noise: 4, impact: 0 },
    special: { ransom: { encryptRate: 0.03, remediation: 1.3, budget: 60 } },
  },
];

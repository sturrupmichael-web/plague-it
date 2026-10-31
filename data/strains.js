// Strains: the malware you play. Each strain is one object:
//
// {
//   id:          string, unique, used in saves (don't rename once released)
//   name:        display name
//   tagline:     one line for the setup screen
//   description: a sentence or two on how it plays
//   unlockedBy:  id of the strain you must beat to unlock this one, or null (always unlocked)
//   base: {      starting stats, on the 0..BALANCE.statMax scale
//     spread:    how fast it moves between machines and sites
//     noise:     how visible it is (drives detection, Phase 2)
//     impact:    how much damage it does (drives defender funding, Phase 3)
//   },
//   modifiers: { optional multipliers, all default to 1 when omitted:
//     withinSite:      × spread inside a site
//     betweenSites:    × chance to jump along links
//     bubbleChance:    × chance an infection drops an Exploit Point bubble
//     bubbleValue:     × points per bubble
//     evolveCost:      × evolution costs (Phase 2)
//     remediation:     × remediation speed (Phase 2)
//   },
// }
//
// Phase 1 ships only the Worm. Phase 4 adds the other six.

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
];

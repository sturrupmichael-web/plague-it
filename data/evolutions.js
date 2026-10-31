// Evolutions: what you spend Exploit Points on, in three branches.
//
// {
//   id:          string, unique (links and other evolutions refer to it)
//   branch:      'vectors' (how you spread) | 'payloads' (symptoms) | 'abilities' (resistances)
//   name:        display name
//   description: what it does, in game terms (abstract flavour only)
//   cost:        base Exploit Point cost. The real price rises with every evolution you
//                already own in the same branch (BALANCE.evolve, Phase 2).
//   prereqs:     ids that must ALL be owned before this can be bought ([] for roots)
//   effects: {   added to your stats while owned (any may be omitted or negative)
//     spread, noise, impact
//   },
//   pos: { col, row }  where the node sits in its branch's hex tree (Phase 2)
// }
//
// Links in data/links.js can name an evolution in `requires`; owning it opens the link.
//
// Phase 1 includes only the evolutions that links depend on, so the data tests can check
// the references. Phase 2 fills in the full Vectors, Payloads and Abilities trees.

export const EVOLUTIONS = [
  {
    id: 'email-attachments', branch: 'vectors', name: 'Email Attachments',
    description: 'Hitch a ride on invoices nobody ordered. Opens email links between sites.',
    cost: 6, prereqs: [], effects: { spread: 1, noise: 1 }, pos: { col: 0, row: 0 },
  },
  {
    id: 'vpn-tunnels', branch: 'vectors', name: 'VPN Tunnels',
    description: 'Ride the remote-access tunnels between branches. Opens VPN links.',
    cost: 9, prereqs: ['email-attachments'], effects: { spread: 1, noise: 1 }, pos: { col: 1, row: 0 },
  },
  {
    id: 'cloud-sync', branch: 'vectors', name: 'Cloud Sync',
    description: 'Every synced folder is a free plane ticket. Opens cloud links across oceans.',
    cost: 12, prereqs: ['vpn-tunnels'], effects: { spread: 2, noise: 1 }, pos: { col: 2, row: 0 },
  },
  {
    id: 'air-gap-hop', branch: 'abilities', name: 'Air-Gap Hopping',
    description: 'Wait patiently on a maintenance USB stick. Reaches isolated sites.',
    cost: 18, prereqs: [], effects: { noise: 1 }, pos: { col: 0, row: 0 },
  },
];

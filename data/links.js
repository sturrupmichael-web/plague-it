// Network links between sites. Infection travels along links on its own.
//
// {
//   from, to:  site ids (links work in both directions)
//   kind:      'lan' | 'wan' | 'vpn' | 'cloud' | 'email' | 'airgap'
//              (weights and labels are in BALANCE.linkKinds)
//   requires:  id of an evolution that must be owned for this link to carry infection,
//              or null if it is always open. Locked links are drawn faintly on the map.
// }
//
// Keep every non-air-gapped site reachable through links with requires: null, so every
// strain can win without a particular vector. The data tests check this.

export const LINKS = [
  // North America backbone
  { from: 'hq', to: 'hq-finance', kind: 'lan', requires: null },
  { from: 'hq', to: 'dc-east', kind: 'wan', requires: null },
  { from: 'dc-east', to: 'cloud-west', kind: 'wan', requires: null },
  { from: 'hq', to: 'retail-midwest', kind: 'wan', requires: null },
  { from: 'dc-east', to: 'warehouse-south', kind: 'wan', requires: null },
  { from: 'warehouse-south', to: 'factory', kind: 'airgap', requires: 'air-gap-hop' },
  { from: 'retail-midwest', to: 'warehouse-south', kind: 'vpn', requires: 'vpn-tunnels' },
  { from: 'dc-east', to: 'retail-latam', kind: 'wan', requires: null },

  // Transatlantic and Europe
  { from: 'hq', to: 'office-london', kind: 'wan', requires: null },
  { from: 'dc-east', to: 'dc-central', kind: 'wan', requires: null },
  { from: 'office-london', to: 'dc-central', kind: 'wan', requires: null },
  { from: 'dc-central', to: 'warehouse-port', kind: 'wan', requires: null },
  { from: 'office-london', to: 'retail-iberia', kind: 'vpn', requires: 'vpn-tunnels' },
  { from: 'dc-central', to: 'retail-iberia', kind: 'wan', requires: null },
  { from: 'hq-finance', to: 'office-london', kind: 'email', requires: 'email-attachments' },

  // Middle East and Asia Pacific
  { from: 'dc-central', to: 'office-gulf', kind: 'wan', requires: null },
  { from: 'office-gulf', to: 'office-asia', kind: 'wan', requires: null },
  { from: 'dc-central', to: 'office-asia', kind: 'wan', requires: null },
  { from: 'office-asia', to: 'warehouse-asia', kind: 'wan', requires: null },
  { from: 'office-asia', to: 'office-sydney', kind: 'wan', requires: null },
  { from: 'warehouse-asia', to: 'retail-tokyo', kind: 'vpn', requires: 'vpn-tunnels' },
  { from: 'office-asia', to: 'retail-tokyo', kind: 'wan', requires: null },

  // Cloud sync shortcuts across the world
  { from: 'cloud-west', to: 'office-asia', kind: 'cloud', requires: 'cloud-sync' },
  { from: 'cloud-west', to: 'office-sydney', kind: 'cloud', requires: 'cloud-sync' },
  { from: 'cloud-west', to: 'office-london', kind: 'cloud', requires: 'cloud-sync' },
  { from: 'hq', to: 'retail-latam', kind: 'email', requires: 'email-attachments' },
];

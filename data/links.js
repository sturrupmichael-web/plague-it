// Network links between sites, on top of borders (neighbouring regions always connect,
// and infection crosses borders on its own).
//
// {
//   from, to:  site ids (links work in both directions)
//   kind:      'wan' | 'vpn' | 'cloud' | 'email' | 'airgap'  (weights in BALANCE.linkKinds)
//   requires:  id of an evolution that must be owned for this link to carry infection,
//              or null if it is always open. Locked links are drawn faintly on the map.
// }
//
// Keep every non-air-gapped site reachable over borders and always-open links, so every
// strain can win without a particular vector. The data tests check this.

const wan = (from, to) => ({ from, to, kind: 'wan', requires: null });
const vpn = (from, to) => ({ from, to, kind: 'vpn', requires: 'vpn-tunnels' });
const cloud = (from, to) => ({ from, to, kind: 'cloud', requires: 'cloud-sync' });
const email = (from, to) => ({ from, to, kind: 'email', requires: 'email-attachments' });

export const LINKS = [
  // Always-open WAN backbone between the big hubs (and to the islands).
  wan('us-ny', 'us-il'), wan('us-il', 'us-tx'), wan('us-tx', 'us-ca'), wan('us-ny', 'us-ga'),
  wan('us-ga', 'us-tx'), wan('us-ca', 'us-wa'), wan('us-il', 'us-co'), wan('us-ny', 'ca-on'),
  wan('ca-on', 'ca-qc'), wan('ca-on', 'ca-ab'), wan('ca-ab', 'ca-bc'), wan('us-ca', 'us-hi'),
  wan('ca-ns', 'ca-pe'), wan('ca-nb', 'ca-pe'), wan('ca-qc', 'ca-nl'), wan('us-wa', 'us-ak'),

  // VPN tunnels: long-distance shortcuts between offices.
  vpn('us-ny', 'us-ca'), vpn('us-ny', 'us-fl'), vpn('us-il', 'us-ga'), vpn('us-tx', 'us-fl'),
  vpn('ca-on', 'ca-bc'), vpn('us-ma', 'us-nc'), vpn('us-co', 'us-az'), vpn('us-mn', 'us-mo'),

  // Cloud sync: the Pacific Northwest cloud region reaches everywhere big.
  cloud('us-or', 'us-ny'), cloud('us-or', 'us-tx'), cloud('us-or', 'ca-on'), cloud('us-or', 'us-va'),
  cloud('us-or', 'us-fl'), cloud('us-or', 'ca-qc'), cloud('us-va', 'us-il'),

  // Email: finance and head-office chatter.
  email('us-ny', 'ca-on'), email('us-ny', 'us-ct'), email('us-ny', 'us-il'), email('us-il', 'us-ca'),
  email('us-dc', 'us-ny'), email('ca-on', 'ca-ab'),

  // The air gap: only Air-Gap Hopping gets across.
  { from: 'us-mi', to: 'factory', kind: 'airgap', requires: 'air-gap-hop' },
];

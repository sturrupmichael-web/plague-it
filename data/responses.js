// Defender responses: SecOps' escalating countermeasures, your equivalent of closing
// ports and airports. Once you're detected, the defender AI (src/sim/defense.js) gets
// funding every hour and, every few hours, picks one of these: weighted by `weight` and
// `triggers`, limited to ones its alert level allows, and paid for from its budget.
//
// {
//   id:          string, unique. Don't rename once released (saves and logs refer to it).
//   name:        display name, e.g. 'Block Email Attachments'
//   description: what it does, shown in the site panel and the evolution screen
//   headline:    news ticker line when it happens. {site} = the target's name.
//   scope:       'global' (once per game, everywhere) | 'site' (one site at a time; can be
//                used again on other sites, at most `maxUses` times in all)
//   maxUses:     site scope only: how many sites it can hit in one game (default 1)
//   minAlert:    defender alert (0..1) needed before it's considered. Alert rises with the
//                days since detection and the share of machines you hold.
//   cost:        funding it costs. The AI saves up if it picks one it can't afford yet.
//   weight:      base attractiveness (relative to the others)
//   triggers:    { evolution id: extra weight if you own it,
//                  'spread' | 'noise' | 'impact': extra weight per 10 points of that stat }
//                Extra weight is multiplied by the difficulty's `smarts`.
//   target:      site scope only: how the site is chosen
//                'mostInfected'  the site with the most infected machines
//                'link:<kind>'   the most infected site that still has an open link of that kind
//   duration:    ticks (hours) before it's lifted; omit for permanent
//   counteredBy: evolution ids. Owning any of them halves the response's effect
//                (BALANCE.defense.counterFactor), including if you buy it afterwards.
//   effects: {   all optional
//     closesLinks: link kinds it shuts ('email', 'vpn', 'cloud', 'wan', 'airgap', 'border',
//                  or '*' for all). Global: everywhere. Site: links touching that site.
//     blocks:      evolution ids whose spread bonuses stop working (noise stays)
//     traits:      { patch, savvy, maturity }: added to the affected sites' traits
//     spread:      × spread inside the affected sites (e.g. 0.4)
//     remediation: × how fast the Remediation bar fills (global)
//     cleanNow:    site scope: this share of the site's infected machines is cleaned at once
//   }
// }

export const RESPONSES = [
  {
    id: 'block-attachments', name: 'Block Email Attachments', scope: 'global',
    description: 'Attachments are stripped at the mail gateway. Closes email links and stops email-borne spread.',
    headline: 'IT reminds staff not to open Invoice_FINAL_v2_REAL.exe, then blocks it anyway',
    minAlert: 0, cost: 18, weight: 2,
    triggers: { 'email-attachments': 4, 'shared-drives': 1.5 },
    counteredBy: ['av-evasion'],
    effects: { closesLinks: ['email'], blocks: ['email-attachments'] },
  },
  {
    id: 'disable-usb', name: 'Disable USB Ports', scope: 'global',
    description: 'Every USB port gets glued shut by policy. Stops USB-borne spread.',
    headline: 'Staff told to hand in all thumb drives; desk drawers yield 4,000 of them',
    minAlert: 0, cost: 18, weight: 1.5,
    triggers: { 'usb-drives': 4, 'printers': 1 },
    counteredBy: ['persistence'],
    effects: { blocks: ['usb-drives', 'printers'] },
  },
  {
    id: 'password-reset', name: 'Force Password Resets', scope: 'global',
    description: 'Everyone picks a new password. Users get a little warier everywhere.',
    headline: 'Company-wide password reset; help desk wait times reach 4 hours',
    minAlert: 0.15, cost: 22, weight: 1.5,
    triggers: { 'data-theft': 3, 'guest-wifi': 1, noise: 1 },
    counteredBy: ['hide-in-plain-sight'],
    effects: { traits: { savvy: 0.12 } },
  },
  {
    id: 'mfa', name: 'Roll Out MFA', scope: 'global',
    description: 'Every login needs a second factor. Closes cloud links and makes users warier.',
    headline: 'MFA rollout complete; sales team now carries three phones each',
    minAlert: 0.3, cost: 35, weight: 1.5,
    triggers: { 'cloud-sync': 4, 'vpn-tunnels': 1.5, 'guest-wifi': 1 },
    counteredBy: ['hide-in-plain-sight'],
    effects: { closesLinks: ['cloud'], blocks: ['cloud-sync', 'guest-wifi'], traits: { savvy: 0.08 } },
  },
  {
    id: 'emergency-patch', name: 'Emergency Patch', scope: 'global',
    description: 'An out-of-band patch goes to every machine. Raises patch levels everywhere.',
    headline: 'Emergency patch rolls out at 2 a.m.; exactly one laptop reboots mid-presentation',
    minAlert: 0.2, cost: 30, weight: 2,
    triggers: { spread: 2, 'printers': 1 },
    counteredBy: ['patch-resistance'],
    effects: { traits: { patch: 0.2 }, remediation: 1.1 },
  },
  {
    id: 'cut-vpn', name: 'Cut a Site\'s VPN', scope: 'site', maxUses: 3, target: 'link:vpn',
    description: 'Remote access to this site is switched off. Closes its VPN links.',
    headline: '{site} staff told to "just come into the office" as VPN goes dark',
    minAlert: 0.25, cost: 15, weight: 1.5,
    triggers: { 'vpn-tunnels': 4 },
    counteredBy: ['cloud-sync'],
    effects: { closesLinks: ['vpn'] },
  },
  {
    id: 'isolate-site', name: 'Isolate Site', scope: 'site', maxUses: 3, target: 'mostInfected', duration: 240,
    description: 'The site is cut off from the network for 10 days. Nothing gets in or out, and spread inside slows.',
    headline: '{site} unplugged from the network; staff rediscover the fax machine',
    minAlert: 0.45, cost: 45, weight: 1.5,
    triggers: { spread: 2, 'poisoned-update': 2 },
    counteredBy: ['poisoned-update'],
    effects: { closesLinks: ['*'], spread: 0.4, traits: { maturity: 0.15 } },
  },
  {
    id: 'reimage', name: 'Reimage from Backup', scope: 'site', maxUses: 4, target: 'mostInfected',
    description: 'Wipe and restore the site\'s machines from backup. Cleans a big share of its infection at once.',
    headline: '{site} reimaged from backup; everyone\'s desktop shortcuts are gone and morale is low',
    minAlert: 0.6, cost: 60, weight: 2,
    triggers: { impact: 2, 'encryption': 2, 'bricking': 2 },
    counteredBy: ['deep-persistence'],
    effects: { cleanNow: 0.4, traits: { patch: 0.1 } },
  },
];

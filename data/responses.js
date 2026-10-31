// Defender responses (Phase 3): SecOps' escalating countermeasures, chosen by the
// defender AI from these entries. Schema, for when the list is filled in:
//
// {
//   id:          string, unique
//   name:        display name, e.g. 'Block Email Attachments'
//   headline:    ticker line announced when it happens
//   minAlert:    defender alert level needed before this can be chosen (0..1)
//   cost:        defender funding needed
//   weight:      how attractive it is to the AI; scaled up by `triggers`
//   triggers:    { evolution id or stat name: extra weight } (e.g. { 'email-attachments': 3 })
//   effects: {
//     closesLinks:   link kinds it shuts, e.g. ['email']
//     siteTraits:    { patch: +0.2, ... } added to affected sites
//     remediation:   × remediation speed
//   },
//   scope:       'global' | 'site' (site-scoped ones pick the worst-hit site)
// }

export const RESPONSES = [];

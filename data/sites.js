// Sites: the company's locations on the map. Each site is a pool of endpoints
// (laptops, desktops, scanners, servers) that the simulation tracks as counts.
//
// {
//   id:        string, unique
//   name:      display name
//   type:      'hq' | 'office' | 'warehouse' | 'retail' | 'datacenter' | 'cloud' | 'factory'
//              (only affects the icon and flavour text)
//   lon, lat:  real-world position in degrees (east and north are positive). The map
//              projects these, so you can place a site by looking up a city.
//   devices:   number of endpoints at the site
//   traits: {  each 0..1, where 0 = wide open and 1 = locked down
//     patch:        how up to date the machines are
//     savvy:        how suspicious the users are of odd attachments and prompts
//     maturity:     the site's security tooling and process
//     connectivity: how well-connected the site is (0..1, 1 = busy hub). Unlike the
//                   others, HIGHER connectivity makes the site EASIER to reach.
//   },
//   airGapped: true if the site is isolated; it can only be reached over 'airgap' links,
//              which need the air-gap hopping ability. Patient zero can't start here.
//   blurb:     flavour line for the site panel
// }
//
// Balance tip: susceptibility (how easily machines there get infected) is worked out from
// patch, savvy and maturity using BALANCE.spread.traitWeights.

export const SITES = [
  {
    id: 'hq', name: 'Headquarters', type: 'hq', lon: -74.0, lat: 40.7, devices: 900,
    traits: { patch: 0.65, savvy: 0.5, maturity: 0.65, connectivity: 1.0 },
    blurb: 'Glass, open-plan desks and a lobby screen showing the share price.',
  },
  {
    id: 'hq-finance', name: 'HQ Finance', type: 'office', lon: -73.2, lat: 42.4, devices: 180,
    traits: { patch: 0.7, savvy: 0.92, maturity: 0.7, connectivity: 0.7 },
    blurb: 'Has seen too many phishing tests. Reports the fire drill email as suspicious.',
  },
  {
    id: 'dc-east', name: 'East Data Center', type: 'datacenter', lon: -78.5, lat: 38.2, devices: 420,
    traits: { patch: 0.6, savvy: 0.7, maturity: 0.75, connectivity: 0.95 },
    blurb: 'Cold aisles, warm tempers. Change freeze in effect since 2019.',
  },
  {
    id: 'cloud-west', name: 'Cloud Region West', type: 'cloud', lon: -121.5, lat: 45.5, devices: 360,
    traits: { patch: 0.8, savvy: 0.6, maturity: 0.6, connectivity: 0.9 },
    blurb: 'Someone else\'s computer, billed by the hour. Nobody remembers who owns half of it.',
  },
  {
    id: 'retail-midwest', name: 'Lakeside Retail Branch', type: 'retail', lon: -87.6, lat: 41.9, devices: 140,
    traits: { patch: 0.35, savvy: 0.25, maturity: 0.3, connectivity: 0.55 },
    blurb: 'Point-of-sale terminals and one shared back-office PC with the password on a sticky note.',
  },
  {
    id: 'warehouse-south', name: 'Gulf Distribution Warehouse', type: 'warehouse', lon: -96.8, lat: 32.8, devices: 260,
    traits: { patch: 0.08, savvy: 0.2, maturity: 0.2, connectivity: 0.5 },
    blurb: 'The barcode scanners run an operating system older than the forklift drivers.',
  },
  {
    id: 'factory', name: 'Factory Floor', type: 'factory', lon: -100.3, lat: 25.7, devices: 300,
    traits: { patch: 0.05, savvy: 0.35, maturity: 0.5, connectivity: 0.15 },
    airGapped: true,
    blurb: 'Air-gapped line controllers. Updates arrive on a USB stick, hand-carried, once a quarter.',
  },
  {
    id: 'retail-latam', name: 'Southern Cone Retail', type: 'retail', lon: -46.6, lat: -23.5, devices: 160,
    traits: { patch: 0.3, savvy: 0.3, maturity: 0.3, connectivity: 0.5 },
    blurb: 'Busiest store in the chain. The guest Wi-Fi password is the store name.',
  },
  {
    id: 'office-london', name: 'Europe Regional Office', type: 'office', lon: -0.1, lat: 51.5, devices: 520,
    traits: { patch: 0.6, savvy: 0.55, maturity: 0.6, connectivity: 0.85 },
    blurb: 'Regional hub. Runs on tea and a ticket queue nobody admits to owning.',
  },
  {
    id: 'dc-central', name: 'Central Europe Data Center', type: 'datacenter', lon: 8.7, lat: 50.1, devices: 380,
    traits: { patch: 0.7, savvy: 0.75, maturity: 0.8, connectivity: 0.95 },
    blurb: 'Immaculate cabling. The audit binder is thicker than the walls.',
  },
  {
    id: 'warehouse-port', name: 'North Sea Port Warehouse', type: 'warehouse', lon: 4.5, lat: 51.9, devices: 240,
    traits: { patch: 0.12, savvy: 0.25, maturity: 0.25, connectivity: 0.55 },
    blurb: 'Shipping manifests printed on a printer that is also, somehow, a file server.',
  },
  {
    id: 'retail-iberia', name: 'Iberia Retail Branch', type: 'retail', lon: -3.7, lat: 40.4, devices: 120,
    traits: { patch: 0.35, savvy: 0.3, maturity: 0.3, connectivity: 0.45 },
    blurb: 'Closes for lunch. The tills do not.',
  },
  {
    id: 'office-gulf', name: 'Middle East Sales Office', type: 'office', lon: 55.3, lat: 25.2, devices: 150,
    traits: { patch: 0.55, savvy: 0.45, maturity: 0.5, connectivity: 0.6 },
    blurb: 'Sales team, mostly airborne. Laptops connect from every hotel lobby on Earth.',
  },
  {
    id: 'office-asia', name: 'Asia Pacific Office', type: 'office', lon: 103.8, lat: 1.35, devices: 480,
    traits: { patch: 0.65, savvy: 0.6, maturity: 0.6, connectivity: 0.85 },
    blurb: 'Regional hub. Open 24 hours because someone, somewhere, is always in a meeting.',
  },
  {
    id: 'warehouse-asia', name: 'Pearl Delta Warehouse', type: 'warehouse', lon: 114.1, lat: 22.5, devices: 280,
    traits: { patch: 0.15, savvy: 0.2, maturity: 0.25, connectivity: 0.5 },
    blurb: 'Robots move the boxes. Nobody has patched the robots.',
  },
  {
    id: 'retail-tokyo', name: 'Tokyo Flagship Store', type: 'retail', lon: 139.7, lat: 35.7, devices: 130,
    traits: { patch: 0.55, savvy: 0.5, maturity: 0.45, connectivity: 0.5 },
    blurb: 'Interactive displays in every window. All of them have a USB port.',
  },
  {
    id: 'office-sydney', name: 'Oceania Office', type: 'office', lon: 151.2, lat: -33.9, devices: 200,
    traits: { patch: 0.5, savvy: 0.5, maturity: 0.45, connectivity: 0.45 },
    blurb: 'Last to hear about every incident, because of the time zone.',
  },
];

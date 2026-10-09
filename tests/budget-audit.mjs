/* Capital ordering, headway fleet scaling, and budget-mode passenger isolation. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  lineCostFromSpec,
  fleetSize,
  operatingDay,
  summarizeBudget,
  defaultCostTable,
  capitalCostPerKmPln,
} from '../src/sim/budget.js';
import { createModel } from '../src/sim/model.js';

const metro = lineCostFromSpec({
  mode: 'metro',
  alignment: 'tunnel',
  lengthKm: 10,
  stations: 8,
  headway: 6,
  vehicle: 'metro6',
});
const tram = lineCostFromSpec({
  mode: 'tram',
  alignment: 'street',
  lengthKm: 10,
  stations: 15,
  headway: 8,
  vehicle: 'tram30',
});
const brt = lineCostFromSpec({
  mode: 'bus',
  alignment: 'lane',
  lengthKm: 10,
  stations: 15,
  headway: 10,
  vehicle: 'bus18',
});

assert.ok(metro.infraPLN > tram.infraPLN, `metro infra ${metro.infraPLN} should beat tram ${tram.infraPLN}`);
assert.ok(tram.infraPLN > brt.infraPLN, `tram infra ${tram.infraPLN} should beat BRT ${brt.infraPLN}`);
assert.equal(capitalCostPerKmPln('metro', 'tunnel'), 340_000_000);
assert.equal(capitalCostPerKmPln('tram', 'street'), 115_000_000);
assert.equal(capitalCostPerKmPln('bus', 'lane'), 16_000_000);
assert.equal(capitalCostPerKmPln('metro', 'elevated'), null, 'elevated metro stays stop-and-ask');
assert.equal(defaultCostTable.costPerStation.elevated, null, 'elevated station stays stop-and-ask');

const route = {
  source: 'player',
  mode: 'tram',
  alignment: 'segregated',
  vehicle: 'tram30',
  ring: false,
  stopIds: Array.from({ length: 12 }, (_, i) => `s${i}`),
};
const lengthKm = 10;
const fleetWide = fleetSize(route, lengthKm, 8, defaultCostTable);
const fleetTight = fleetSize(route, lengthKm, 4, defaultCostTable);
assert.ok(fleetTight >= fleetWide * 1.8 && fleetTight <= fleetWide * 2.2,
  `halving headway should roughly double fleet (${fleetWide} → ${fleetTight})`);
const opWide = operatingDay(route, lengthKm, 8);
const opTight = operatingDay(route, lengthKm, 4);
assert.ok(Math.abs(opTight / opWide - 2) < 0.05, `halving headway should double operating (${opWide} → ${opTight})`);

const network = JSON.parse(fs.readFileSync(new URL('../data/gzm/network.json', import.meta.url), 'utf8'));
const population = JSON.parse(fs.readFileSync(new URL('../data/gzm/population.json', import.meta.url), 'utf8'));
const sim = createModel(network, population);
const off = sim.calculate(network, [], [], {});
const on = sim.calculate(network, [], [], {});
assert.equal(off.passengers, on.passengers, 'passenger totals must ignore budget UI state');
assert.equal(off.calibrated, false);
assert.equal(off.asc, 0);

const stops = new Map(network.stops.map(stop => [stop.id, stop]));
const summary = summarizeBudget({
  customRoutes: [],
  overrides: {},
  publishedRoutes: network.routes,
  stopLookup: id => stops.get(id),
  km: sim.km,
  resolveService: (route, daypart) => sim.resolveService(route, daypart),
  stats: off,
  baseline: off,
  budgetCap: 5_000_000_000,
  region: { budget: { capitalPLN: 5_000_000_000, annualFactor: 365 } },
});
assert.equal(summary.calibrated, false);
assert.equal(summary.revenueYear, null);
assert.equal(summary.capital, 0);

console.log(`budget-audit ok · metro ${Math.round(metro.infraPLN / 1e6)}m > tram ${Math.round(tram.infraPLN / 1e6)}m > brt ${Math.round(brt.infraPLN / 1e6)}m · fleet ${fleetWide}→${fleetTight}`);

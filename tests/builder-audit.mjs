/* Shared snapped stops and player bus lines. Run with Node.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createModel } from '../src/sim/model.js';

const network = JSON.parse(fs.readFileSync('data/gzm/network.json', 'utf8'));
const population = JSON.parse(fs.readFileSync('data/gzm/population.json', 'utf8'));
globalThis.window = { TRANSIT_NETWORK: network, TRANSIT_TEMPLATES: { templates: [] } };
const { normalize } = await import('../src/scenario.js');
const sim = createModel(network, population);

const hub = network.stops.find(stop => /Katowice.*Dworzec|Dworzec.*Katowice/i.test(stop.name))
  || network.stops.find(stop => stop.name.includes('Katowice') && /dworzec/i.test(stop.name))
  || network.stops.find(stop => stop.city === 'Katowice');
assert.ok(hub, 'need a Katowice hub stop');
const far = network.stops.find(stop => stop.id !== hub.id && sim.km(stop.pos, hub.pos) > 2 && sim.km(stop.pos, hub.pos) < 8)
  || network.stops.find(stop => stop.id !== hub.id);
assert.ok(far);

const copied = {
  overrides: {},
  customRoutes: [{
    id: 'metro:old',
    source: 'player',
    mode: 'metro',
    name: 'M9',
    longName: 'Copied snap',
    color: '#8068e8',
    headway: 6,
    active: true,
    ring: false,
    stopIds: ['metro:old:0', far.id],
  }],
  customStops: [{
    id: 'metro:old:0',
    name: hub.name,
    pos: hub.pos.slice(),
    schematic: false,
    coordinateNote: 'Snapped to a published transit stop.',
  }],
  daypart: 'peak',
};
const warnings = [];
const migrated = normalize(copied, warning => warnings.push(warning));
assert.ok(warnings.some(text => /snapped|przyciąg|Replaced|Zamieniono/i.test(text)), warnings);
assert.equal(migrated.customStops.length, 0);
assert.deepEqual(migrated.customRoutes[0].stopIds, [hub.id, far.id]);

const other = network.stops.find(stop => stop.id !== hub.id && stop.id !== far.id && sim.km(stop.pos, hub.pos) > 0.4 && sim.km(stop.pos, hub.pos) < 3) || far;
const feeder = {
  id: 'gtfs:feeder',
  source: 'gtfs',
  mode: 'tram',
  name: 'F',
  headway: 6,
  active: true,
  stopIds: [other.id, hub.id],
  geometry: [[other.pos, hub.pos]],
};
const tiny = { stops: [other, hub, far], routes: [feeder], areas: [], sources: [] };
const sharedLine = {
  id: 'metro:share',
  source: 'player',
  mode: 'metro',
  name: 'M8',
  headway: 5,
  active: true,
  ring: false,
  vehicle: 'metro6',
  alignment: 'tunnel',
  stopIds: [hub.id, far.id],
  geometry: [[hub.pos, far.pos]],
};
const copyLine = {
  id: 'metro:copy',
  source: 'player',
  mode: 'metro',
  name: 'M7',
  headway: 5,
  active: true,
  ring: false,
  stopIds: ['metro:copy:0', far.id],
  geometry: [[hub.pos, far.pos]],
};
const copyStop = { id: 'metro:copy:0', name: hub.name, pos: hub.pos.slice(), city: 'Player' };
const sharedTiny = createModel(tiny, population).calculate(tiny, [sharedLine], [], {});
const copyTiny = createModel(tiny, population).calculate(tiny, [copyLine], [copyStop], {});
assert.ok(sharedTiny.travel <= copyTiny.travel, `shared transfer ${sharedTiny.travel} vs walked copy ${copyTiny.travel}`);

const bus = normalize({
  overrides: {},
  customRoutes: [{
    id: 'bus:brt',
    source: 'player',
    mode: 'bus',
    name: 'B1',
    longName: 'BRT',
    color: '#ef705e',
    headway: 8,
    active: true,
    ring: false,
    vehicle: 'bus18',
    alignment: 'lane',
    stopIds: [hub.id, far.id],
    waypoints: [[[(hub.pos[0] + far.pos[0]) / 2, (hub.pos[1] + far.pos[1]) / 2 + 0.2]]],
  }],
  customStops: [],
  daypart: 'peak',
});
assert.equal(bus.customRoutes[0].mode, 'bus');
assert.equal(bus.customRoutes[0].vehicle, 'bus18');
assert.ok(bus.customRoutes[0].waypoints?.[0]?.length);
const withWay = sim.calculate(network, bus.customRoutes, [], {});
const straight = sim.calculate(network, [{ ...bus.customRoutes[0], waypoints: undefined }], [], {});
assert.ok(withWay.cost > straight.cost, `waypoints should lengthen the line (${withWay.cost} vs ${straight.cost})`);

console.log(JSON.stringify({
  hub: hub.name,
  sharedTravel: sharedTiny.travel,
  copyTravel: copyTiny.travel,
  busCost: withWay.cost,
  straightCost: straight.cost,
}));

/* Model invariants for the pinned metropolitan snapshot. Run with Node.js. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
for (const file of ['data/network.js', 'data/population-density.js', 'sim.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const { GZM_NETWORK: network, GZM_POPULATION: population, TransitSim: sim } = context.window;
const run = (routes = [], overrides = {}) => sim.calculate(network, routes, [], overrides);
const baseline = run();
const straightFallback = sim.calculate({ ...network, routes: network.routes.map(route => ({ ...route, edited: true })) }, [], [], {});
const disabled = run([], Object.fromEntries(network.routes.map(route => [route.id, { active: false }])));
const faster = run([], Object.fromEntries(network.routes.map(route => [route.id, { headway: Math.max(3, Math.floor(route.headway / 2)) }])));

assert.equal(network.focus.length, 43);
assert.equal(population.cities.length, 43);
assert.ok(network.routes.some(route => route.source === 'pkm'));
for (const city of ['Mikołów', 'Łaziska Górne', 'Orzesze', 'Jaworzno', 'Gliwice', 'Tychy']) {
  assert.ok(network.focus.includes(city));
  assert.ok(population.cities.some(entry => entry.name === city && entry.residentPopulationInSelectedCells > 0));
  const stopIds = new Set(network.stops.filter(stop => stop.name.startsWith(city)).map(stop => stop.id));
  assert.ok(stopIds.size > 0, `${city} should have published stops`);
  assert.ok(network.routes.some(route => route.stopIds.some(id => stopIds.has(id))), `${city} should have service`);
  assert.ok(sim.zoneCities.includes(city), `${city} should affect the demand model`);
}
assert.equal(new Set(sim.zoneCities).size, 43);
assert.equal(baseline.demandPopulation, population.totalPopulation);
assert.equal(Object.keys(baseline.cityStats).length, 43, 'every municipality should have local results');
const unservedStops = Array.from({ length: 12 }, (_, i) => ({ id: `test:unused:${i}`, name: 'Unused platform', pos: [sim.zones[0][1], sim.zones[0][2]] }));
const unchanged = sim.calculate(network, [], unservedStops, {});
assert.equal(unchanged.passengers, baseline.passengers, 'unused custom stops cannot crowd published stops out of zone access');
assert.equal(unchanged.satisfaction, baseline.satisfaction);
assert.notEqual(baseline.cost, straightFallback.cost, 'published route shapes should refine service distance estimates');
assert.notEqual(baseline.passengers, straightFallback.passengers, 'shape-derived travel times should affect route choice');
assert.equal(disabled.passengers, 0, 'walking-only paths cannot count as transit');
assert.equal(disabled.cost, 0);
assert.equal(disabled.load, 0);
assert.ok(faster.passengers >= baseline.passengers, 'higher frequency should not lose reachable trips');
assert.ok(faster.wait <= baseline.wait, 'higher frequency should not increase average wait');
assert.ok(faster.cost > baseline.cost);

const nearest = point => network.stops.reduce((best, current) => sim.km(current.pos, point) < sim.km(best.pos, point) ? current : best);
const first = nearest([19.019, 50.259]);
const last = nearest([19.129, 50.279]);
const metro = { id: 'test:metro', source: 'player', mode: 'metro', name: 'M1', headway: 5, active: true, stopIds: [first.id, last.id], geometry: [[first.pos, last.pos]] };
const extended = run([metro]);
assert.ok(extended.passengers > baseline.passengers, 'a useful metro connection should attract trips');
assert.ok(extended.cost > baseline.cost, 'adding a line should increase operating cost');
const isolated = { ...network, routes: [], stops: [first, last] };
const twoWay = sim.calculate(isolated, [metro], [], {});
const reversed = sim.calculate(isolated, [{ ...metro, stopIds: [last.id, first.id], geometry: [[last.pos, first.pos]] }], [], {});
const oneWay = sim.calculate(isolated, [{ ...metro, source: 'gtfs' }], [], {});
assert.equal(twoWay.passengers, reversed.passengers, 'a player line should serve the same trips whichever endpoint was clicked first');
assert.equal(twoWay.cost, reversed.cost, 'player line cost should not depend on drawing direction');
assert.ok(Math.abs(twoWay.cost - 2 * oneWay.cost) <= 1, 'player line cost should include return service (allowing display rounding)');
assert.ok(twoWay.passengers >= oneWay.passengers, 'return service should not reduce reachable trips');

const middle = nearest([19.055, 50.258]);
const ringStops = [first, middle, last];
assert.equal(new Set(ringStops.map(stop => stop.id)).size, 3, 'ring test needs three distinct stops');
const ringRoute = { ...metro, ring: true, edited: true, stopIds: ringStops.map(stop => stop.id), geometry: [[...ringStops.map(stop => stop.pos), first.pos]] };
const openRoute = { ...ringRoute, ring: false, source: 'gtfs', geometry: [[...ringStops.map(stop => stop.pos)]] };
const ringNetwork = { ...network, routes: [], stops: ringStops };
const ringResult = sim.calculate(ringNetwork, [ringRoute], [], {});
const openResult = sim.calculate(ringNetwork, [openRoute], [], {});
const twoWayOpenResult = sim.calculate(ringNetwork, [{ ...openRoute, source: 'player' }], [], {});
assert.ok(ringResult.cost > openResult.cost, 'ring cost includes the closing segment');
assert.ok(ringResult.cost < twoWayOpenResult.cost, 'a one-direction ring does not double-count reverse trips');
assert.ok(Number.isInteger(ringResult.satisfaction * 100), 'satisfaction keeps hundredth-point precision');

let workerResult;
const worker = { window: {}, self: null };
worker.self = worker;
worker.importScripts = (...files) => files.forEach(file => vm.runInNewContext(fs.readFileSync(path.join(root, file.split('?')[0]), 'utf8'), worker, { filename: file }));
worker.postMessage = message => { workerResult = message; };
vm.runInNewContext(fs.readFileSync(path.join(root, 'sim-worker.js'), 'utf8'), worker, { filename: 'sim-worker.js' });
worker.onmessage({ data: { revision: 7, customRoutes: [metro], customStops: [], overrides: {} } });
assert.equal(workerResult.revision, 7);
assert.deepEqual(JSON.parse(JSON.stringify(workerResult.baseline)), JSON.parse(JSON.stringify(baseline)), 'worker baseline matches direct calculation');
assert.deepEqual(JSON.parse(JSON.stringify(workerResult.stats)), JSON.parse(JSON.stringify(extended)), 'worker scenario matches direct calculation');

console.log('Simulation invariants passed', {
  baselinePassengers: baseline.passengers,
  disabledPassengers: disabled.passengers,
  fasterPassengers: faster.passengers,
  metroPassengers: extended.passengers,
});

/* Model invariants for the pinned metropolitan snapshot. Run with Node.js. */
(async () => {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const network = JSON.parse(fs.readFileSync(path.join(root, 'data/gzm/network.json'), 'utf8'));
const population = JSON.parse(fs.readFileSync(path.join(root, 'data/gzm/population.json'), 'utf8'));
assert.equal(network.version, '2026-09-23-gzm-v5');
assert.equal(network.serviceDates.ztm.saturday, null, 'the pinned ZTM extract has no Saturday service');
assert.equal(network.serviceDates.ks.saturday, '20260926');
assert.ok(network.areas.some(area => area.stopIds.length > 1), 'nearby same-name platforms share an area');
const areaIds = new Set(network.areas.map(area => area.id));
for (const stop of network.stops) {
  assert.ok(areaIds.has(stop.area), stop.id);
  assert.ok(!/^granica/i.test(stop.name) && !/\[tech\]/i.test(stop.name), stop.name);
}
for (const route of network.routes) {
  assert.ok(route.dayparts && 'peak' in route.dayparts && 'midday' in route.dayparts && 'saturday' in route.dayparts);
  for (const part of [route.dayparts.peak, route.dayparts.midday, route.dayparts.saturday]) {
    if (part === null) continue;
    assert.ok(part.headway >= 2 && part.headway <= 120, route.id);
  }
  if (route.source === 'ks') assert.ok(route.dailyTrips >= 2, route.id);
  if (route.source === 'ztm') assert.equal(route.dayparts.saturday, null, route.id);
  if (route.color) assert.ok(!/^#(000000|ffffff)$/i.test(route.color), route.id);
  if (Array.isArray(route.times)) {
    assert.equal(route.times.length, route.stopIds.length, route.id);
    for (let i = 1; i < route.times.length; i++) assert.ok(route.times[i] - route.times[i - 1] >= 0.29, route.id);
  }
}
assert.ok(network.routes.filter(route => route.source === 'ks' && route.name === 'S1').length >= 3, 'S1 short turns stay in the network');
const { createModel } = await import('../src/sim/model.js');
const { runJob } = await import('../src/sim/worker.js');
const sim = createModel(network, population);
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
assert.equal(disabled.boardings, 0);
assert.equal(disabled.share, 0);
assert.equal(baseline.asc, 0);
assert.equal(baseline.calibrated, false);
assert.equal(Number.isInteger(baseline.satisfaction), true);
assert.equal(sim.calculate(network, [], [], {}, 'peak').passengers, baseline.passengers, 'peak is the stored baseline');
const saturday = sim.calculate(network, [], [], {}, 'saturday');
assert.notEqual(saturday.passengers, baseline.passengers, 'Saturday drops patterns with no Saturday trips');
assert.equal(sim.resolveService(network.routes.find(route => route.mode === 'tram'), 'saturday').runs, false);
const saturdayRail = network.routes.find(route => route.source === 'ks' && route.dayparts.saturday);
assert.equal(sim.resolveService(saturdayRail, 'saturday').runs, true);
assert.ok(network.routes.some(route => route.dayparts.saturday && sim.resolveService(route, 'saturday').headway !== route.headway), 'Saturday rail is not a copy of the Wednesday interval');
const player = { id: 'test:player', source: 'player', mode: 'metro', headway: 6, active: true, stopIds: [] };
assert.equal(sim.resolveService(player, 'saturday').headway, 6);
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
assert.equal(Number.isInteger(ringResult.satisfaction), true, 'satisfaction is a whole number');

let workerResult;
runJob({ revision: 7, network, population, customRoutes: [metro], customStops: [], overrides: {} }, message => { workerResult = message; });
assert.equal(workerResult.revision, 7);
assert.deepEqual(JSON.parse(JSON.stringify(workerResult.baseline)), JSON.parse(JSON.stringify(baseline)), 'worker baseline matches direct calculation');
assert.deepEqual(JSON.parse(JSON.stringify(workerResult.stats)), JSON.parse(JSON.stringify(extended)), 'worker scenario matches direct calculation');

console.log('Simulation invariants passed', {
  baselinePassengers: baseline.passengers,
  disabledPassengers: disabled.passengers,
  fasterPassengers: faster.passengers,
  metroPassengers: extended.passengers,
});
})().catch(error => { console.error(error); process.exitCode = 1; });

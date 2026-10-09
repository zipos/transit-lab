/* Insight layers: travel-time timing, flow-band aggregation, Katowice–Sosnowiec metro smoke. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createModel } from '../src/sim/model.js';
import { aggregateFlowBands, flowBandCollection, paintTravelCells } from '../src/layers.js';

const root = new URL('..', import.meta.url);
const network = JSON.parse(fs.readFileSync(new URL('./data/gzm/network.json', root), 'utf8'));
const population = JSON.parse(fs.readFileSync(new URL('./data/gzm/population.json', root), 'utf8'));
const sim = createModel(network, population);

const rynek = network.stops.find(stop => /Rynek/i.test(stop.name) && /Katowice/i.test(stop.city || stop.name))
  || network.stops.find(stop => stop.name === 'Katowice Rynek')
  || network.stops.find(stop => /Katowice/i.test(stop.name) && /rynek/i.test(stop.name));
assert.ok(rynek, 'need Katowice Rynek (or similar) for travel-time probe');

const travelStarted = performance.now();
const travel = sim.travelFrom(rynek.pos, network, [], [], {}, 'peak');
const travelMs = performance.now() - travelStarted;
assert.ok(travel.zoneClock?.length === sim.zones.length, 'travel returns one clock per zone');
assert.ok(Number.isFinite(travel.searchMs), 'searchMs reported');
assert.ok(travelMs < 500, `end-to-end travelFrom ${travelMs.toFixed(0)} ms should stay under 500 ms`);
assert.ok(travel.searchMs < 150, `worker search target: searchMs ${travel.searchMs} ms`);
assert.ok(travel.residents30 >= 0 && travel.residents45 >= travel.residents30, 'reach counts ordered');

const katowice = [19.020814, 50.255818];
const sosnowiec = [19.13744, 50.273662];
const corridor = [0, 1, 2, 3, 4].map(step => [
  katowice[0] + (sosnowiec[0] - katowice[0]) * step / 4,
  katowice[1] + (sosnowiec[1] - katowice[1]) * step / 4,
]);
const customStops = corridor.map((pos, index) => ({ id: `layer:metro:${index}`, name: `M${index}`, pos, city: 'Player' }));
const customRoutes = [{
  id: 'layer:metro', source: 'player', mode: 'metro', name: 'M1', headway: 3, active: true,
  stopIds: customStops.map(stop => stop.id),
  geometry: [corridor],
}];

const baseline = sim.calculate(network, [], [], {});
const withMetro = sim.calculate(network, customRoutes, customStops, {});
assert.ok(withMetro.access45?.length === baseline.access45?.length, 'access45 on stats');
const gains = withMetro.access45.map((value, index) => value - baseline.access45[index]);
assert.ok(gains.some(delta => delta > 0), 'metro should improve some zone access45');

const bands = aggregateFlowBands(withMetro.flows);
assert.ok(bands.some(band => band.mode === 'metro' && band.daily > 0), 'metro flow band present');
const byPair = new Map();
for (const band of bands) {
  const key = `${band.mode}|${band.fromId}|${band.toId}`;
  assert.equal(byPair.has(key), false, 'one band per stop-pair × mode');
  byPair.set(key, true);
}
const lookup = id => customStops.find(stop => stop.id === id) || network.stops.find(stop => stop.id === id);
const geo = flowBandCollection(withMetro.flows, lookup);
assert.ok(geo.features.some(feature => feature.properties.mode === 'metro'), 'flow GeoJSON includes metro');

const mask = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { id: 'probe-cell' },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  }],
};
const zoneByCellId = new Map([['probe-cell', { id: 'zone-probe', residents: 500 }]]);
const zoneIndexById = new Map([['zone-probe', 0]]);
const painted = paintTravelCells(mask, zoneByCellId, zoneIndexById, [8.2, 55], [12, 55], false);
assert.equal(painted.features[0].properties.travelBand, 10);
assert.equal(painted.features[0].properties.travelMin, 8.2);
const mid = paintTravelCells(mask, zoneByCellId, zoneIndexById, [25], [30], true);
assert.equal(mid.features[0].properties.travelBand, 30);
assert.equal(mid.features[0].properties.minutesSaved, 5);

console.log(JSON.stringify({
  travelMs: Math.round(travelMs),
  searchMs: travel.searchMs,
  buildMs: travel.buildMs,
  residents30: travel.residents30,
  residents45: travel.residents45,
  metroBands: bands.filter(band => band.mode === 'metro').length,
  accessGains: gains.filter(delta => delta > 0).length,
}));

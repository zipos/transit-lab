import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createModel } from '../src/sim/model.js';

const python = spawnSync('python3', ['tests/zones-build.py'], { encoding: 'utf8' });
if (python.status !== 0) {
  console.error(python.stdout, python.stderr);
  process.exit(python.status || 1);
}

const network = JSON.parse(readFileSync('data/gzm/network.json', 'utf8'));
const population = JSON.parse(readFileSync('data/gzm/population.json', 'utf8'));
assert.equal(population.zones.length, 450);
assert.equal(population.zones.reduce((sum, zone) => sum + zone.residents, 0), population.totalPopulation);

const listed = new Set();
for (const zone of population.zones) for (const [index] of zone.access) listed.add(index);
const cells = population.cells.filter(cell => cell.population > 0);
let near = 0;
let hit = 0;
for (let index = 0; index < network.stops.length; index++) {
  const [lon, lat] = network.stops[index].pos;
  const close = cells.some(cell => Math.abs(cell.lon - lon) < 0.02 && Math.abs(cell.lat - lat) < 0.015 && km(cell.lon, cell.lat, lon, lat) <= 1);
  if (!close) continue;
  near++;
  if (listed.has(index)) hit++;
}
assert.ok(hit / near > 0.9, `${hit} of ${near} nearby stops are in an access list`);

const sim = createModel(network, population);
const baseline = sim.calculate(network, [], [], {});
const previous = { passengers: 93778, wait: 23.5, travel: 86.87 };
assert.ok(baseline.passengers < previous.passengers * 5 && baseline.passengers > previous.passengers / 5, 'zone demand stays within 5× of the previous engine');

const katowice = [19.020814, 50.255818];
const sosnowiec = [19.13744, 50.273662];
const corridor = [0, 1, 2, 3, 4].map(step => [
  katowice[0] + (sosnowiec[0] - katowice[0]) * step / 4,
  katowice[1] + (sosnowiec[1] - katowice[1]) * step / 4,
]);
// 8 km on bearing 120°. The nearest published cell under every station is below 500 residents/km².
const ruralShift = [0.0975, -0.0360];
const rural = corridor.map(([lon, lat]) => [lon + ruralShift[0], lat + ruralShift[1]]);
for (const point of rural) {
  const nearest = cells.reduce((best, cell) => km(cell.lon, cell.lat, point[0], point[1]) < km(best.lon, best.lat, point[0], point[1]) ? cell : best);
  assert.ok(nearest.density < 500, `rural probe should sit below 500 residents/km², found ${nearest.density} at ${nearest.lon},${nearest.lat}`);
}
const denseGain = gain(sim, network, corridor, baseline.passengers);
const ruralGain = gain(sim, network, rural, baseline.passengers);
assert.ok(denseGain > ruralGain * 3, `dense metro gained ${denseGain}, rural gained ${ruralGain}`);

const centroid = new Map();
for (const cell of cells) {
  const entry = centroid.get(cell.city) || { lon: 0, lat: 0, population: 0 };
  entry.lon += cell.lon * cell.population;
  entry.lat += cell.lat * cell.population;
  entry.population += cell.population;
  centroid.set(cell.city, entry);
}
let far = null;
for (const [index, cell] of population.cells.entries()) {
  if (!(cell.density > 5000)) continue;
  const center = centroid.get(cell.city);
  const distance = km(cell.lon, cell.lat, center.lon / center.population, center.lat / center.population);
  if (!far || distance > far.distance) far = { index, cell, distance };
}
const zoneIndex = population.zones.findIndex(zone => zone.cells.some(item => item.index === far.index));
assert.ok(zoneIndex >= 0 && far.distance > 3, 'a dense cell should sit away from its old municipality anchor');
const connected = [far.cell.lon, far.cell.lat];
const before = baseline.zoneStats[zoneIndex].from;
const after = sim.calculate(network, [route('local', [connected, katowice])], stops('local', [connected, katowice]), {}).zoneStats[zoneIndex].from;
assert.notEqual(after, before, 'a station at that cell should change trips from its zone');

console.log('Zone audit passed', {
  nearbyStops: `${hit}/${near}`,
  passengers: baseline.passengers,
  coverage: baseline.coverage,
  wait: baseline.wait,
  journey: baseline.travel,
  previous,
  corridor,
  rural,
  denseGain,
  ruralGain,
  localCell: [far.cell.lon, far.cell.lat, far.cell.city, Math.round(far.distance * 10) / 10],
  localTrips: [before, after],
  oneWorkerMs: sim.timing().searchMs + sim.timing().buildMs,
});

function gain(model, baseNetwork, points, basePassengers) {
  const result = model.calculate(baseNetwork, [route('probe', points)], stops('probe', points), {});
  return result.passengers - basePassengers;
}
function stops(prefix, points) {
  return points.map((pos, index) => ({ id: `${prefix}:${index}`, name: `${prefix} ${index}`, pos }));
}
function route(prefix, points) {
  return {
    id: `${prefix}:metro`, source: 'player', mode: 'metro', name: 'P', headway: 3, active: true,
    stopIds: points.map((_, index) => `${prefix}:${index}`),
    geometry: [points],
  };
}
function km(lon1, lat1, lon2, lat2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

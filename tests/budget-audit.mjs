import assert from 'node:assert/strict';
import { playerCapital, fleetSize, capitalCosts } from '../src/sim/budget.js';

const km = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

function line(mode, alignment, vehicle, stations, headway = 6) {
  const stopIds = [];
  const stops = new Map();
  for (let i = 0; i < stations; i++) {
    const id = `${mode}:${i}`;
    stopIds.push(id);
    stops.set(id, { id, pos: [19 + i * (10 / (stations - 1)) / 111.2, 50.25] });
  }
  const route = {
    id: `${mode}:test`,
    source: 'player',
    mode,
    alignment,
    vehicle,
    headway,
    ring: false,
    stopIds,
  };
  const lookup = id => stops.get(id);
  return { route, lookup, detail: playerCapital(route, lookup, km) };
}

const metro = line('metro', 'tunnel', 'metro6', 8);
const tram = line('tram', 'street', 'tram30', 15);
const brt = line('bus', 'lane', 'bus18', 12);
assert.ok(metro.detail.lengthKm > 9.5 && metro.detail.lengthKm < 10.5, metro.detail.lengthKm);
assert.ok(metro.detail.capital > tram.detail.capital, `metro ${metro.detail.capital} vs tram ${tram.detail.capital}`);
assert.ok(tram.detail.capital > brt.detail.capital, `tram ${tram.detail.capital} vs brt ${brt.detail.capital}`);

const slow = line('tram', 'street', 'tram30', 10, 12);
const fast = line('tram', 'street', 'tram30', 10, 6);
assert.ok(fast.detail.fleet >= slow.detail.fleet * 1.8, `fleet ${fast.detail.fleet} vs ${slow.detail.fleet}`);
assert.ok(fast.detail.vehicles >= slow.detail.vehicles * 1.8);

assert.equal(capitalCosts.annualFactor, 365);
assert.ok(capitalCosts.capitalPerKm.metro_tunnel > 0);

console.log(JSON.stringify({
  metro: Math.round(metro.detail.capital / 1e6),
  tram: Math.round(tram.detail.capital / 1e6),
  brt: Math.round(brt.detail.capital / 1e6),
  fleetSlow: slow.detail.fleet,
  fleetFast: fast.detail.fleet,
}));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { minify, expand, bytesToBase64Url, base64UrlToBytes } from '../src/share.js';
import { activateSlot, createSlot, emptyBook } from '../src/slots.js';
import { createModel } from '../src/sim/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const network = JSON.parse(fs.readFileSync(path.join(root, 'data/gzm/network.json'), 'utf8'));
const population = JSON.parse(fs.readFileSync(path.join(root, 'data/gzm/population.json'), 'utf8'));
globalThis.window = { TRANSIT_NETWORK: network, TRANSIT_TEMPLATES: { templates: [] } };
const { normalize } = await import('../src/scenario.js');

function pack(value) {
  return bytesToBase64Url(zlib.deflateRawSync(Buffer.from(JSON.stringify(value))));
}
function unpack(payload) {
  return JSON.parse(zlib.inflateRawSync(Buffer.from(base64UrlToBytes(payload))).toString());
}

const player = (id, name, lon) => ({
  overrides: {},
  customRoutes: [{
    id, source: 'player', mode: 'metro', name, longName: name, color: '#8068e8', headway: 8, active: true, ring: false,
    stopIds: [`${id}:0`, `${id}:1`, `${id}:2`]
  }],
  customStops: [0, 1, 2].map(index => ({ id: `${id}:${index}`, name: `${name} ${index + 1}`, pos: [lon + index * 0.02, 50.26], schematic: false, coordinateNote: '' })),
  daypart: 'peak'
});
const scenario = {
  overrides: { [network.routes.find(route => route.name === 'T6').id]: { headway: 5 } },
  customRoutes: [...player('metro:s0', 'M1', 19.02).customRoutes, ...player('metro:s1', 'M2', 19.1).customRoutes],
  customStops: [...player('metro:s0', 'M1', 19.02).customStops, ...player('metro:s1', 'M2', 19.1).customStops],
  daypart: 'peak'
};
const meta = { region: 'gzm', networkVersion: network.version, name: 'Two lines' };
const payload = pack(minify(normalize(scenario), network, meta));
const link = `https://example.test/?region=gzm#s=${payload}`;
assert.ok(link.length < 2000, `two-line link is ${link.length} characters`);
const restored = normalize(expand(unpack(payload), network).scenario);
const sim = createModel(network, population);
const statsOf = data => sim.calculate(network, data.customRoutes, data.customStops, data.overrides, data.daypart);
const before = statsOf(normalize(scenario));
const after = statsOf(restored);
assert.equal(after.passengers, before.passengers);
assert.equal(after.cost, before.cost);
assert.equal(after.satisfaction, before.satisfaction);

const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/malicious-scenario.json'), 'utf8'));
const cleaned = normalize(expand(unpack(pack(fixture)), network).scenario);
const serialized = JSON.stringify(cleaned);
for (const attack of ['javascript:', 'scenario-attack.invalid', 'background-image', '__proto__', 'polluted']) {
  assert.ok(!serialized.includes(attack), attack);
}

const book = emptyBook();
const first = createSlot(book, { ...normalize(scenario), networkVersion: network.version, name: 'A' }, { passengers: 1, cost: 2, modelVersion: 1, networkVersion: network.version, stats: { passengers: 1 } }, 'A');
const second = createSlot(book, { overrides: {}, customRoutes: [], customStops: [], daypart: 'peak', networkVersion: network.version, name: 'B' }, null, 'B');
book.active = first.id;
const next = activateSlot(book, second.id, { scenario: book.slots[0].scenario, summary: book.slots[0].summary });
assert.equal(next.id, second.id);
assert.equal(book.active, second.id);
assert.equal(book.slots.find(slot => slot.id === first.id).scenario.name, 'A');
assert.equal(book.slots.find(slot => slot.id === second.id).scenario.name, 'B');
assert.notEqual(JSON.stringify(book.slots[0].scenario), JSON.stringify(book.slots[1].scenario));

// Slots made within one millisecond must never share an id.
const crowded = emptyBook();
for (let i = 0; i < 30; i++) createSlot(crowded, { overrides: {}, customRoutes: [], customStops: [], daypart: 'peak', networkVersion: network.version, name: `S${i}` }, null, `S${i}`);
assert.equal(new Set(crowded.slots.map(slot => slot.id)).size, 30, 'slot ids must be unique');
console.log(`Share audit passed. Two-line link is ${link.length} characters.`);

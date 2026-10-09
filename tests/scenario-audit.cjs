/* Scenario trust-boundary and loader regressions. Run with Node.js. */
(async () => {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { window: {}, URL };
context.window.TRANSIT_NETWORK = JSON.parse(fs.readFileSync(path.join(root, 'data/gzm/network.json'), 'utf8'));
context.window.TRANSIT_TEMPLATES = JSON.parse(fs.readFileSync(path.join(root, 'regions/gzm/templates.json'), 'utf8'));
globalThis.window = context.window;
const { normalize, safeUrl, safeColor } = await import('../src/scenario.js');
const { t } = await import('../src/i18n/index.js');
context.window.TransitScenario = { normalize, safeUrl, safeColor };
const network = context.window.TRANSIT_NETWORK;
const templates = context.window.TRANSIT_TEMPLATES.templates;
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ overrides: {}, customRoutes: [], customStops: [] });
assert.equal(normalize(empty()).daypart, 'peak');
assert.equal(normalize({ ...empty(), daypart: 'saturday' }).daypart, 'saturday');
assert.equal(normalize({ ...empty(), daypart: 'night' }).daypart, 'peak');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/malicious-scenario.json'), 'utf8'));
const warnings = [];
const cleaned = clone(normalize(fixture, warning => warnings.push(warning)));
assert.equal(warnings.length, 1);
assert.match(warnings[0], /stops per route limit \(300\)/);
assert.equal(cleaned.customRoutes.length, 2);
assert.equal(cleaned.customStops.length, 2);
assert.deepEqual(cleaned.overrides, {});
const first = cleaned.customRoutes[0];
assert.equal(first.name, 'Valid M1');
assert.equal(first.headway, 5);
assert.equal(first.color, '#8068e8');
assert.deepEqual(first.stopIds, ['metro:safe:0', 'metro:safe:1']);
assert.deepEqual(first.geometry, [[[19.019, 50.259], [19.129, 50.279]]]);
assert.equal(first.templateId, undefined);
assert.equal(cleaned.customStops[0].city, 'Player');
assert.equal(cleaned.customStops[0].coordinateNote, 'Valid note');
const templateRoute = cleaned.customRoutes[1];
assert.equal(templateRoute.templateId, templates[0].id);
for (const [key, source] of Object.entries({ templateSourceUrl: 'sourceUrl', templateSourceTitle: 'sourceTitle', templateDescription: 'description', templateConfidence: 'confidence', templateStatus: 'status' })) {
  assert.deepEqual(templateRoute[key], templates[0][source]);
}
const serialized = JSON.stringify(cleaned);
for (const payload of ['javascript:', 'background-image', 'scenario-attack.invalid', '__proto__', 'polluted', 'unknown-template', 'Forged metadata', 'Invalid coordinates', 'Outside network', 'metro:huge']) assert.ok(!serialized.includes(payload), payload);
assert.equal(vm.runInNewContext('({}).polluted', context), undefined);
assert.deepEqual(Object.keys(first).sort(), ['id', 'source', 'name', 'longName', 'mode', 'color', 'headway', 'active', 'ring', 'edited', 'stopIds', 'geometry', 'vehicle', 'alignment'].sort());
assert.deepEqual(Object.keys(cleaned.customStops[0]).sort(), ['id', 'name', 'pos', 'city', 'schematic', 'coordinateNote'].sort());

for (const url of ['https://example.org/a?b=c', 'http://example.org/', 'HTTPS://example.org']) assert.equal(safeUrl(url), url);
for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', 'file:///tmp/x', 'ftp://example.org', '//example.org', '/local', 'https:', '', null, 3, {}]) assert.equal(safeUrl(url), '#');
assert.equal(safeColor('#123abc', 'rail'), '#123abc');
assert.equal(safeColor(null, '__proto__'), '#8068e8');
assert.equal(safeColor(null, 'constructor'), '#8068e8');
for (const color of ['red', '#fff', '#abcdef;background:url(x)', '#ABCDEF', null, {}]) assert.equal(safeColor(color, 'rail'), '#5387ef');

const published = network.routes[0];
const publishedStops = [...new Set(published.stopIds)].slice(0, 3);
const sample = () => ({ overrides: {}, customStops: [], customRoutes: [{ id: 'metro:legacy', source: 'player', mode: 'metro', name: 'M1', longName: 'Player-created metro line', headway: 8, active: true, stopIds: publishedStops, geometry: [[[0, 0], [1, 1]]], templateId: null, templateSourceUrl: null }] });
const long = sample();
Object.assign(long.customRoutes[0], { name: 'n'.repeat(40), longName: 'l'.repeat(200), headway: 100, active: 'false', ring: true, color: '#012abc', extra: 'discard' });
const longResult = clone(normalize(long));
assert.equal(longResult.customRoutes[0].name.length, 18);
assert.equal(longResult.customRoutes[0].longName.length, 120);
assert.equal(longResult.customRoutes[0].headway, 60);
assert.equal(longResult.customRoutes[0].active, true);
assert.equal(longResult.customRoutes[0].ring, true);
assert.equal(longResult.customRoutes[0].edited, true);
assert.equal(longResult.customRoutes[0].geometry[0].length, 4);
assert.deepEqual(longResult.customRoutes[0].geometry[0][0], longResult.customRoutes[0].geometry[0][3]);
assert.equal(longResult.customRoutes[0].extra, undefined);
for (const mode of ['bus', 'tram', 'rail', 'metro']) {
  const data = sample();
  data.customRoutes[0].mode = mode;
  data.customRoutes[0].headway = -10;
  assert.equal(normalize(data).customRoutes[0].headway, 3);
}
const invalid = sample();
invalid.customRoutes.push(clone(invalid.customRoutes[0]));
for (const id of ['Bad:route', 'metro:bad-id', 'metro:' + 'a'.repeat(60), '__proto__', published.id]) invalid.customRoutes.push({ ...invalid.customRoutes[0], id });
invalid.customRoutes.push({ ...invalid.customRoutes[0], id: 'metro:source', source: 'gtfs' }, { ...invalid.customRoutes[0], id: 'metro:mode', mode: 'bad' });
assert.equal(normalize(invalid).customRoutes.length, 1);
const stops = clone(fixture);
stops.customRoutes.pop();
stops.customStops[0].name = 'x'.repeat(100);
stops.customStops[0].coordinateNote = 'x'.repeat(400);
stops.customStops.push(clone(stops.customStops[0]), { id: 'metro:orphan:0', pos: [19, 50] }, { id: publishedStops[0], pos: [19, 50] }, { id: 'metro:safe:4', pos: [Infinity, 50] });
const stopResult = normalize(stops);
assert.equal(stopResult.customStops.length, 2);
assert.equal(stopResult.customStops[0].name.length, 60);
assert.equal(stopResult.customStops[0].coordinateNote.length, 200);

const edits = empty();
edits.overrides[published.id] = { headway: 999, active: false, color: 'red;display:none', geometry: [[[0, 0]]], edited: true, name: 'Forged', source: 'player', templateSourceUrl: 'javascript:alert(1)' };
let edit = clone(normalize(edits)).overrides[published.id];
assert.deepEqual(edit, { headway: 120, active: false, color: safeColor(null, published.mode) });
edits.overrides[published.id].stopIds = [publishedStops[0], publishedStops[0], 'unknown', publishedStops[1]];
edit = clone(normalize(edits)).overrides[published.id];
assert.deepEqual(edit.stopIds, clone(publishedStops.slice(0, 2)));
assert.deepEqual(edit.geometry, clone([publishedStops.slice(0, 2).map(id => network.stops.find(stop => stop.id === id).pos)]));
assert.equal(edit.edited, true);
edits.overrides[published.id].stopIds = [publishedStops[0]];
assert.equal(normalize(edits).overrides[published.id].geometry, undefined);
edits.overrides[published.id].stopIds = Array(301).fill(publishedStops[0]);
const overrideWarnings = [];
assert.equal(normalize(edits, warning => overrideWarnings.push(warning)).overrides[published.id].stopIds, undefined);
assert.match(overrideWarnings[0], /300/);
for (const [key, count, message] of [['customRoutes', 201, /custom routes.*200/], ['customStops', 5001, /custom stops.*5,000/]]) {
  const data = empty(); data[key] = Array(count).fill(null);
  assert.throws(() => normalize(data), message);
}
const tooManyOverrides = empty();
for (let i = 0; i <= network.routes.length; i++) tooManyOverrides.overrides[`unknown:${i}`] = {};
assert.throws(() => normalize(tooManyOverrides), new RegExp(`overrides.*${network.routes.length.toLocaleString('en-US')}`));
for (const data of [null, [], {}, { overrides: [], customRoutes: [], customStops: [] }]) assert.throws(() => normalize(data), /valid network scenario/);

// Exercise the actual file/local-storage loader code without map or simulation mocks.
const app = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const messages = [];
const elements = { 'import-file': {} };
const saved = new Map();
const loader = { window: context.window, Blob, network, region: { id: 'gzm', name: { en: 'Upper Silesian Metropolis' } }, t, LEGACY_VERSIONS: ['2026-09-23-gzm-v4', '2026-09-23-gzm-v3', '2026-09-23-gzm-v2', '2026-09-23-gzm-v1'], STORAGE: 'test-current', state: {}, toast: message => messages.push(message), $: id => elements[id], remember: () => {}, changed: () => {}, persist: () => {}, localStorage: { getItem: key => saved.get(key) || null } };
vm.createContext(loader);
vm.runInContext(app.slice(app.indexOf('  const { safeUrl }'), app.indexOf('  loadSaved();')), loader);
vm.runInContext(app.slice(app.indexOf("  $('import-file').onchange"), app.indexOf("  $('reset-button').onclick")), loader);
const importFile = async (data, size) => {
  const event = { target: { files: [{ size: size ?? new Blob([JSON.stringify(data)]).size, text: async () => JSON.stringify(data) }], value: 'selected' } };
  await elements['import-file'].onchange(event);
  assert.equal(event.target.value, '');
};
(async () => {
  for (const version of ['v1', 'v2', 'v3', 'v4']) {
    const oldExport = sample(); oldExport.networkVersion = `2026-09-23-gzm-${version}`;
    await importFile(oldExport);
    assert.equal(loader.state.customRoutes[0].id, 'metro:legacy', `old ${version} export survives import`);
    assert.equal(loader.state.customRoutes[0].geometry[0].length, publishedStops.length);
  }
  await importFile(fixture);
  assert.match(messages.at(-1), /stops per route limit \(300\)/);
  assert.deepEqual(clone(loader.state.customRoutes), cleaned.customRoutes);
  const before = JSON.stringify(loader.state);
  let read = false;
  await elements['import-file'].onchange({ target: { files: [{ size: 5 * 1024 * 1024 + 1, text: async () => { read = true; return '{}'; } }], value: '' } });
  assert.equal(read, false, 'oversize file is rejected before reading/parsing');
  assert.match(messages.at(-1), /file size limit \(5 MB\)/);
  assert.equal(JSON.stringify(loader.state), before);
  await importFile({ ...empty(), networkVersion: network.version, customRoutes: Array(201).fill(null) });
  assert.match(messages.at(-1), /custom routes.*200/);
  assert.equal(JSON.stringify(loader.state), before);
  saved.set('test-current', JSON.stringify(fixture));
  vm.runInContext('loadSaved()', loader);
  assert.deepEqual(clone(loader.state.customRoutes), cleaned.customRoutes);
  saved.delete('test-current');
  saved.set('transit-lab:gzm:2026-09-23-gzm-v1', JSON.stringify(sample()));
  vm.runInContext('loadSaved()', loader);
  assert.equal(loader.state.customRoutes[0].id, 'metro:legacy');
  saved.set('test-current', ' '.repeat(5 * 1024 * 1024 + 1));
  vm.runInContext('loadSaved()', loader);
  assert.match(messages.at(-1), /file size limit \(5 MB\)/);
  console.log('Scenario audit passed: whitelist, hostile fixture, limits, loaders and v1–v4 exports.');
})().catch(error => { console.error(error); process.exitCode = 1; });
})().catch(error => { console.error(error); process.exitCode = 1; });

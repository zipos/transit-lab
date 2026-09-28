const modes = ['bus', 'tram', 'rail', 'metro'];

function round6(value) { return Math.round(Number(value) * 1e6) / 1e6; }

function point(id, stopIndex, custom) {
  if (stopIndex.has(id)) return stopIndex.get(id);
  const stop = custom.get(id);
  if (!stop || !Array.isArray(stop.pos)) return null;
  return [round6(stop.pos[0]), round6(stop.pos[1]), stop.name || '', stop.schematic ? 1 : 0, stop.coordinateNote || ''];
}

export function minify(data, network, meta = {}) {
  const routeIndex = new Map(network.routes.map((route, index) => [route.id, index]));
  const stopIndex = new Map(network.stops.map((stop, index) => [stop.id, index]));
  const custom = new Map((data.customStops || []).map(stop => [stop.id, stop]));
  const overrides = [];
  for (const [id, edit] of Object.entries(data.overrides || {})) {
    if (!edit || typeof edit !== 'object') continue;
    const index = routeIndex.get(id);
    if (index == null) continue;
    overrides.push([
      index,
      Number.isFinite(edit.headway) ? edit.headway : null,
      typeof edit.active === 'boolean' ? (edit.active ? 1 : 0) : null,
      typeof edit.color === 'string' ? edit.color : null,
      Array.isArray(edit.stopIds) ? edit.stopIds.map(stopId => point(stopId, stopIndex, custom)).filter(item => item != null) : null
    ]);
  }
  const routes = (data.customRoutes || []).filter(route => route && typeof route === 'object').map(route => [
    route.name || '',
    route.longName || '',
    Math.max(0, modes.indexOf(route.mode)),
    route.color || '',
    route.headway,
    route.active === false ? 0 : 1,
    route.ring ? 1 : 0,
    route.templateId || '',
    (route.stopIds || []).map(stopId => point(stopId, stopIndex, custom)).filter(item => item != null)
  ]);
  const packed = { r: meta.region || data.region || '', v: meta.networkVersion || data.networkVersion || '', d: data.daypart || 'peak', n: meta.name || data.name || '', o: overrides, c: routes };
  const challenge = meta.challenge || data.challenge;
  if (challenge) packed.h = challenge;
  return packed;
}

function materialize(routeId, ref, index, network, customStops) {
  if (typeof ref === 'number') return network.stops[ref]?.id || null;
  if (!Array.isArray(ref) || ref.length < 2) return null;
  const id = `${routeId}:${index}`;
  customStops.push({
    id,
    name: String(ref[2] || ''),
    pos: [Number(ref[0]), Number(ref[1])],
    schematic: ref[3] === 1,
    coordinateNote: typeof ref[4] === 'string' ? ref[4] : ''
  });
  return id;
}

export function expand(packed, network) {
  if (!packed || typeof packed !== 'object' || Array.isArray(packed)) return { scenario: packed, region: '', networkVersion: '', name: '', challenge: null };
  if (!Array.isArray(packed.c) && !Array.isArray(packed.o)) {
    return { scenario: packed, region: packed.region || '', networkVersion: packed.networkVersion || '', name: packed.name || '', challenge: packed.challenge || packed.h || null };
  }
  const customStops = [];
  const customRoutes = (packed.c || []).map((row, index) => {
    const mode = modes[row[2]] || 'metro';
    const id = `${mode}:s${index.toString(36)}`;
    return {
      id, source: 'player', name: row[0] || '', longName: row[1] || '', mode, color: row[3] || '',
      headway: row[4], active: row[5] !== 0, ring: row[6] === 1, templateId: row[7] || null,
      stopIds: (row[8] || []).map((ref, stopIndex) => materialize(id, ref, stopIndex, network, customStops)).filter(Boolean)
    };
  });
  const overrides = {};
  for (const row of packed.o || []) {
    const route = network.routes[row[0]];
    if (!route || !row || typeof row !== 'object') continue;
    const edit = {};
    if (row[1] != null) edit.headway = row[1];
    if (row[2] != null) edit.active = row[2] === 1;
    if (row[3]) edit.color = row[3];
    if (Array.isArray(row[4])) edit.stopIds = row[4].map((ref, index) => materialize(route.id, ref, index, network, customStops)).filter(Boolean);
    overrides[route.id] = edit;
  }
  return {
    scenario: { overrides, customRoutes, customStops, daypart: packed.d || 'peak' },
    region: packed.r || '',
    networkVersion: packed.v || '',
    name: packed.n || '',
    challenge: packed.h || null
  };
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const normalized = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function compressJson(value) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompressJson(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

export function shareUrl(payload, regionId) {
  const url = new URL(location.href);
  url.searchParams.set('region', regionId);
  url.hash = `s=${payload}`;
  return url.toString();
}

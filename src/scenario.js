import { colors } from './modes.js';

const host = () => globalThis.window || globalThis;
const modeIds = new Set(Object.keys(colors));
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  const routeId = id => typeof id === 'string' && id.length <= 64 && /^[a-z]+:[a-z0-9]+(:[0-9]+)?$/.test(id);
  const headway = (value, max, fallback) => Number.isFinite(value) ? Math.max(3, Math.min(max, value)) : fallback;
  const safeUrl = value => {
    if (typeof value !== 'string') return '#';
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? value : '#';
    } catch (_) { return '#'; }
  };
  const safeColor = (value, mode = 'metro') => typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value) ? value : modeIds.has(mode) ? colors[mode] : colors.metro;

  function normalize(data, onWarning = () => {}) {
    if (!record(data) || !record(data.overrides) || !Array.isArray(data.customRoutes) || !Array.isArray(data.customStops)) throw new Error('This file is not a valid network scenario.');
    const network = host().TRANSIT_NETWORK;
    const templates = new Map((host().TRANSIT_TEMPLATES?.templates || []).map(template => [template.id, template]));
    const published = new Map(network.routes.map(route => [route.id, route]));
    const entries = Object.entries(data.overrides);
    const limit = (length, max, name) => {
      if (length > max) throw new Error(`Scenario exceeds the ${name} limit (${max.toLocaleString('en-US')}).`);
    };
    limit(data.customRoutes.length, 200, 'custom routes');
    limit(data.customStops.length, 5000, 'custom stops');
    limit(entries.length, network.routes.length, 'overrides');
    // Reject the entire offending sequence, while retaining other valid lines.
    const warnings = new Set();
    const withinStopLimit = ids => {
      if (ids.length <= 300) return true;
      warnings.add('Rejected a stop sequence exceeding the stops per route limit (300).');
      return false;
    };
    const ids = new Set(published.keys());
    const candidates = [];
    for (const raw of data.customRoutes) {
      if (!record(raw) || !routeId(raw.id) || ids.has(raw.id) || raw.source !== 'player' || !modeIds.has(raw.mode) || !Array.isArray(raw.stopIds)) continue;
      if (!withinStopLimit(raw.stopIds)) continue;
      ids.add(raw.id);
      candidates.push(raw);
    }
    const owners = new Set(candidates.map(route => route.id));
    const positions = new Map(network.stops.map(stop => [stop.id, stop.pos]));
    const bbox = network.bbox;
    const customStops = [];
    for (const raw of data.customStops) {
      if (!record(raw) || typeof raw.id !== 'string' || raw.id.length > 80 || positions.has(raw.id)) continue;
      const separator = raw.id.lastIndexOf(':');
      if (!owners.has(raw.id.slice(0, separator)) || !/^[0-9]+$/.test(raw.id.slice(separator + 1))) continue;
      if (!Array.isArray(raw.pos) || raw.pos.length !== 2 || !raw.pos.every(Number.isFinite)) continue;
      const [lon, lat] = raw.pos;
      if (lon < bbox[0] - .2 || lon > bbox[2] + .2 || lat < bbox[1] - .2 || lat > bbox[3] + .2) continue;
      const stop = {
        id: raw.id, name: text(raw.name, 60), pos: [lon, lat], city: 'Player',
        schematic: raw.schematic === true, coordinateNote: text(raw.coordinateNote, 200)
      };
      customStops.push(stop);
      positions.set(stop.id, stop.pos);
    }
    const stopSequence = values => {
      const result = [];
      for (const id of values) {
        if (typeof id === 'string' && positions.has(id) && id !== result[result.length - 1]) result.push(id);
      }
      return result;
    };
    const geometry = (stopIds, ring = false) => {
      const points = stopIds.map(id => positions.get(id).slice());
      if (ring) points.push(points[0].slice());
      return [points];
    };
    const customRoutes = [];
    for (const raw of candidates) {
      const stopIds = stopSequence(raw.stopIds);
      if (stopIds.length < 2) continue;
      const ring = raw.ring === true && stopIds.length >= 3;
      const route = {
        id: raw.id, source: 'player', name: text(raw.name, 18), longName: text(raw.longName, 120),
        mode: raw.mode, color: safeColor(raw.color, raw.mode), headway: headway(raw.headway, 60, 8),
        active: typeof raw.active === 'boolean' ? raw.active : true, ring, edited: true,
        stopIds, geometry: geometry(stopIds, ring)
      };
      const template = templates.get(raw.templateId);
      if (template) {
        route.templateId = template.id;
        route.templateSourceUrl = safeUrl(template.sourceUrl);
        route.templateSourceTitle = template.sourceTitle;
        route.templateDescription = template.description;
        route.templateConfidence = template.confidence;
        route.templateStatus = template.status;
      }
      customRoutes.push(route);
    }
    const overrides = {};
    for (const [id, raw] of entries) {
      const route = published.get(id);
      if (!route || !record(raw)) continue;
      const edit = {};
      if (Number.isFinite(raw.headway)) edit.headway = headway(raw.headway, 120, route.headway);
      if (typeof raw.active === 'boolean') edit.active = raw.active;
      if (Object.hasOwn(raw, 'color')) edit.color = safeColor(raw.color, route.mode);
      if (Array.isArray(raw.stopIds) && withinStopLimit(raw.stopIds)) {
        const stopIds = stopSequence(raw.stopIds);
        if (stopIds.length >= 2) {
          edit.stopIds = stopIds;
          edit.geometry = geometry(stopIds);
          edit.edited = true;
        }
      }
      overrides[id] = edit;
    }
    for (const warning of warnings) onWarning(warning);
    const daypart = data.daypart === 'midday' || data.daypart === 'saturday' ? data.daypart : 'peak';
    return { overrides, customRoutes, customStops, daypart };
  }

export { normalize, safeUrl, safeColor };

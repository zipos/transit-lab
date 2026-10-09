/* Insight map layers: passenger flow bands, travel-time fills, winners/losers. */
import { modes } from './modes.js';
import { choiceParams } from './sim/params.js';

const MODE_ORDER = { metro: 4, rail: 3, tram: 2, bus: 1 };

/**
 * Sum daily flow (and peak v/c) per undirected stop-pair × mode.
 * Parallel patterns on the same segment add into one band; peak v/c keeps the busiest segment’s names.
 */
export function aggregateFlowBands(flows) {
  const bands = new Map();
  if (!flows?.layout || !flows.segmentDaily) return [];
  for (const pattern of flows.layout) {
    const hourly = (60 / pattern.headway) * (pattern.capacity || modes[pattern.mode]?.capacity || 1);
    for (let s = 0; s < pattern.km.length; s++) {
      const daily = flows.segmentDaily[pattern.offset + s] || 0;
      if (!(daily > 0)) continue;
      const a = pattern.fromId[s];
      const b = pattern.toId[s];
      if (!a || !b) continue;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = `${pattern.mode}|${lo}|${hi}`;
      let band = bands.get(key);
      if (!band) {
        band = {
          mode: pattern.mode,
          fromId: lo,
          toId: hi,
          daily: 0,
          peakVc: 0,
          fromName: pattern.fromName[s],
          toName: pattern.toName[s],
        };
        bands.set(key, band);
      }
      band.daily += daily;
      const vc = hourly > 0 ? (daily * (flows.peakHourShare || choiceParams.peakHourShare)) / hourly : 0;
      if (vc > band.peakVc) {
        band.peakVc = vc;
        band.fromName = pattern.fromName[s];
        band.toName = pattern.toName[s];
      }
    }
  }
  return [...bands.values()];
}

export function flowBandCollection(flows, stopLookup) {
  const bands = aggregateFlowBands(flows);
  const features = [];
  for (const band of bands) {
    const from = stopLookup(band.fromId);
    const to = stopLookup(band.toId);
    if (!from?.pos || !to?.pos) continue;
    features.push({
      type: 'Feature',
      properties: {
        mode: band.mode,
        daily: Math.round(band.daily),
        sqrtFlow: Math.sqrt(band.daily),
        vc: +band.peakVc.toFixed(3),
        fromName: band.fromName,
        toName: band.toName,
        sort: MODE_ORDER[band.mode] || 0,
      },
      geometry: { type: 'LineString', coordinates: [from.pos, to.pos] },
    });
  }
  features.sort((a, b) => a.properties.sort - b.properties.sort);
  return { type: 'FeatureCollection', features };
}

export function flowStopCollection(flows, stopLookup) {
  const features = [];
  const stops = flows?.stops || {};
  for (const [id, values] of Object.entries(stops)) {
    const station = stopLookup(id);
    const boardings = values?.boardings || 0;
    if (!station?.pos || !(boardings > 0)) continue;
    features.push({
      type: 'Feature',
      properties: { id, name: station.name, boardings: Math.round(boardings), radius: Math.sqrt(boardings) },
      geometry: { type: 'Point', coordinates: station.pos },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function paintFlowCells(maskFeatures, zoneByCellId, zoneIndexById, access45, baseline45) {
  const features = maskFeatures.features.map(feature => {
    const zone = zoneByCellId.get(feature.properties.id);
    const index = zone ? zoneIndexById.get(zone.id) : undefined;
    const scenario = index == null ? 0 : (access45?.[index] || 0);
    const base = index == null ? 0 : (baseline45?.[index] || 0);
    const delta = scenario - base;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        access45: scenario,
        accessDelta: delta,
        zoneId: zone?.id || '',
        zoneResidents: zone?.residents || 0,
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

export function paintTravelCells(maskFeatures, zoneByCellId, zoneIndexById, zoneClock, baselineClock, compare) {
  const features = maskFeatures.features.map(feature => {
    const zone = zoneByCellId.get(feature.properties.id);
    const index = zone ? zoneIndexById.get(zone.id) : undefined;
    const minutes = index == null ? Infinity : zoneClock?.[index];
    const base = index == null ? Infinity : baselineClock?.[index];
    const finite = Number.isFinite(minutes);
    const saved = Number.isFinite(minutes) && Number.isFinite(base) ? base - minutes : 0;
    const band = !finite ? 99 : minutes <= 10 ? 10 : minutes <= 20 ? 20 : minutes <= 30 ? 30 : minutes <= 40 ? 40 : minutes <= 50 ? 50 : minutes <= 60 ? 60 : 99;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        travelMin: finite ? +minutes.toFixed(1) : 999,
        travelBand: band,
        minutesSaved: +saved.toFixed(1),
        compare: compare ? 1 : 0,
        zoneId: zone?.id || '',
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

export function vcColorExpression(dark) {
  return dark
    ? ['interpolate', ['linear'], ['get', 'vc'], 0, '#4c9183', 0.8, '#d6b476', 1, '#ca816b', 1.4, '#a95266']
    : ['interpolate', ['linear'], ['get', 'vc'], 0, '#5bb89a', 0.8, '#e4c76a', 1, '#e08a5a', 1.4, '#c44d5c'];
}

export function modeColorExpression() {
  return [
    'match', ['get', 'mode'],
    'metro', modes.metro.color,
    'rail', modes.rail.color,
    'tram', modes.tram.color,
    'bus', modes.bus.color,
    '#71879b',
  ];
}

function flowWidthCore() {
  return [
    'interpolate', ['linear'], ['zoom'],
    9, ['interpolate', ['linear'], ['get', 'sqrtFlow'], 0, 0.6, 20, 1.4, 60, 2.4, 120, 3.6],
    12, ['interpolate', ['linear'], ['get', 'sqrtFlow'], 0, 1.2, 20, 3, 60, 5.5, 120, 8],
    15, ['interpolate', ['linear'], ['get', 'sqrtFlow'], 0, 2, 20, 5, 60, 9, 120, 14],
  ];
}

/** Bus bands hidden below z11 (too dense at region scale); fixed-rail modes get a width boost. */
export function flowWidthExpression() {
  const core = flowWidthCore();
  return [
    'case',
    ['all', ['==', ['get', 'mode'], 'bus'], ['<', ['zoom'], 11]], 0,
    ['match', ['get', 'mode'], 'metro', ['*', core, 1.22], 'rail', ['*', core, 1.14], 'tram', ['*', core, 1.08], core],
  ];
}

export function flowBandOpacityExpression(active = 0.88) {
  return ['case', ['all', ['==', ['get', 'mode'], 'bus'], ['<', ['zoom'], 11]], 0, active];
}

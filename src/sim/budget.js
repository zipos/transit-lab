/* Planning-level capital and fleet costs. Figures and sources: docs/model-parameters.md § Capital and fleet costs.
   Stop-and-ask / disagreements: docs/decisions/31-cost-sources.md. Unit costs are PLN millions unless noted. */
import { modes, cruiseSpeed, costPerKm as opRate } from '../modes.js';

const MLN = 1_000_000;

/** Nominal PLN millions. Null = stop-and-ask — do not invent. */
export const defaultCostTable = {
  capitalCostPerKm: {
    metroTunnel: 340,
    metroElevated: 340, /* interim = tunnel rate; docs/decisions/31-cost-sources.md */
    tramSegregated: 65,
    tramStreet: 115,
    brtDedicated: 16,
    busStreet: 0,
    railNew: 160,
    railExisting: 0,
  },
  costPerStation: {
    underground: 0,
    elevated: 0, /* bundled with elevated km interim */
    tramStop: 0.04,
    railHalt: 26,
  },
  vehicleCost: {
    bus12: 3.14,
    bus18: 4.0,
    tram30: 17,
    emu3: 30,
    metro6: 30.6,
  },
  /** Stop-and-ask: no Polish per-station O&M found. */
  opCostPerStationYear: 0,
  annualFactor: 365,
  /** Gated until brief 23b; ticket÷ticket is not fare per boarding. */
  fareRevenuePerTrip: null,
  spareFactor: 1.1,
  capitalBudgetPLN: 5_000_000_000,
};

export function resolveBudgetParams(region = {}) {
  const fromRegion = region.budget && typeof region.budget === 'object' ? region.budget : {};
  return {
    capitalCostPerKm: { ...defaultCostTable.capitalCostPerKm, ...(fromRegion.capitalCostPerKm || {}) },
    costPerStation: { ...defaultCostTable.costPerStation, ...(fromRegion.costPerStation || {}) },
    vehicleCost: { ...defaultCostTable.vehicleCost, ...(fromRegion.vehicleCost || {}) },
    opCostPerStationYear: Number.isFinite(fromRegion.opCostPerStationYear)
      ? fromRegion.opCostPerStationYear
      : defaultCostTable.opCostPerStationYear,
    annualFactor: Number.isFinite(fromRegion.annualFactor) ? fromRegion.annualFactor : defaultCostTable.annualFactor,
    fareRevenuePerTrip: Number.isFinite(fromRegion.fareRevenuePerTrip)
      ? fromRegion.fareRevenuePerTrip
      : defaultCostTable.fareRevenuePerTrip,
    spareFactor: Number.isFinite(fromRegion.spareFactor) ? fromRegion.spareFactor : defaultCostTable.spareFactor,
    capitalBudgetPLN: Number.isFinite(fromRegion.capitalPLN)
      ? fromRegion.capitalPLN
      : (Number.isFinite(fromRegion.capitalBudgetPLN) ? fromRegion.capitalBudgetPLN : defaultCostTable.capitalBudgetPLN),
  };
}

export function capitalKmKey(mode, alignment) {
  if (mode === 'metro') return alignment === 'elevated' ? 'metroElevated' : 'metroTunnel';
  if (mode === 'tram') return alignment === 'segregated' ? 'tramSegregated' : 'tramStreet';
  if (mode === 'bus') return alignment === 'lane' ? 'brtDedicated' : 'busStreet';
  if (mode === 'rail') return alignment === 'existing' ? 'railExisting' : 'railNew';
  return null;
}

export function stationCostKey(mode, alignment) {
  if (mode === 'metro') return alignment === 'elevated' ? 'elevated' : 'underground';
  if (mode === 'rail') return 'railHalt';
  return 'tramStop';
}

function mlnToPln(mln) {
  if (mln == null || !Number.isFinite(mln)) return null;
  return mln * MLN;
}

/** Compatibility alias used by main / challenges / audits. */
export const capitalCosts = {
  ...defaultCostTable,
  defaultBudgetPLN: defaultCostTable.capitalBudgetPLN,
  mln: MLN,
  capitalPerKm: {
    metro_tunnel: mlnToPln(defaultCostTable.capitalCostPerKm.metroTunnel),
    metro_elevated: mlnToPln(defaultCostTable.capitalCostPerKm.metroElevated),
    tram_segregated: mlnToPln(defaultCostTable.capitalCostPerKm.tramSegregated),
    tram_street: mlnToPln(defaultCostTable.capitalCostPerKm.tramStreet),
    brt_dedicated: mlnToPln(defaultCostTable.capitalCostPerKm.brtDedicated),
    bus_street: mlnToPln(defaultCostTable.capitalCostPerKm.busStreet),
    rail_new: mlnToPln(defaultCostTable.capitalCostPerKm.railNew),
    rail_existing: mlnToPln(defaultCostTable.capitalCostPerKm.railExisting),
  },
};

/** One player line capital + fleet. Optional `kmFn` for tests. */
export function playerCapital(route, stopLookup, kmFn = haversineKm, params = defaultCostTable) {
  const lengthKm = routeLengthKm(route, stopLookup, kmFn);
  const capital = capitalCost(route, stopLookup, params, { lengthKm, km: kmFn });
  const headway = route.headway || modes[route.mode]?.defaultHeadway || 10;
  const fleet = fleetSize(route, lengthKm, headway, params);
  const fleetCap = fleetCapitalPLN(route, fleet, params);
  return {
    lengthKm,
    fleet,
    vehicles: fleet,
    infraPLN: capital.infraPLN,
    fleetPLN: fleetCap.fleetPLN,
    capital: capital.infraPLN + fleetCap.fleetPLN,
    operatingDaily: operatingDay(route, lengthKm, headway),
    pendingKeys: [...capital.pendingKeys, ...fleetCap.pendingKeys],
  };
}

export function capitalCostPerKmPln(mode, alignment, params = defaultCostTable) {
  const key = capitalKmKey(mode, alignment);
  if (!key) return null;
  return mlnToPln(params.capitalCostPerKm[key]);
}

export function stationCostPln(mode, alignment, params = defaultCostTable) {
  const key = stationCostKey(mode, alignment);
  return mlnToPln(params.costPerStation[key]);
}

export function vehicleCostPln(vehicleId, params = defaultCostTable) {
  if (vehicleId && params.vehicleCost[vehicleId] != null) return mlnToPln(params.vehicleCost[vehicleId]);
  return null;
}

function defaultVehicle(mode) {
  return modes[mode]?.vehicleOptions?.[0] || null;
}

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** One-way route length in km. Prefer stopLookup + optional haversine `km`. */
export function routeLengthKm(route, stopLookup, kmFn = haversineKm) {
  if (!route?.stopIds?.length) return 0;
  const ring = route.source === 'player' && route.ring === true && route.stopIds.length >= 3;
  const count = route.stopIds.length;
  const segments = ring ? count : count - 1;
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const from = stopLookup(route.stopIds[i]);
    const to = stopLookup(route.stopIds[(i + 1) % count]);
    if (!from?.pos || !to?.pos) continue;
    const hops = route.waypoints?.[i];
    if (Array.isArray(hops) && hops.length) {
      const chain = [from.pos, ...hops, to.pos];
      for (let k = 1; k < chain.length; k++) total += kmFn(chain[k - 1], chain[k]);
    } else {
      total += kmFn(from.pos, to.pos);
    }
  }
  if (!total && Array.isArray(route.geometry)) {
    for (const segment of route.geometry) {
      if (!Array.isArray(segment)) continue;
      for (let i = 1; i < segment.length; i++) total += kmFn(segment[i - 1], segment[i]);
    }
  }
  return total;
}

export function oneWayMinutes(route, lengthKm) {
  const mode = route.mode;
  const spec = modes[mode];
  const stops = route.stopIds?.length || 0;
  const segments = route.ring && stops >= 3 ? stops : Math.max(0, stops - 1);
  const dwell = (spec?.dwell || 0.55) * segments;
  const cruise = lengthKm / (cruiseSpeed[mode] || spec?.speed || 22) * 60;
  return dwell + cruise;
}

/** Fleet: ceil(round-trip ÷ headway) × spare, then ceil. */
export function fleetSize(route, lengthKm, headway, params = defaultCostTable) {
  const hw = Math.max(3, Number(headway) || modes[route.mode]?.defaultHeadway || 10);
  const oneWay = oneWayMinutes(route, lengthKm);
  const bothWays = route.source === 'player' && !route.ring;
  const roundTrip = bothWays ? oneWay * 2 : oneWay;
  const needed = Math.ceil(roundTrip / hw);
  const spare = params.spareFactor ?? defaultCostTable.spareFactor;
  return Math.max(1, Math.ceil(needed * spare));
}

/**
 * Infrastructure capital for a new player line (km + stations), in PLN.
 * Null unit rates (stop-and-ask) contribute 0 and are listed in pendingKeys.
 */
export function capitalCost(route, stopLookup, params = defaultCostTable, options = {}) {
  const kmFn = options.km || haversineKm;
  const lengthKm = options.lengthKm ?? routeLengthKm(route, stopLookup, kmFn);
  const alignment = route.alignment || modes[route.mode]?.alignmentOptions?.[0];
  const pendingKeys = [];
  let kmRate = capitalCostPerKmPln(route.mode, alignment, params);
  if (kmRate == null) {
    pendingKeys.push(`capitalCostPerKm.${capitalKmKey(route.mode, alignment)}`);
    kmRate = 0;
  }
  let perStation = stationCostPln(route.mode, alignment, params);
  if (perStation == null) {
    pendingKeys.push(`costPerStation.${stationCostKey(route.mode, alignment)}`);
    perStation = 0;
  }
  const stations = route.stopIds?.length || 0;
  return {
    infraPLN: lengthKm * kmRate + stations * perStation,
    lengthKm,
    stations,
    pendingKeys,
    alignment,
  };
}

export function fleetCapitalPLN(route, fleet, params = defaultCostTable) {
  const vehicleId = route.vehicle || defaultVehicle(route.mode);
  let unit = vehicleCostPln(vehicleId, params);
  const pendingKeys = [];
  if (unit == null) {
    pendingKeys.push(`vehicleCost.${vehicleId || route.mode}`);
    unit = 0;
  }
  return { fleetPLN: fleet * unit, vehicleId, unitPLN: unit, pendingKeys };
}

/** Daily operating cost: length × departures × directions × zł/km rate. */
export function operatingDay(route, lengthKm, headway) {
  const hw = Math.max(3, Number(headway) || modes[route.mode]?.defaultHeadway || 10);
  const bothWays = route.source === 'player' && !route.ring;
  const directions = bothWays ? 2 : 1;
  return lengthKm * (840 / hw) * directions * (opRate[route.mode] || 0);
}

export function operatingYear(dailyPLN, params = defaultCostTable) {
  return dailyPLN * (params.annualFactor ?? defaultCostTable.annualFactor);
}

export function isRevenueCalibrated(stats) {
  if (!stats) return false;
  if (stats.calibrated === true) return true;
  if (Number.isFinite(stats.asc) && stats.asc !== 0) return true;
  return false;
}

/**
 * Scenario roll-up for Results / pulse / challenges.
 * @returns {{
 *   capital, capitalInfra, capitalFleet, budgetCap, overBudget,
 *   opDeltaYear, revenueYear, calibrated, fareboxRecovery, costPerNewRider,
 *   lines: Record<id, { capital, infra, fleetCost, fleet, fleetDelta, operating }>
 * }}
 */
export function summarizeBudget({
  customRoutes = [],
  overrides = {},
  publishedRoutes = [],
  stopLookup,
  km = haversineKm,
  resolveService,
  daypart = 'peak',
  stats = null,
  baseline = null,
  budgetCap = null,
  params = null,
  region = null,
} = {}) {
  const table = params || resolveBudgetParams(region || {});
  const cap = Number.isFinite(budgetCap) ? budgetCap : table.capitalBudgetPLN;
  const annual = table.annualFactor ?? defaultCostTable.annualFactor;
  let infraPLN = 0;
  let fleetPLN = 0;
  let operatingDaily = 0;
  const lines = {};
  const pendingKeys = new Set();
  const publishedById = new Map((publishedRoutes || []).map(route => [route.id, route]));
  const lookup = typeof stopLookup === 'function' ? stopLookup : (id => null);

  for (const route of customRoutes || []) {
    if (!route || route.active === false) continue;
    const service = resolveService
      ? resolveService(route, daypart)
      : { runs: true, headway: route.headway };
    if (!service.runs) continue;
    const lengthKm = routeLengthKm(route, lookup, km);
    const headway = service.headway;
    const capital = capitalCost(route, lookup, table, { lengthKm, km });
    capital.pendingKeys.forEach(key => pendingKeys.add(key));
    const fleet = fleetSize(route, lengthKm, headway, table);
    const fleetCap = fleetCapitalPLN(route, fleet, table);
    fleetCap.pendingKeys.forEach(key => pendingKeys.add(key));
    const opDaily = operatingDay(route, lengthKm, headway);
    infraPLN += capital.infraPLN;
    fleetPLN += fleetCap.fleetPLN;
    operatingDaily += opDaily;
    lines[route.id] = {
      capital: capital.infraPLN + fleetCap.fleetPLN,
      infra: capital.infraPLN,
      fleetCost: fleetCap.fleetPLN,
      fleet,
      fleetDelta: fleet,
      operating: opDaily,
      lengthKm,
      headway,
      source: 'player',
    };
  }

  for (const [id, edit] of Object.entries(overrides || {})) {
    const published = publishedById.get(id);
    if (!published) continue;
    const merged = { ...published, ...edit };
    if (merged.active === false) continue;
    const service = resolveService
      ? resolveService(merged, daypart)
      : { runs: true, headway: merged.headway };
    if (!service.runs) continue;
    const baseService = resolveService
      ? resolveService(published, daypart)
      : { runs: true, headway: published.headway };
    const lengthKm = routeLengthKm(merged, lookup, km);
    const baseLength = routeLengthKm(published, lookup, km);
    const fleet = fleetSize(merged, lengthKm, service.headway, table);
    const baseFleet = baseService.runs ? fleetSize(published, baseLength, baseService.headway, table) : 0;
    const fleetDelta = Math.max(0, fleet - baseFleet);
    const vehicleId = merged.vehicle || defaultVehicle(merged.mode);
    let unit = vehicleCostPln(vehicleId, table);
    if (unit == null) {
      pendingKeys.add(`vehicleCost.${vehicleId || merged.mode}`);
      unit = 0;
    }
    const extraFleetPLN = fleetDelta * unit;
    const opDaily = operatingDay(merged, lengthKm, service.headway);
    const baseOp = baseService.runs ? operatingDay(published, baseLength, baseService.headway) : 0;
    fleetPLN += extraFleetPLN;
    operatingDaily += opDaily - baseOp;
    lines[id] = {
      capital: extraFleetPLN,
      infra: 0,
      fleetCost: extraFleetPLN,
      fleet,
      fleetDelta,
      operating: opDaily,
      operatingDelta: opDaily - baseOp,
      lengthKm,
      headway: service.headway,
      source: 'published',
    };
  }

  const capital = infraPLN + fleetPLN;
  const calibrated = isRevenueCalibrated(stats);
  const opDeltaYear = baseline && stats
    ? (stats.cost - baseline.cost) * annual
    : operatingDaily * annual;
  const boardings = stats?.boardings ?? 0;
  const baseBoardings = baseline?.boardings ?? 0;
  const revenueYear = calibrated && table.fareRevenuePerTrip != null
    ? (boardings - baseBoardings) * table.fareRevenuePerTrip * annual
    : null;
  const newRiders = baseline
    ? Math.max(0, (stats?.passengers || 0) - (baseline.passengers || 0))
    : 0;
  const costPerNewRider = newRiders > 0 ? capital / newRiders : null;
  const fareboxRecovery = calibrated && table.fareRevenuePerTrip != null && stats?.cost > 0
    ? (boardings * table.fareRevenuePerTrip) / stats.cost
    : null;

  return {
    capital,
    capitalInfra: infraPLN,
    capitalFleet: fleetPLN,
    budgetCap: cap,
    overBudget: capital > cap,
    opDeltaYear,
    revenueYear,
    calibrated,
    fareboxRecovery,
    costPerNewRider,
    newDailyRiders: newRiders,
    pendingKeys: [...pendingKeys],
    lines,
  };
}

/** Synthetic line for audits (fixed length / station count). */
export function lineCostFromSpec({
  mode,
  alignment,
  lengthKm,
  stations,
  headway,
  vehicle,
  ring = false,
  params = defaultCostTable,
}) {
  const route = {
    source: 'player',
    mode,
    alignment,
    vehicle: vehicle || defaultVehicle(mode),
    ring,
    stopIds: Array.from({ length: stations }, (_, i) => `s${i}`),
    headway,
  };
  const kmRate = capitalCostPerKmPln(mode, alignment, params) ?? 0;
  const stRate = stationCostPln(mode, alignment, params) ?? 0;
  const infraPLN = lengthKm * kmRate + stations * stRate;
  const fleet = fleetSize(route, lengthKm, headway, params);
  const fleetCap = fleetCapitalPLN(route, fleet, params);
  const opDaily = operatingDay(route, lengthKm, headway);
  return {
    infraPLN,
    fleet,
    fleetPLN: fleetCap.fleetPLN,
    operatingDaily: opDaily,
    operatingYear: operatingYear(opDaily, params),
    capitalTotalPLN: infraPLN + fleetCap.fleetPLN,
  };
}

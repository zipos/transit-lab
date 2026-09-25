/* Deterministic accessibility model. All outputs are estimates, never observed ridership. */
(() => {
  const zones = [
    ['Katowice Centrum', 19.019, 50.259], ['Katowice Dąb', 19.001, 50.274],
    ['Katowice Brynów', 18.998, 50.231], ['Katowice Ligota', 18.979, 50.226],
    ['Katowice Zawodzie', 19.055, 50.258], ['Katowice Szopienice', 19.093, 50.258],
    ['Chorzów Centrum', 18.956, 50.299], ['Chorzów Batory', 18.946, 50.277],
    ['Chorzów Stary', 18.958, 50.316], ['Sosnowiec Centrum', 19.127, 50.279],
    ['Sosnowiec Pogoń', 19.145, 50.294], ['Sosnowiec Zagórze', 19.178, 50.304],
    ['Sosnowiec Niwka', 19.151, 50.244], ['Sosnowiec Dańdówka', 19.160, 50.265],
    ['Siemianowice Centrum', 19.029, 50.300], ['Siemianowice Michałkowice', 19.004, 50.320],
    ['Mysłowice Centrum', 19.132, 50.241], ['Mysłowice Brzęczkowice', 19.155, 50.218],
    ['Mysłowice Wesoła', 19.108, 50.194],
    ['Mikołów Centrum', 18.900, 50.172], ['Mikołów Zachód', 18.830, 50.192],
    ['Łaziska Górne Centrum', 18.841, 50.149], ['Łaziska Średnie', 18.867, 50.135],
    ['Orzesze Centrum', 18.778, 50.146], ['Orzesze Południe', 18.800, 50.090],
  ];
  const speed = { bus: 22, tram: 25, rail: 48, metro: 42 };
  const capacity = { bus: 75, tram: 170, rail: 380, metro: 650 };
  const costPerKm = { bus: 12, tram: 20, rail: 38, metro: 55 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = Math.PI / 180;
  function km(a, b) {
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  // Fixed neighborhood anchors keep the path search small. Published grid residents,
  // assigned to the nearest anchor, determine both origin and destination weights.
  const populationCells = window.GZM_POPULATION?.cells || [];
  const zoneResidents = zones.map(() => 0);
  for (const cell of populationCells) {
    const residents = Number(cell.population);
    if (!(residents > 0) || !Number.isFinite(+cell.lon) || !Number.isFinite(+cell.lat)) continue;
    const point = [+cell.lon, +cell.lat];
    let closest = 0, distance = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const d = km(point, [zones[i][1], zones[i][2]]);
      if (d < distance) { distance = d; closest = i; }
    }
    zoneResidents[closest] += residents;
  }
  const residentTotal = zoneResidents.reduce((a, b) => a + b, 0);
  // 0.6 potential cross-neighborhood journeys per resident/day is a game
  // assumption, not a published travel survey result.
  const estimatedDemand = residentTotal > 0 ? Math.round(residentTotal * .6) : 90000;
  const meanResidents = residentTotal / zones.length || 1;
  const zoneWeights = residentTotal > 0 ? zoneResidents.map(n => n / meanResidents) : zones.map(() => 1);
  class Heap {
    constructor() { this.a = []; }
    push(x) { const a = this.a; let i = a.length; a.push(x); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= x[0]) break; a[i] = a[p]; i = p; } a[i] = x; }
    pop() { const a = this.a, first = a[0], x = a.pop(); if (!a.length) return first; let i = 0; while (i * 2 + 1 < a.length) { let j = i * 2 + 1; if (j + 1 < a.length && a[j + 1][0] < a[j][0]) j++; if (a[j][0] >= x[0]) break; a[i] = a[j]; i = j; } a[i] = x; return first; }
    get length() { return this.a.length; }
  }
  function calculate(network, customRoutes, customStops, overrides) {
    const routes = network.routes.concat(customRoutes).map(route => ({ ...route, ...(overrides[route.id] || {}) })).filter(route => route.active !== false);
    const stops = network.stops.concat(customStops);
    const stopMap = new Map(stops.map((s, i) => [s.id, { ...s, index: i }]));
    const graph = Array.from({ length: stops.length }, () => []);
    const addNode = () => (graph.push([]), graph.length - 1);
    // A separate arrival state allows one station-to-station walk before the next boarding,
    // but prevents adjacent 340 m links from chaining into unbounded pedestrian journeys.
    const transferArrival = new Map(stops.map(s => [s.id, addNode()]));
    const edge = (a, b, mins, wait = 0, board = 0, walk = false) => graph[a].push([b, mins, wait, board, walk]);
    // Nearby platforms provide a single walkable interchange. This is a geometric proxy, not a pedestrian router.
    const cells = new Map(), cell = p => `${Math.floor(p[0] / .003)}:${Math.floor(p[1] / .003)}`;
    for (const s of stops) {
      const key = cell(s.pos); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(s);
    }
    for (const s of stops) {
      const x = Math.floor(s.pos[0] / .003), y = Math.floor(s.pos[1] / .003);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${x + dx}:${y + dy}`) || []) {
          if (s.id >= other.id) continue;
          const dist = km(s.pos, other.pos);
          if (dist > .34) continue;
          const t = 1.2 + dist / 4.5 * 60;
          edge(stopMap.get(s.id).index, transferArrival.get(other.id), t, 0, 0, true);
          edge(stopMap.get(other.id).index, transferArrival.get(s.id), t, 0, 0, true);
        }
      }
    }
    function routeDistanceFactor(route, sequence) {
      const fallback = route.mode === 'metro' ? 1.08 : 1.2;
      if (route.edited || !Array.isArray(route.geometry)) return fallback;
      let stopLength = 0, shapeLength = 0;
      for (let i = 1; i < sequence.length; i++) stopLength += km(sequence[i - 1].pos, sequence[i].pos);
      for (const segment of route.geometry) {
        if (!Array.isArray(segment)) continue;
        for (let i = 1; i < segment.length; i++) shapeLength += km(segment[i - 1], segment[i]);
      }
      const ratio = shapeLength / stopLength;
      // Imported shapes can be abbreviated or mismatched to the selected trip.
      // Accept only plausible whole-pattern detours; otherwise retain the mode fallback.
      return stopLength > 1 && Number.isFinite(ratio) && ratio >= .95 && ratio <= 1.7
        ? clamp(ratio, 1.02, 1.6)
        : fallback;
    }
    let serviceKm = 0, seatTrips = 0;
    for (const r of routes) {
      const seq = r.stopIds.map(id => stopMap.get(id)).filter(Boolean);
      if (seq.length < 2) continue;
      const headway = clamp(Number(r.headway) || 30, 3, 120);
      const distanceFactor = routeDistanceFactor(r, seq);
      const departures = 840 / headway;
      // Ring service follows the drawn stop order and closes back to the first stop.
      // Other player lines run in both directions; GTFS patterns are directional.
      const ring = r.source === 'player' && r.ring === true && seq.length >= 3;
      for (const direction of r.source === 'player' && !ring ? [seq, seq.slice().reverse()] : [seq]) {
        const onboard = direction.map(() => addNode());
        let length = 0;
        for (let i = 0; i < direction.length; i++) {
          for (const platform of [direction[i].index, transferArrival.get(direction[i].id)]) {
            edge(platform, onboard[i], headway / 2 + 1, headway / 2, 1);
          }
          edge(onboard[i], direction[i].index, .3);
          if (i < direction.length - 1 || ring) {
            const next = (i + 1) % direction.length;
            const distance = km(direction[i].pos, direction[next].pos) * distanceFactor;
            length += distance;
            edge(onboard[i], onboard[next], .55 + distance / speed[r.mode] * 60);
          }
        }
        serviceKm += length * departures * costPerKm[r.mode];
        seatTrips += departures * capacity[r.mode];
      }
    }
    const zoneStops = zones.map(z => {
      const p = [z[1], z[2]];
      return stops.map(s => [stopMap.get(s.id).index, km(p, s.pos)]).sort((a, b) => a[1] - b[1]).slice(0, 5).filter(x => x[1] < 1.4);
    });
    let demandTotal = 0, riders = 0, satisfaction = 0, waitTotal = 0, travelTotal = 0, transferTotal = 0, reachedWeight = 0;
    for (let i = 0; i < zones.length; i++) {
      const dist = new Float64Array(graph.length).fill(Infinity);
      const wait = new Float64Array(graph.length);
      const boards = new Uint8Array(graph.length);
      const heap = new Heap();
      for (const [idx, distance] of zoneStops[i]) {
        const t = distance / 4.5 * 60;
        if (t < dist[idx]) { dist[idx] = t; heap.push([t, idx]); }
      }
      while (heap.length) {
        const [cost, at] = heap.pop();
        if (cost > dist[at] + 1e-8) continue;
        for (const [to, mins, waiting, boarding, walking] of graph[at]) {
          // Before the first boarding, the zone-to-stop walk already models access.
          if (walking && boards[at] === 0) continue;
          const next = cost + mins + (boarding && boards[at] ? 4 : 0);
          if (next + 1e-8 < dist[to]) {
            dist[to] = next; wait[to] = wait[at] + waiting; boards[to] = boards[at] + boarding; heap.push([next, to]);
          }
        }
      }
      for (let j = 0; j < zones.length; j++) {
        if (i === j) continue;
        const straight = km([zones[i][1], zones[i][2]], [zones[j][1], zones[j][2]]);
        // Nearby destinations are more likely than equally populated distant ones.
        const weight = zoneWeights[i] * zoneWeights[j] / (1 + straight / 6);
        demandTotal += weight;
        let best = Infinity, bestNode = -1;
        for (const [idx, distance] of zoneStops[j]) {
          const time = dist[idx] + distance / 4.5 * 60;
          if (time < best) { best = time; bestNode = idx; }
        }
        // A walk-only path is not a public-transport passenger trip.
        if (!Number.isFinite(best) || boards[bestNode] === 0) continue;
        const reference = Math.max(8, straight / 28 * 60);
        const share = clamp(1 / (1 + Math.exp((best - reference * 1.65 - 11) / 8)), 0, 1);
        const served = weight * share;
        const score = clamp(93 - (best - reference) * .72 - wait[bestNode] * .28 - Math.max(0, boards[bestNode] - 1) * 3, 8, 96);
        riders += served; reachedWeight += served; satisfaction += score * served;
        waitTotal += wait[bestNode] * served; travelTotal += best * served;
        transferTotal += Math.max(0, boards[bestNode] - 1) * served;
      }
    }
    const passengerCount = Math.round(estimatedDemand * riders / Math.max(1, demandTotal));
    return {
      demandPopulation: residentTotal,
      demandTrips: estimatedDemand,
      passengers: passengerCount,
      satisfaction: +(satisfaction / Math.max(1, reachedWeight)).toFixed(2),
      wait: +(waitTotal / Math.max(1, reachedWeight)).toFixed(2),
      travel: +(travelTotal / Math.max(1, reachedWeight)).toFixed(2),
      transfers: +(transferTotal / Math.max(1, reachedWeight)).toFixed(2),
      load: Math.round(clamp(passengerCount / Math.max(1, seatTrips) * 100, 0, 150)),
      cost: Math.round(serviceKm),
      coverage: Math.round(riders / Math.max(1, demandTotal) * 100),
    };
  }
  window.TransitSim = { calculate, km, zones };
})();

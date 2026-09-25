(() => {
  'use strict';
  const network = window.GZM_NETWORK;
  const sim = window.TransitSim;
  const population = window.GZM_POPULATION;
  const templates = window.GZM_TEMPLATES?.templates || [];
  const densityCells = Array.isArray(population?.cells) ? population.cells.filter(c => Number.isFinite(+c.lon) && Number.isFinite(+c.lat) && Number.isFinite(+c.density) && +c.density > 0) : [];
  const maskCells = Array.isArray(population?.maskCells) ? population.maskCells.filter(c => c.geometry?.type === 'Polygon' && Number.isFinite(+c.density)) : [];
  const cityBoundaries = population?.cityBoundaries?.type === 'FeatureCollection' ? population.cityBoundaries : { type: 'FeatureCollection', features: [] };
  const STORAGE = 'gzm-transit-lab:' + (network && network.version);
  const DISPLAY_STORAGE = 'gzm-transit-lab:display';
  const LEGACY_VERSIONS = ['2026-09-23-gzm-v2', '2026-09-23-gzm-v1'];
  const $ = id => document.getElementById(id);
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const format = n => new Intl.NumberFormat('en-GB').format(Math.round(n));
  const compactMillions = n => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}m` : format(n);
  const colors = { bus: '#ef705e', tram: '#15b8c7', rail: '#5387ef', metro: '#8068e8' };
  const empty = () => ({ overrides: {}, customRoutes: [], customStops: [] });
  const state = { ...empty(), selected: null, selectedStop: null, filter: 'all', search: '', showAll: false, tool: 'inspect', draft: [], draftRing: false, movingDraftIndex: null, draftName: 'M1', draftMode: 'metro', draftTemplate: null, draftColor: '#8068e8', draftHeadway: 8, playing: false, speed: 1, minutes: 420, elapsedMinutes: 0, stats: null, baseline: null, history: [], mobileView: 'map', populationVisible: maskCells.length > 0, activeLayer: 'population', mapModes: { bus: true, tram: true, rail: true, metro: true }, networkOpen: true, inspectorOpen: innerWidth > 1050 };
  let map, toastTimer, lastFrame = 0, lastVehicles = 0, animationFrame = 0, recomputeTimer, hoverBound = false, modalReturnFocus = null, modalInertState = [], contextLocation = null, accessCache = null, rulerPoints = [], rulerHover = null, rulerActive = false, middleDragIndex = null, middleDragOriginal = null, themeChangeToken = 0;

  if (!network || !sim || !window.maplibregl) {
    $('loading').innerHTML = '<strong>Could not open the game</strong><small>Check your internet connection, then reload. MapLibre and map tiles are loaded online.</small>';
    return;
  }

  const byId = new Map(network.stops.map(s => [s.id, s]));
  const focusBounds = population?.bbox || network.bbox || [18.88, 50.12, 19.33, 50.36];
  const fitFocus = () => map.fitBounds([[focusBounds[0], focusBounds[1]], [focusBounds[2], focusBounds[3]]], { padding: fitPadding(), maxZoom: 11.5, duration: 650 });
  function stop(id) { return byId.get(id) || state.customStops.find(s => s.id === id); }
  function allRoutes() { return network.routes.concat(state.customRoutes).map(r => ({ ...r, ...(state.overrides[r.id] || {}) })); }
  function routeById(id) { return allRoutes().find(r => r.id === id); }
  function routeColor(r) { return r.source === 'player' || r.mode === 'metro' ? (r.color || colors[r.mode]) : colors[r.mode]; }
  function modeLabel(mode) { return ({ metro: 'Metro', tram: 'Tram', rail: 'Rail' })[mode] || String(mode || 'line'); }
  function nextDraftName(mode) {
    const prefix = ({ metro: 'M', tram: 'T', rail: 'R' })[mode] || 'L';
    const used = new Set(state.customRoutes.filter(r => r.mode === mode).map(r => r.name));
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }
  function fitPadding() {
    if (innerWidth <= 600) return { top: 132, bottom: state.mobileView === 'map' ? 85 : 340, left: 18, right: 18 };
    const css = getComputedStyle(document.documentElement);
    const leftPane = parseFloat(css.getPropertyValue('--network-pane-width')) || 320;
    const rightPane = parseFloat(css.getPropertyValue('--inspector-pane-width')) || 320;
    return { top: 95, bottom: 75, left: state.networkOpen ? leftPane + 15 : 75, right: state.inspectorOpen ? rightPane + 15 : 75 };
  }
  function snapshot() { return JSON.stringify({ overrides: state.overrides, customRoutes: state.customRoutes, customStops: state.customStops }); }
  function remember() { state.history.push(snapshot()); if (state.history.length > 30) state.history.shift(); }
  function persist() { try { localStorage.setItem(STORAGE, snapshot()); } catch (_) { toast('Local storage unavailable. Export your network to keep it.'); } }
  function normalizeScenario(data) {
    if (!data || !data.overrides || typeof data.overrides !== 'object' || Array.isArray(data.overrides) || !Array.isArray(data.customRoutes) || !Array.isArray(data.customStops)) throw new Error('This file is not a valid network scenario.');
    const customStops = data.customStops.filter(s => typeof s.id === 'string' && Array.isArray(s.pos) && s.pos.length === 2 && s.pos.every(Number.isFinite));
    const positions = new Map(network.stops.concat(customStops).map(s => [s.id, s.pos]));
    const customRoutes = data.customRoutes.filter(r => typeof r.id === 'string' && Array.isArray(r.stopIds) && ['metro', 'tram', 'rail'].includes(r.mode)).map(r => {
      const stopIds = r.stopIds.filter(id => positions.has(id));
      const ring = r.ring === true && stopIds.length >= 3;
      return { ...r, ring, stopIds, geometry: ring || stopIds.length !== r.stopIds.length || !Array.isArray(r.geometry) ? [stopIds.concat(ring ? stopIds[0] : []).map(id => positions.get(id))] : r.geometry };
    }).filter(r => r.stopIds.length >= 2);
    const validRouteIds = new Set(network.routes.map(r => r.id));
    const overrides = {};
    for (const [id, raw] of Object.entries(data.overrides)) {
      if (!validRouteIds.has(id) || !raw || typeof raw !== 'object') continue;
      const edit = { ...raw };
      if (Array.isArray(edit.stopIds)) {
        const stopIds = edit.stopIds.filter(stopId => positions.has(stopId));
        if (stopIds.length < 2) { delete edit.stopIds; delete edit.geometry; }
        else if (stopIds.length !== edit.stopIds.length) { edit.stopIds = stopIds; edit.geometry = [stopIds.map(stopId => positions.get(stopId))]; }
      }
      overrides[id] = edit;
    }
    return { overrides, customRoutes, customStops };
  }
  function loadSaved() {
    try {
      const current = localStorage.getItem(STORAGE);
      const legacy = !current && LEGACY_VERSIONS.map(version => localStorage.getItem('gzm-transit-lab:' + version)).find(Boolean);
      if (current || legacy) {
        Object.assign(state, normalizeScenario(JSON.parse(current || legacy)));
        if (legacy) persist();
      }
    } catch (_) { /* A damaged save simply leaves the source snapshot intact. */ }
  }
  loadSaved();
  let showFullscreenButton = true;
  try { showFullscreenButton = JSON.parse(localStorage.getItem(DISPLAY_STORAGE) || '{}').showFullscreenButton !== false; } catch (_) {}
  function renderFullscreen() {
    $('fullscreen-button').hidden = !showFullscreenButton;
    const active = !!document.fullscreenElement;
    $('fullscreen-button').innerHTML = `<span aria-hidden="true">⛶</span><span class="fullscreen-text">${active ? 'Exit fullscreen' : 'Fullscreen'}</span>`;
    $('fullscreen-button').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fullscreen-button').setAttribute('aria-pressed', String(active));
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { toast('Fullscreen is unavailable in this browser.'); }
  }
  function openSettings() {
    modal(`<span class="chip">DISPLAY SETTINGS</span><h2>Display</h2><div class="form-stack"><button id="settings-fullscreen" type="button">${document.fullscreenElement ? 'Exit' : 'Enter'} fullscreen</button><label class="toggle-row"><input id="settings-fullscreen-visible" type="checkbox" ${showFullscreenButton ? 'checked' : ''}> Show fullscreen button</label><p class="fine-print">Press F to toggle fullscreen while the map or a panel has focus. Escape exits fullscreen.</p></div>`);
    $('settings-fullscreen').onclick = async () => { closeModal(); await toggleFullscreen(); };
    $('settings-fullscreen-visible').onchange = e => {
      showFullscreenButton = e.target.checked;
      try { localStorage.setItem(DISPLAY_STORAGE, JSON.stringify({ showFullscreenButton })); } catch (_) {}
      renderFullscreen();
    };
  }
  document.addEventListener('fullscreenchange', () => { renderFullscreen(); setTimeout(() => map?.resize(), 50); });
  renderFullscreen();
  $('heatmap-toggle').disabled = !maskCells.length;
  renderPopulationControl();
  // Keep scenario feedback visible before the long imported-line list.
  $('mode-filters').closest('.section').before($('stats').closest('.section'));
  $('stats').closest('.section').after($('template-section'));
  function setMobileView(view) {
    state.mobileView = view; document.body.dataset.mobileView = view;
    document.querySelectorAll('.mobile-tabs button').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    setTimeout(() => map?.resize(), 30);
  }
  setMobileView('map');
  function setPanel(panel, open) {
    const left = panel === 'network';
    state[left ? 'networkOpen' : 'inspectorOpen'] = open;
    document.body.dataset[left ? 'networkOpen' : 'inspectorOpen'] = String(open);
    const rail = $(left ? 'network-rail' : 'inspector-rail');
    rail.setAttribute('aria-expanded', String(open));
    rail.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} ${left ? 'network' : 'inspector'} panel`);
    rail.textContent = left ? (open ? '‹' : '›') : (open ? '›' : '‹');
    setTimeout(() => map?.resize(), 190);
  }
  setPanel('network', state.networkOpen);
  setPanel('inspector', state.inspectorOpen);

  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3300);
  }
  function renderPopulationControl() {
    const toggle = $('heatmap-toggle');
    toggle.setAttribute('aria-checked', String(state.populationVisible));
    toggle.setAttribute('aria-label', `${state.populationVisible ? 'Hide' : 'Show'} selected planning layer`);
    toggle.lastChild.textContent = state.populationVisible ? ' On' : ' Off';
    $('heatmap-legend').hidden = !state.populationVisible;
    $('planning-layer').value = state.activeLayer;
    $('heatmap-legend').dataset.layer = state.activeLayer;
    const isAccess = state.activeLayer === 'access';
    $('heatmap-caption').textContent = isAccess ? '2026 GTFS · cell-center straight-line distance' : `${population?.source?.year || '2021'} · ${population?.source?.shortName || 'GUS 1 km resident grid'}`;
    $('layer-legend-title').textContent = isAccess ? 'To active tram, rail or metro stop' : 'Residents per km² · 1 km cells';
    $('layer-legend-min').textContent = '0';
    $('layer-legend-max').textContent = isAccess ? '3 km+' : '8,000+';
    for (const [id, layer] of [['city-population-fill', 'shared'], ['population-grid-fill', 'population'], ['city-population-outline', 'shared'], ['access-grid-fill', 'access']]) {
      if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', state.populationVisible && (layer === 'shared' || state.activeLayer === layer) ? 'visible' : 'none');
    }
  }
  function modal(html) {
    modalReturnFocus = document.activeElement;
    $('modal-content').innerHTML = html;
    const heading = $('modal-content').querySelector('h2');
    if (heading) heading.id = 'modal-title';
    modalInertState = [...document.body.children].filter(el => el !== $('modal')).map(el => [el, el.inert]);
    modalInertState.forEach(([el]) => { el.inert = true; });
    $('modal').hidden = false;
    $('modal-close').focus();
  }
  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    modalInertState.forEach(([el, inert]) => { el.inert = inert; });
    modalInertState = [];
    const target = modalReturnFocus;
    modalReturnFocus = null;
    if (target?.isConnected && target.getClientRects().length) target.focus();
  }

  const themeMedia = matchMedia('(prefers-color-scheme: dark)');
  const mapStyle = () => `https://tiles.openfreemap.org/styles/${themeMedia.matches ? 'dark' : 'liberty'}`;
  map = new maplibregl.Map({
    container: 'map', style: mapStyle(),
    center: [19.104, 50.239], zoom: 9.7, pitch: 28, bearing: -6,
    minZoom: 8.2, maxZoom: 18, maxPitch: 60,
    attributionControl: false, antialias: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.on('error', ev => { if (ev.error && /style|tile|fetch|network/i.test(ev.error.message || '')) $('loading')?.classList.add('failed'); });
  const restoreGameLayers = () => {
    if (!map.getStyle()?.layers || map.getLayer('routes')) return;
    if (themeMedia.matches) stylizeDarkBasemap(); else stylizeBasemap();
    addLayers(); renderMap();
  };
  map.on('style.load', restoreGameLayers);
  map.on('styledata', restoreGameLayers);
  map.on('load', () => {
    $('loading').remove();
    map.on('click', onMapClick);
    $('map').addEventListener('contextmenu', event => event.preventDefault());
    $('map').addEventListener('mousedown', onMiddleDraftMouseDown, true);
    $('map').addEventListener('wheel', closeContextMenu, { passive: true });
    map.on('contextmenu', onMapContextMenu);
    map.on('dragstart', closeContextMenu);
    map.on('rotatestart', closeContextMenu);
    map.on('mousemove', event => { if (rulerActive && middleDragIndex === null) { rulerHover = [event.lngLat.lng, event.lngLat.lat]; renderRuler(); } });
    fitFocus();
  });
  themeMedia.addEventListener('change', () => {
    // Complete pending symbol placement before replacing the whole style.
    // MapLibre can otherwise read a half-removed symbol layer during a rapid scenario edit.
    const token = ++themeChangeToken;
    const applyTheme = () => { if (token === themeChangeToken) map.setStyle(mapStyle(), { diff: false }); };
    if (map.isStyleLoaded()) { map.once('idle', applyTheme); map.triggerRepaint(); }
    else setTimeout(applyTheme, 250);
  });

  function stylizeBasemap() {
    const paint = (id, key, value) => { if (map.getLayer(id)) try { map.setPaintProperty(id, key, value); } catch (_) {} };
    paint('background', 'background-color', '#f2f1ec');
    for (const id of ['park', 'landcover_grass', 'landcover_wood', 'landuse_pitch']) paint(id, 'fill-color', id === 'landcover_wood' ? '#d9e7db' : '#e4eee2');
    paint('landuse_residential', 'fill-color', '#f0eee9');
    paint('water', 'fill-color', '#bedee5');
    paint('building', 'fill-color', '#e4e8e5');
    paint('building-3d', 'fill-extrusion-color', '#edf3f0');
    paint('building-3d', 'fill-extrusion-opacity', .86);
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'line' && /road_/.test(layer.id) && !/rail/.test(layer.id)) {
        paint(layer.id, 'line-color', /casing/.test(layer.id) ? '#e1e5e2' : '#ffffff');
      }
      if (layer.type === 'line' && /rail/.test(layer.id)) paint(layer.id, 'line-color', '#b5bfca');
      if (layer.type === 'symbol' && /shield|^poi_/.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
  function stylizeDarkBasemap() {
    const paint = (id, key, value) => { if (map.getLayer(id)) try { map.setPaintProperty(id, key, value); } catch (_) {} };
    paint('background', 'background-color', '#111f29');
    paint('landuse_residential', 'fill-color', '#172832');
    for (const id of ['landcover_wood', 'landuse_park']) paint(id, 'fill-color', '#20383c');
    paint('water', 'fill-color', '#244656');
    paint('waterway', 'line-color', '#71a5b6');
    paint('building', 'fill-color', '#29404b');
    paint('road_pier', 'line-color', '#627e88');
    paint('highway_path', 'line-color', '#698995');
    paint('highway_minor', 'line-color', '#829faa');
    for (const id of ['highway_major_casing', 'highway_motorway_casing']) paint(id, 'line-color', '#38535f');
    paint('highway_major_inner', 'line-color', '#a8c0c7');
    paint('highway_motorway_inner', 'line-color', '#bdd1d6');
    for (const id of ['highway_major_subtle', 'highway_motorway_subtle']) paint(id, 'line-color', '#819fa9');
    for (const id of ['railway', 'railway_minor', 'railway_transit']) paint(id, 'line-color', '#9cb1b8');
    for (const id of ['railway_dashline', 'railway_minor_dashline', 'railway_transit_dashline']) paint(id, 'line-color', '#536d77');
    paint('aeroway-taxiway', 'line-color', '#6d8790');
    paint('aeroway-runway', 'line-color', '#8ca1a8');
    for (const layer of map.getStyle().layers) {
      if (layer.type !== 'symbol') continue;
      const id = layer.id;
      if (!/^(place_|highway_name_|water_name$)/.test(id)) continue;
      const isRoad = id.startsWith('highway_name_');
      const isWater = id === 'water_name';
      const isMajorPlace = /^(place_city|place_town|place_country)/.test(id);
      paint(id, 'text-color', isRoad ? '#dce9ea' : isWater ? '#b3ddeb' : isMajorPlace ? '#e0eef0' : '#bfd1d6');
      paint(id, 'text-halo-color', '#172a34');
      paint(id, 'text-halo-width', isRoad ? 1.5 : 1.25);
    }
  }
  const featureCollection = features => ({ type: 'FeatureCollection', features });
  const maskFeatures = featureCollection(maskCells.map(c => ({
    type: 'Feature',
    properties: { id: c.id, density: +c.density, residents: +c.population || 0, city: c.city },
    geometry: c.geometry,
  })));
  function accessGrid() {
    const key = snapshot();
    if (accessCache?.key === key) return accessCache;
    const ids = new Set();
    for (const route of allRoutes()) {
      if (route.active === false || !['tram', 'rail', 'metro'].includes(route.mode)) continue;
      route.stopIds.forEach(id => ids.add(id));
    }
    const rapidStops = [...ids].map(stop).filter(Boolean);
    const features = featureCollection(maskFeatures.features.map((feature, i) => {
      const cell = maskCells[i];
      let distance = Infinity;
      const center = [+cell.lon, +cell.lat];
      for (const station of rapidStops) distance = Math.min(distance, sim.km(center, station.pos));
      return { ...feature, properties: { ...feature.properties, accessM: Number.isFinite(distance) ? Math.round(distance * 1000) : 99999 } };
    }));
    accessCache = { key, rapidStops, features };
    return accessCache;
  }
  function routeFeature(r) {
    const segments = (r.geometry || []).filter(seg => Array.isArray(seg) && seg.length >= 2);
    return { type: 'Feature', properties: { id: r.id, name: r.name, mode: r.mode, color: routeColor(r), active: r.active !== false }, geometry: { type: 'MultiLineString', coordinates: segments } };
  }
  function pointFeature(s, properties = {}) { return { type: 'Feature', properties: { id: s.id, name: s.name, ...properties }, geometry: { type: 'Point', coordinates: s.pos } }; }
  function addLayers() {
    const before = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    const beneathRoads = map.getStyle().layers.find(layer => layer.id === 'road_pier')?.id || before;
    const visible = state.populationVisible ? 'visible' : 'none';
    const densityVisible = state.populationVisible && state.activeLayer === 'population' ? 'visible' : 'none';
    const densityColors = themeMedia.matches
      ? ['#244953', '#397780', '#69b7b6', '#efc17a', '#ed8b76', '#bc6b9a', '#8557b7']
      : ['#e6f1e9', '#afdcd0', '#71c1c1', '#ffd090', '#f29a79', '#b8689e', '#704896'];
    map.addSource('city-population', { type: 'geojson', data: cityBoundaries });
    map.addSource('population-grid', { type: 'geojson', data: accessGrid().features });
    map.addLayer({ id: 'city-population-fill', type: 'fill', source: 'city-population', layout: { visibility: visible }, paint: { 'fill-color': themeMedia.matches ? '#285360' : '#cae9e0', 'fill-opacity': .52 } }, beneathRoads);
    map.addLayer({ id: 'population-grid-fill', type: 'fill', source: 'population-grid', layout: { visibility: densityVisible }, paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'density'], 0, densityColors[0], 250, densityColors[1], 1000, densityColors[2], 2500, densityColors[3], 5000, densityColors[4], 8000, densityColors[5], 12000, densityColors[6]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .72, 18, .59],
      'fill-antialias': true,
    } }, beneathRoads);
    const accessVisible = state.populationVisible && state.activeLayer === 'access' ? 'visible' : 'none';
    const accessColors = themeMedia.matches
      ? ['#245c59', '#4c9183', '#d6b476', '#ca816b', '#a95266']
      : ['#bce7d9', '#83cdb7', '#e4d796', '#efac78', '#d86f77'];
    map.addLayer({ id: 'access-grid-fill', type: 'fill', source: 'population-grid', layout: { visibility: accessVisible }, paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'accessM'], 0, accessColors[0], 400, accessColors[1], 900, accessColors[2], 1800, accessColors[3], 3000, accessColors[4]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .76, 18, .64],
      'fill-antialias': true,
    } }, beneathRoads);
    map.addLayer({ id: 'city-population-outline', type: 'line', source: 'city-population', layout: { visibility: visible }, paint: {
      'line-color': themeMedia.matches ? '#8ab7bd' : '#5b8990',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, .8, 15, 1.8],
      'line-opacity': .77,
    } }, beneathRoads);
    map.addSource('network-routes', { type: 'geojson', data: featureCollection([]) });
    map.addSource('selected-route', { type: 'geojson', data: featureCollection([]) });
    map.addSource('network-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('selected-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('inspected-stop', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('ruler-line', { type: 'geojson', data: featureCollection([]) });
    map.addSource('ruler-points', { type: 'geojson', data: featureCollection([]) });
    map.addSource('vehicles', { type: 'geojson', data: featureCollection([]) });
    map.addLayer({ id: 'route-halo', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5, 17, 9], 'line-opacity': .65 } }, before);
    map.addLayer({ id: 'routes', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.15, 13, 2.1, 17, 4.1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['==', ['get', 'active'], false], .08, ['==', ['get', 'mode'], 'bus'], .20, .65], 13, ['case', ['==', ['get', 'active'], false], .08, ['==', ['get', 'mode'], 'bus'], .45, .7]] } }, before);
    map.addLayer({ id: 'selected-halo', type: 'line', source: 'selected-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 12], 'line-opacity': .98 } }, before);
    map.addLayer({ id: 'selected-line', type: 'line', source: 'selected-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 8], 'line-opacity': .95 } }, before);
    map.addLayer({ id: 'all-stops', type: 'circle', source: 'network-stops', minzoom: 13.1, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.2, 17, 5], 'circle-color': '#fff', 'circle-stroke-color': '#71879b', 'circle-stroke-width': 1.2, 'circle-opacity': .86 } });
    map.addLayer({ id: 'selected-stop-halo', type: 'circle', source: 'selected-stops', paint: { 'circle-radius': 9, 'circle-color': '#fff', 'circle-opacity': .9 } });
    map.addLayer({ id: 'selected-stop', type: 'circle', source: 'selected-stops', paint: { 'circle-radius': 5.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    map.addLayer({ id: 'selected-stop-label', type: 'symbol', source: 'selected-stops', minzoom: 12, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': themeMedia.matches ? '#e4f5f7' : '#233746', 'text-halo-color': themeMedia.matches ? '#13232c' : '#fff', 'text-halo-width': 2 } });
    map.addLayer({ id: 'inspected-stop-halo', type: 'circle', source: 'inspected-stop', paint: { 'circle-radius': 13, 'circle-color': '#fff', 'circle-opacity': .95 } });
    map.addLayer({ id: 'inspected-stop-dot', type: 'circle', source: 'inspected-stop', paint: { 'circle-radius': 8, 'circle-color': '#163b48', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'metro-draft', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': state.draftColor, 'line-width': 5, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draft-stops', type: 'circle', source: 'metro-draft-stops', paint: { 'circle-radius': 8, 'circle-color': state.draftColor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    map.addLayer({ id: 'ruler-halo', type: 'line', source: 'ruler-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#102832', 'line-width': 7, 'line-opacity': .92 } });
    map.addLayer({ id: 'ruler-path', type: 'line', source: 'ruler-line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffe18a', 'line-width': 3, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'ruler-vertices', type: 'circle', source: 'ruler-points', paint: { 'circle-radius': 5, 'circle-color': '#ffe18a', 'circle-stroke-color': '#102832', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'vehicle-glow', type: 'circle', source: 'vehicles', paint: { 'circle-radius': 10, 'circle-color': ['get', 'color'], 'circle-opacity': .18, 'circle-blur': .45 } });
    map.addLayer({ id: 'vehicle-dots', type: 'circle', source: 'vehicles', paint: { 'circle-radius': 4.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    if (!hoverBound) {
      map.on('mouseenter', 'routes', () => { if (state.tool === 'inspect') map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'routes', () => { map.getCanvas().style.cursor = state.tool === 'inspect' ? '' : 'crosshair'; });
      hoverBound = true;
    }
  }
  function visibleMapModes() { return Object.keys(state.mapModes).filter(mode => state.mapModes[mode]); }
  function applyMapModeVisibility() {
    if (!map?.getLayer('routes')) return;
    const modes = visibleMapModes();
    const routeFilter = modes.length ? ['in', ['get', 'mode'], ['literal', modes]] : ['==', ['get', 'mode'], '__none__'];
    map.setFilter('routes', routeFilter);
    map.setFilter('route-halo', routeFilter);
    for (const id of ['selected-halo', 'selected-line', 'selected-stop-halo', 'selected-stop', 'selected-stop-label']) {
      if (map.getLayer(id)) map.setFilter(id, routeFilter);
    }
    if (map.getLayer('all-stops')) {
      const stopFilter = modes.length ? ['any', ...modes.map(mode => ['in', mode, ['get', 'modes']])] : ['==', ['get', 'id'], '__none__'];
      map.setFilter('all-stops', stopFilter);
    }
    document.querySelectorAll('.map-legend [data-map-mode]').forEach(button => {
      const visible = !!state.mapModes[button.dataset.mapMode];
      const label = button.dataset.mapMode;
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${label} routes on map`);
      button.title = `${visible ? 'Hide' : 'Show'} ${label} routes`;
    });
    renderVehicles();
  }
  function renderMap() {
    if (!map.getSource('network-routes')) return;
    const previousAccessKey = accessCache?.key;
    const currentAccess = accessGrid();
    if (previousAccessKey !== currentAccess.key) map.getSource('population-grid').setData(currentAccess.features);
    const routes = allRoutes();
    map.getSource('network-routes').setData(featureCollection(routes.map(routeFeature)));
    const selected = routeById(state.selected);
    map.getSource('selected-route').setData(featureCollection(selected ? [routeFeature(selected)] : []));
    const stopModes = new Map();
    routes.forEach(route => route.stopIds.forEach(id => {
      if (!stopModes.has(id)) stopModes.set(id, new Set());
      stopModes.get(id).add(route.mode);
    }));
    map.getSource('network-stops').setData(featureCollection(network.stops.concat(state.customStops).map(s => pointFeature(s, { modes: [...(stopModes.get(s.id) || [])] }))));
    map.getSource('selected-stops').setData(featureCollection(selected ? selected.stopIds.map(stop).filter(Boolean).map(s => pointFeature(s, { color: routeColor(selected), mode: selected.mode })) : []));
    const inspected = stop(state.selectedStop);
    map.getSource('inspected-stop').setData(featureCollection(inspected ? [pointFeature(inspected)] : []));
    renderDraft();
    renderRuler();
    applyMapModeVisibility();
  }
  function renderDraft() {
    if (!map.getSource('metro-draft')) return;
    const coords = state.draft.map(s => s.pos);
    if (state.draftRing && coords.length >= 3) coords.push(coords[0]);
    map.getSource('metro-draft').setData(featureCollection(coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : []));
    map.getSource('metro-draft-stops').setData(featureCollection(state.draft.map((s, i) => pointFeature({ ...s, id: String(i) }))));
    map.setPaintProperty('draft-line', 'line-color', state.draftColor);
    map.setPaintProperty('draft-stops', 'circle-color', state.draftColor);
  }

  function onMapClick(event) {
    if (!$('map-context-menu').hidden) { closeContextMenu(); return; }
    if (rulerActive) { addRulerPoint([event.lngLat.lng, event.lngLat.lat]); return; }
    if (state.tool === 'metro') {
      if (state.movingDraftIndex !== null) {
        const index = state.movingDraftIndex;
        state.movingDraftIndex = null;
        repositionDraftStation(index, [event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      return addDraftStation([event.lngLat.lng, event.lngLat.lat]);
    }
    if (state.tool === 'add-stop') {
      return addExistingStop([event.lngLat.lng, event.lngLat.lat]);
    }
    const stopHit = map.queryRenderedFeatures(event.point, { layers: ['inspected-stop-dot', 'selected-stop', 'all-stops'] })[0];
    if (stopHit?.properties?.id) { inspectStop(stopHit.properties.id); return; }
    const hit = map.queryRenderedFeatures(event.point, { layers: ['selected-line', 'routes'] })[0];
    if (hit?.properties?.id) { selectRoute(hit.properties.id); return; }
    if (state.selected || state.selectedStop) clearSelection();
  }
  function addDraftStation(pos) {
    const nearby = nearestStop(pos, .33);
    const finalPos = nearby ? nearby.pos : pos;
    if (state.draft.some(s => sim.km(s.pos, finalPos) < .12)) return toast('Place stations at least 120 m apart.');
    state.draft.push({ name: nearby ? nearby.name : `Station ${state.draft.length + 1}`, pos: finalPos, schematic: !nearby, coordinateNote: nearby ? 'Snapped to a published transit stop.' : 'Player-placed map coordinate.' });
    renderInspector(); renderMap(); toast(`${state.draft.length} station${state.draft.length === 1 ? '' : 's'} in line draft`);
  }
  function addExistingStop(pos) {
    const nearby = nearestStop(pos, .55);
    if (!nearby) return toast('No published stop nearby. Zoom in and click an existing stop.');
    const route = routeById(state.selected);
    if (!route || route.stopIds.includes(nearby.id)) return toast('This line already uses that stop.');
    const ids = route.stopIds.slice(); let index = ids.length - 1, best = Infinity;
    for (let i = 1; i < ids.length; i++) {
      const a = stop(ids[i - 1]), b = stop(ids[i]); if (!a || !b) continue;
      const score = sim.km(a.pos, nearby.pos) + sim.km(nearby.pos, b.pos) - sim.km(a.pos, b.pos);
      if (score < best) { best = score; index = i; }
    }
    ids.splice(index, 0, nearby.id); setRouteStops(route, ids);
    state.tool = 'inspect'; setMobileView('line'); map.getCanvas().style.cursor = ''; toast(`Added ${nearby.name}. Route geometry is now simplified.`);
  }
  function repositionDraftStation(index, pos) {
    const current = state.draft[index];
    if (!current) return;
    const nearby = nearestStop(pos, .12);
    const finalPos = nearby ? nearby.pos : pos;
    if (state.draft.some((s, i) => i !== index && sim.km(s.pos, finalPos) < .12)) { renderDraft(); return toast('Place stations at least 120 m apart.'); }
    state.draft[index] = { ...current, pos: finalPos, schematic: !nearby, coordinateNote: nearby ? 'Snapped to a published transit stop after moving.' : 'Player-adjusted map coordinate.' };
    renderInspector(); renderMap(); toast(`${current.name} moved.`);
  }
  function draftIndexAt(point, maxPx = 20) {
    if (state.tool !== 'metro') return -1;
    let nearest = -1, distance = maxPx;
    state.draft.forEach((station, index) => {
      const pixel = map.project(station.pos);
      const d = Math.hypot(pixel.x - point.x, pixel.y - point.y);
      if (d < distance) { nearest = index; distance = d; }
    });
    return nearest;
  }
  function onMiddleDraftMouseDown(event) {
    if (event.button !== 1 || state.tool !== 'metro' || rulerActive) return;
    const rect = map.getCanvasContainer().getBoundingClientRect();
    const index = draftIndexAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (index < 0) return;
    event.preventDefault(); event.stopImmediatePropagation();
    middleDragIndex = index;
    middleDragOriginal = state.draft[index];
    state.movingDraftIndex = null;
    map.getCanvas().style.cursor = 'grabbing';
    window.addEventListener('mousemove', moveMiddleDraft, true);
    window.addEventListener('mouseup', finishMiddleDraft, true);
    window.addEventListener('blur', finishMiddleDraft, true);
  }
  function moveMiddleDraft(event) {
    if (middleDragIndex === null) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rect = map.getCanvasContainer().getBoundingClientRect();
    const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    state.draft[middleDragIndex] = { ...state.draft[middleDragIndex], pos: [point.lng, point.lat] };
    renderDraft();
  }
  function finishMiddleDraft(event) {
    if (middleDragIndex === null || (event.type === 'mouseup' && event.button !== 1)) return;
    event.preventDefault?.();
    const index = middleDragIndex, pos = state.draft[index].pos;
    state.draft[index] = middleDragOriginal;
    middleDragIndex = null; middleDragOriginal = null;
    window.removeEventListener('mousemove', moveMiddleDraft, true);
    window.removeEventListener('mouseup', finishMiddleDraft, true);
    window.removeEventListener('blur', finishMiddleDraft, true);
    map.getCanvas().style.cursor = 'crosshair';
    repositionDraftStation(index, pos);
  }
  const rulerDistance = points => points.slice(1).reduce((total, point, index) => total + sim.km(points[index], point), 0);
  const formatRulerDistance = km => km < 1 ? `${format(km * 1000)} m` : `${km.toFixed(2)} km`;
  function renderRuler() {
    const panel = $('ruler-panel');
    panel.hidden = !rulerPoints.length;
    if (!rulerPoints.length) {
      map.getSource('ruler-line')?.setData(featureCollection([]));
      map.getSource('ruler-points')?.setData(featureCollection([]));
      return;
    }
    const display = rulerActive && rulerHover ? rulerPoints.concat([rulerHover]) : rulerPoints;
    $('ruler-distance').textContent = formatRulerDistance(rulerDistance(display));
    $('ruler-hint').textContent = rulerActive ? 'Click map to add points · right-click for options' : 'Finished · right-click to extend or clear';
    $('ruler-finish').hidden = !rulerActive;
    map.getSource('ruler-line')?.setData(featureCollection(display.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: display } }] : []));
    map.getSource('ruler-points')?.setData(featureCollection(rulerPoints.map((pos, index) => pointFeature({ id: `ruler:${index}`, name: '', pos }))));
  }
  function startRuler(pos) { rulerPoints = [pos]; rulerHover = null; rulerActive = true; renderRuler(); toast('Ruler started. Click the map to add points.'); }
  function addRulerPoint(pos) {
    if (rulerPoints.length && sim.km(rulerPoints[rulerPoints.length - 1], pos) < .01) return;
    rulerPoints.push(pos); rulerHover = null; rulerActive = true; renderRuler(); toast(`Ruler: ${formatRulerDistance(rulerDistance(rulerPoints))}.`);
  }
  function finishRuler() { if (!rulerPoints.length) return; rulerActive = false; rulerHover = null; renderRuler(); }
  function clearRuler() { rulerPoints = []; rulerHover = null; rulerActive = false; renderRuler(); }
  function pointInRing(pos, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > pos[1]) !== (b[1] > pos[1]) && pos[0] < (b[0] - a[0]) * (pos[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function pointInGeometry(pos, geometry) {
    if (!geometry) return false;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polygons.some(rings => rings.length && pointInRing(pos, rings[0]) && !rings.slice(1).some(ring => pointInRing(pos, ring)));
  }
  function closeContextMenu() {
    const menu = $('map-context-menu');
    if (menu.hidden) return;
    menu.hidden = true;
    contextLocation = null;
  }
  function onMapContextMenu(event) {
    event.originalEvent?.preventDefault();
    event.preventDefault?.();
    const pos = [event.lngLat.lng, event.lngLat.lat];
    const cell = maskCells.find(item => pointInGeometry(pos, item.geometry));
    const municipality = cityBoundaries.features.find(item => pointInGeometry(pos, item.geometry));
    const cityName = municipality?.properties?.name || cell?.city || 'Map location';
    let rapidStop = null, rapidKm = Infinity;
    for (const station of accessGrid().rapidStops) {
      const distance = sim.km(pos, station.pos);
      if (distance < rapidKm) { rapidStop = station; rapidKm = distance; }
    }
    const nearby = nearestStop(pos, 1);
    const distance = nearby ? Math.round(sim.km(pos, nearby.pos) * 1000) : null;
    const hit = map.queryRenderedFeatures(event.point, { layers: ['selected-line', 'routes'] })[0];
    const route = hit?.properties?.id ? routeById(hit.properties.id) : null;
    const draftIndex = draftIndexAt(event.point);
    const selected = routeById(state.selected);
    const canAddStop = nearby && selected && !selected.stopIds.includes(nearby.id) && distance <= 550;
    contextLocation = { pos, nearby, route, draftIndex };
    const menu = $('map-context-menu');
    menu.innerHTML = `<div class="map-context-heading" role="presentation"><span class="map-context-eyebrow">MAP LOCATION</span><strong>${escape(cityName)}</strong><small>${pos[1].toFixed(5)}° N · ${pos[0].toFixed(5)}° E</small></div>
      <div class="map-context-facts" role="presentation">
        <div><span>Resident grid · ${escape(population?.source?.year || '2021')}</span><b>${cell ? `${format(+cell.density)} / km²` : 'No grid cell'}</b><small>${cell ? `${format(+cell.population || 0)} residents in this published 1 km cell` : 'Outside the selected eight-city grid'}</small></div>
        <div><span>Tram, rail & metro access</span><b>${rapidStop ? `${format(Math.round(rapidKm * 1000))} m` : 'No active service'}</b><small>${rapidStop ? `Straight-line to ${escape(rapidStop.name)} · map layer uses cell centers` : 'Enable a line or draw a metro to change the access layer'}</small></div>
        <div><span>Nearest published stop</span><b>${nearby ? escape(nearby.name) : 'None within 1 km'}</b><small>${nearby ? `${format(distance)} m straight-line · about ${Math.max(1, Math.round(distance / 75))} min walking` : 'Zoom toward the transit network to find a stop'}</small></div>
      </div>
      <div class="map-context-actions" role="presentation">
        ${draftIndex >= 0 ? `<button type="button" role="menuitem" data-context-action="move-stop">Move ${escape(state.draft[draftIndex].name)} to next click</button><button type="button" role="menuitem" data-context-action="remove-stop" class="map-context-danger">Remove ${escape(state.draft[draftIndex].name)} station</button>` : ''}
        ${route ? `<button type="button" role="menuitem" data-context-action="route">Inspect ${escape(route.name)} line</button>` : ''}
        ${nearby && distance <= 200 ? `<button type="button" role="menuitem" data-context-action="inspect-stop">Inspect traffic at ${escape(nearby.name)}</button>` : ''}
        ${canAddStop ? `<button type="button" role="menuitem" data-context-action="add-stop">Add ${escape(nearby.name)} to selected line</button>` : ''}
        <button type="button" role="menuitem" data-context-action="metro" class="map-context-primary">${state.tool === 'metro' ? 'Add station here' : 'Start metro line here'}</button>
        <button type="button" role="menuitem" data-context-action="ruler">${rulerPoints.length ? rulerActive ? 'Add ruler point here' : 'Extend ruler from here' : 'Start ruler here'}</button>
        ${rulerActive ? '<button type="button" role="menuitem" data-context-action="ruler-finish">Finish ruler</button>' : ''}
        ${rulerPoints.length ? '<button type="button" role="menuitem" data-context-action="ruler-clear">Clear ruler</button>' : ''}
        <div class="map-context-action-row" role="presentation"><button type="button" role="menuitem" data-context-action="zoom">Center & zoom</button><button type="button" role="menuitem" data-context-action="copy">Copy coordinates</button></div>
        <button type="button" role="menuitem" data-context-action="data" class="map-context-secondary">Data sources & method ↗</button>
      </div>`;
    menu.hidden = false;
    menu.style.visibility = 'hidden';
    const width = menu.offsetWidth, height = menu.offsetHeight;
    const leftPane = innerWidth > 600 && state.networkOpen ? document.querySelector('.sidebar').getBoundingClientRect().right : 0;
    const rightPane = innerWidth > 600 && state.inspectorOpen ? document.querySelector('.inspector').getBoundingClientRect().left : innerWidth;
    const room = rightPane - leftPane;
    const minX = room >= width + 16 ? leftPane + 8 : 8;
    const maxX = room >= width + 16 ? rightPane - width - 8 : innerWidth - width - 8;
    menu.style.left = `${Math.max(minX, Math.min(maxX, (event.originalEvent?.clientX ?? event.point.x) + 10))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, (event.originalEvent?.clientY ?? event.point.y) + 10))}px`;
    menu.style.visibility = '';
    menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }
  async function copyCoordinates(pos) {
    const value = `${pos[1].toFixed(6)}, ${pos[0].toFixed(6)}`;
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(value); copied = true; } catch (_) { /* Fall back for local file pages. */ }
      }
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = value; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field);
        field.select();
        copied = document.execCommand('copy'); field.remove();
      }
      if (!copied) throw new Error('Clipboard unavailable');
      toast('Coordinates copied (latitude, longitude).');
    } catch (_) { toast('Could not copy coordinates from this browser.'); }
  }
  function nearestStop(pos, maxKm) {
    let best = null, distance = maxKm;
    for (const s of network.stops) { const d = sim.km(pos, s.pos); if (d < distance) { best = s; distance = d; } }
    return best;
  }
  function routeGeometry(ids, ring = false) { return [ids.concat(ring && ids.length >= 3 ? ids[0] : []).map(stop).filter(Boolean).map(s => s.pos)]; }
  function setRouteStops(route, ids) {
    if (ids.length < 2) return toast('A line needs at least two stops.');
    remember();
    const ring = route.ring === true && ids.length >= 3;
    const geometry = routeGeometry(ids, ring);
    if (route.source === 'player') {
      const i = state.customRoutes.findIndex(r => r.id === route.id);
      state.customRoutes[i] = { ...state.customRoutes[i], ring, stopIds: ids, geometry, edited: true };
    } else state.overrides[route.id] = { ...(state.overrides[route.id] || {}), stopIds: ids, geometry, edited: true };
    changed();
  }
  function setRouteField(route, field, value) {
    remember();
    if (route.source === 'player') {
      const i = state.customRoutes.findIndex(r => r.id === route.id);
      state.customRoutes[i] = { ...state.customRoutes[i], [field]: value };
    } else state.overrides[route.id] = { ...(state.overrides[route.id] || {}), [field]: value };
    changed();
  }
  function changed() { persist(); renderList(); renderInspector(); renderMap(); scheduleStats(); }
  function clearSelection() {
    state.selected = null; state.selectedStop = null;
    renderList(); renderInspector(); renderMap();
  }
  function inspectStop(id) {
    if (!stop(id)) return;
    state.selected = null; state.selectedStop = id; state.tool = 'inspect';
    setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false);
    setPanel('inspector', true); renderList(); renderInspector(); renderMap();
  }
  function selectRoute(id) {
    state.selected = id; state.selectedStop = null; state.tool = 'inspect'; state.draft = []; state.movingDraftIndex = null; setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false); setPanel('inspector', true); renderList(); renderInspector(); renderMap();
    const r = routeById(id), points = (r?.geometry || []).flat();
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds(); points.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 13.7, duration: 650 });
    }
  }
  function createMetro() {
    if (state.draft.length < (state.draftRing ? 3 : 2)) return toast(state.draftRing ? 'A ring needs at least three stops.' : 'Place at least two stops on the map.');
    remember();
    const stamp = Date.now().toString(36), id = `${state.draftMode}:${stamp}`;
    const stops = state.draft.map((s, i) => ({ id: `${id}:${i}`, name: s.name, pos: s.pos, city: 'Player', schematic: !!s.schematic, coordinateNote: s.coordinateNote || '' }));
    state.customStops.push(...stops);
    const template = state.draftTemplate;
    state.customRoutes.push({
      id, source: 'player', name: state.draftName.trim() || nextDraftName(state.draftMode),
      longName: template?.title || `Player-created ${modeLabel(state.draftMode).toLowerCase()} line`,
      mode: state.draftMode, color: state.draftColor, stopIds: stops.map(s => s.id),
      geometry: routeGeometry(stops.map(s => s.id), state.draftRing), ring: state.draftRing, headway: Number(state.draftHeadway) || 8,
      active: true, edited: true, templateId: template?.id || null,
      templateSourceUrl: template?.sourceUrl || null, templateSourceTitle: template?.sourceTitle || null,
      templateDescription: template?.description || null, templateConfidence: template?.confidence || null,
      templateStatus: template?.status || null, schematic: !!template
    });
    state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.tool = 'inspect'; state.selected = id; state.draftName = nextDraftName(state.draftMode); state.draftMode = 'metro'; state.draftTemplate = null; state.draftColor = colors.metro; setMobileView('line');
    map.getCanvas().style.cursor = ''; changed(); toast('Line opened. The model is recalculating.');
  }
  function renderTemplates() {
    const host = $('template-list');
    if (!host) return;
    $('template-section').hidden = !templates.length;
    host.innerHTML = templates.map(t => {
      const mode = ['metro', 'tram', 'rail'].includes(t.mode) ? t.mode : 'rail';
      const count = Array.isArray(t.stations) ? t.stations.length : 0;
      return `<article class="template-card"><div class="section-title"><span class="chip mode-${escape(mode)}">${escape(modeLabel(mode))}</span><span class="value">${escape(t.status || 'Historical concept')}</span></div><h3>${escape(t.title || 'Regional rail concept')}</h3><p>${escape(t.description || 'Documented regional transport proposal.')}</p><p class="fine-print">${count} named anchors · ${escape(t.confidence || 'Conceptual alignment')}</p><div class="toolbar"><a href="${escape(t.sourceUrl || '#')}" target="_blank" rel="noopener">Read source ↗</a><button class="primary" data-template-id="${escape(t.id)}">Load editable draft</button></div></article>`;
    }).join('') || '<p class="empty-state">No sourced line concepts are available.</p>';
  }
  function loadTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template || !Array.isArray(template.stations) || template.stations.length < 2) return toast('This line concept is incomplete.');
    const mode = ['tram', 'rail', 'metro'].includes(template.mode) ? template.mode : 'rail';
    state.tool = 'metro'; state.selected = null; state.selectedStop = null; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = template;
    state.draftMode = mode; state.draftColor = colors[mode] || colors.metro;
    state.draftName = template.defaultName || nextDraftName(mode);
    state.draftHeadway = Number(template.headway) || 8;
    state.draft = template.stations.map((station, i) => ({
      name: station.name || `Station ${i + 1}`,
      pos: [Number(station.lon), Number(station.lat)],
      schematic: station.schematic !== false,
      coordinateNote: station.coordinateNote || ''
    })).filter(s => Number.isFinite(s.pos[0]) && Number.isFinite(s.pos[1]));
    if (state.draft.length < 2) { state.draft = []; state.draftTemplate = null; state.tool = 'inspect'; return toast('This line concept has no usable station coordinates.'); }
    setMobileView('line');
    if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false);
    setPanel('inspector', true); map.getCanvas().style.cursor = 'crosshair';
    renderList(); renderInspector(); renderMap();
    const bounds = new maplibregl.LngLatBounds(); state.draft.forEach(s => bounds.extend(s.pos));
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 13.5, duration: 650 });
    toast(`${modeLabel(mode)} concept loaded as an editable draft.`);
  }
  function renderList() {
    const routes = allRoutes();
    $('line-total').textContent = `${routes.length} patterns`;
    $('network-peek-total').textContent = routes.length;
    const q = state.search.toLocaleLowerCase('pl');
    const shown = routes.filter(r => (state.filter === 'all' || r.mode === state.filter) && (!q || `${r.name} ${r.longName}`.toLocaleLowerCase('pl').includes(q)));
    $('visible-total').textContent = `${shown.length} shown`;
    const list = state.showAll || q || state.filter !== 'all' ? shown : shown.slice(0, 80);
    $('route-list').innerHTML = list.map(r => `<button class="route-card mode-${r.mode}${r.id === state.selected ? ' selected' : ''}" data-route="${escape(r.id)}" aria-pressed="${r.id === state.selected}" style="width:100%;text-align:left;${r.active === false ? 'opacity:.48;' : ''}"><span class="route-info"><strong>${escape(r.name)} <span class="route-dir">${escape(r.ring ? '⟳' : r.source === 'player' ? '↔' : r.direction === '1' ? '↩' : '→')}</span></strong><small>${escape(r.longName || r.stopIds.length + ' stops')}</small></span><span class="route-type">${escape(r.mode)}</span></button>`).join('') || '<p class="empty-state">No lines match this filter.</p>';
    $('more-routes').style.display = !state.showAll && !q && state.filter === 'all' && shown.length > 80 ? '' : 'none';
    document.querySelectorAll('#mode-filters button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.filter));
    $('undo-button').disabled = !state.history.length;
  }
  function renderInspector() {
    const el = $('inspector-content');
    $('inspector-peek-label').textContent = state.selectedStop ? '◎' : state.selected ? routeById(state.selected)?.name?.slice(0, 3) || '↗' : state.tool === 'metro' ? '✎' : '＋';
    $('inspector-peek-kind').textContent = state.selectedStop ? 'stop' : state.selected ? 'line' : state.tool === 'metro' ? 'draft' : 'line';
    if (state.tool === 'metro') {
      const mode = modeLabel(state.draftMode), template = state.draftTemplate;
      const sourceNote = template ? `<div class="section"><p><b>${escape(template.status || 'Historical concept')}</b> · ${escape(template.confidence || 'Conceptual alignment')}</p><p>${escape(template.description || '')}</p><p><a href="${escape(template.sourceUrl || '#')}" target="_blank" rel="noopener">${escape(template.sourceTitle || 'Open proposal source')} ↗</a></p><p class="fine-print">The proposal source does not give an engineered alignment. ${template.stationCoordinateSourceUrl ? `Map coordinates: <a href="${escape(template.stationCoordinateSourceUrl)}" target="_blank" rel="noopener">station data source ↗</a>.` : ''}</p></div>` : '';
      const heading = template ? `Edit this ${mode.toLowerCase()} concept` : 'Draw your metro';
      const intro = state.movingDraftIndex !== null ? `Click the new map position for ${state.draft[state.movingDraftIndex]?.name || 'this station'}. Press Escape to cancel.` : template ? 'This sourced idea is loaded as a draft. Add or remove stations to explore a variant.' : 'Tap the map to place stations. Click near an existing stop to snap to its location and enable a transfer.';
      const routeNote = (template ? 'Draft segments are direct lines between the displayed stations. Proposed station sites marked schematic are map anchors, not surveyed locations.' : 'Metro tracks are drawn as direct segments. Tunnel engineering and construction cost are outside this sandbox.') + (state.draftRing ? ' The closing segment connects directly to the first station.' : '') + ' Right-click a station to move or remove it; middle-drag to reposition it directly.';
      el.innerHTML = `<div class="section"><div class="section-title"><h2>${template ? 'PROPOSAL DRAFT' : 'NEW INFRASTRUCTURE'}</h2><span class="chip mode-${escape(state.draftMode)}">${escape(mode)}</span></div><h2 class="inspector-heading">${escape(heading)}</h2><p class="intro">${escape(intro)}</p><div class="form-stack"><label>Line name<input id="metro-name" maxlength="18" value="${escape(state.draftName)}"></label><div class="form-row"><label>Every · minutes<input id="metro-headway" type="number" min="3" max="60" value="${state.draftHeadway}"></label><label>Line color<input id="metro-color" type="color" value="${escape(state.draftColor)}"></label></div><label class="toggle-row"><input id="draft-ring" type="checkbox" ${state.draftRing ? 'checked' : ''}> Ring line · one continuous direction</label><small>Stops are served in drawn order, then the line returns to its first stop.</small></div></div>${sourceNote}<div class="section"><div class="section-title"><h3>Stations</h3><span class="value">${state.draft.length}</span></div><div class="stop-list">${state.draft.map((s, i) => `<div class="stop-row"><span class="stop-index">${i + 1}</span><span title="${escape(s.coordinateNote || '')}">${escape(s.name)}${s.schematic ? '<small class="source-note">Schematic location</small>' : ''}</span><button data-draft-remove="${i}" title="Remove station">×</button></div>`).join('') || '<p class="empty-state">Click on the map to begin.</p>'}</div><div class="toolbar" style="margin-top:14px"><button id="cancel-metro">Cancel</button><button id="finish-metro" class="primary" ${state.draft.length < (state.draftRing ? 3 : 2) ? 'disabled' : ''}>Open line</button></div></div><div class="section"><p class="fine-print">${escape(routeNote)}</p></div>`;
      $('metro-name').oninput = e => state.draftName = e.target.value;
      $('metro-headway').onchange = e => state.draftHeadway = Math.max(3, Math.min(60, Number(e.target.value) || 8));
      $('metro-color').oninput = e => { state.draftColor = e.target.value; renderMap(); };
      $('draft-ring').onchange = e => { state.draftRing = e.target.checked; renderInspector(); renderMap(); };
      el.querySelectorAll('[data-draft-remove]').forEach(button => {
        const station = state.draft[Number(button.dataset.draftRemove)];
        button.setAttribute('aria-label', `Remove ${station?.name || 'station'} from draft`);
      });
      $('finish-metro').onclick = createMetro;
      $('cancel-metro').onclick = () => { state.tool = 'inspect'; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = null; state.draftMode = 'metro'; state.draftColor = colors.metro; map.getCanvas().style.cursor = ''; renderInspector(); renderMap(); };
      return;
    }
    if (state.selectedStop) {
      const station = stop(state.selectedStop);
      if (!station) { state.selectedStop = null; return renderInspector(); }
      const services = allRoutes().filter(route => route.stopIds.includes(station.id)).map(route => {
        const inboundStops = new Set();
        route.stopIds.forEach((id, index) => {
          if (id !== station.id) return;
          const previous = route.stopIds[index - 1] || (route.ring ? route.stopIds.at(-1) : null);
          const next = route.source === 'player' && !route.ring ? route.stopIds[index + 1] : null;
          for (const neighbor of [previous, next]) if (neighbor) inboundStops.add(stop(neighbor)?.name || neighbor);
          if (!previous && !next) inboundStops.add('Origin');
        });
        return { route, inbound: [...inboundStops].join(' / ') || 'Origin' };
      }).sort((a, b) => Number(a.route.active === false) - Number(b.route.active === false) || a.route.mode.localeCompare(b.route.mode) || a.route.name.localeCompare(b.route.name, 'pl'));
      el.innerHTML = `<div class="section"><div class="section-title"><h2>STOP INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close stop inspector">×</button></div><h2 class="inspector-heading">${escape(station.name)}</h2><p class="intro">${escape(station.city || 'Transit stop')} · ${services.length} ${services.length === 1 ? 'pattern' : 'patterns'} using this stop</p><p class="fine-print">Intervals are scenario estimates per pattern and direction, not a live arrival board. Several patterns may share a line name.</p></div><div class="section"><div class="section-title"><h3>Service at this stop</h3><span class="value">${services.length}</span></div><div class="stop-service-list">${services.map(({ route, inbound }) => `<button type="button" class="stop-service mode-${escape(route.mode)}" data-inspect-route="${escape(route.id)}"><span class="stop-service-main"><b>${escape(route.name)} ${route.ring ? '⟳' : route.source === 'player' ? '↔' : route.direction === '1' ? '↩' : '→'}</b><small>${escape(route.mode)} · from ${escape(inbound)}</small></span><span class="stop-service-interval">${route.active === false ? 'Off' : `Every ${escape(route.headway)} min`}</span></button>`).join('') || '<p class="empty-state">No lines currently use this stop.</p>'}</div></div>`;
      return;
    }
    const r = routeById(state.selected);
    if (!r) {
      el.innerHTML = `<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2></div><div class="inspector-hero"><span class="hero-mark">↗</span><h2>Make the network yours.</h2><p>Select any route on the map or in the list to adjust service. Or draw a metro line through the real city.</p><button class="primary" id="hero-metro">+ Draw metro line</button></div></div><div class="section"><div class="section-title"><h3>Source snapshot</h3></div><p class="source-note">GZM ZTM: 23 Sep 2026<br>Koleje Śląskie: 2025–2026 feed<br>GUS resident grid: 2021<br>Rapid access: scenario-derived<br>OpenStreetMap basemap</p><button id="inspector-data">View data and method ↗</button></div>`;
      $('hero-metro').onclick = enterMetroTool; $('inspector-data').onclick = openData;
      return;
    }
    const templateNote = r.templateId ? `<p class="model-notice"><b>${escape(r.templateStatus || 'Based on a historical proposal')}</b> · ${escape(r.templateConfidence || 'Conceptual alignment')}<br>${escape(r.templateDescription || 'This line began from a sourced regional concept.')}${r.templateSourceUrl ? `<br><a href="${escape(r.templateSourceUrl)}" target="_blank" rel="noopener">${escape(r.templateSourceTitle || 'Read proposal source')} ↗</a>` : ''}<br>Stations tagged schematic are approximate map anchors; line segments are direct and do not represent an engineered alignment.</p>` : '';
    const intervalHelp = r.ring ? 'Continuous one direction service, returning from the last stop to the first.' : r.source === 'player' ? 'Service runs in both directions; return trips and cost are modeled.' : 'Estimated from scheduled daily service in the baseline.';
    el.innerHTML = `<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close line inspector">×</button><span class="chip mode-${escape(r.mode)}">${escape(modeLabel(r.mode))}</span></div><div class="inspector-line-title"><span class="line-badge" style="background:${escape(routeColor(r))}">${escape(r.name)}</span><div><h2>${escape(r.longName || r.name)}</h2><small>${r.source === 'player' ? `Your ${escape(modeLabel(r.mode).toLowerCase())} line` : r.source === 'ks' ? 'Koleje Śląskie GTFS' : 'GZM ZTM GTFS'} · ${r.stopIds.length} stops</small></div></div>${templateNote}${r.edited ? '<p class="model-notice">Stop edits use direct geometry between stops; street or track alignment is not recalculated.</p>' : ''}<div class="form-stack"><label>Service interval · minutes<input id="route-headway" type="number" min="3" max="120" value="${escape(r.headway)}"><small>${escape(intervalHelp)}</small></label>${r.source === 'player' ? `<label class="toggle-row"><input id="route-ring" type="checkbox" ${r.ring ? 'checked' : ''} ${r.stopIds.length < 3 ? 'disabled' : ''}> Ring line · one continuous direction</label>` : ''}<label class="toggle-row"><input id="route-active" type="checkbox" ${r.active === false ? '' : 'checked'}> Line in service</label></div><div class="toolbar"><button id="add-stop-button">+ Add existing stop</button>${r.ring ? '<button id="reverse-ring-button" type="button">Reverse ring direction</button>' : ''}${r.source === 'player' ? `<button id="delete-route-button" class="danger">Delete ${escape(modeLabel(r.mode).toLowerCase())} line</button>` : '<button id="revert-route-button">Revert line</button>'}</div></div><div class="section"><div class="section-title"><h3>Stop sequence</h3><span class="value">${r.stopIds.length}</span></div><div class="stop-list">${r.stopIds.map((id, i) => { const s = stop(id); return `<div class="stop-row"><span class="stop-index">${i + 1}</span><button class="stop-name-button" type="button" data-inspect-stop="${escape(id)}" title="Inspect all service at this stop">${escape(s?.name || id)}${s?.schematic ? '<small class="source-note">Schematic location</small>' : ''}</button><div class="stop-actions"><button data-stop-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move earlier">↑</button><button data-stop-down="${i}" ${i === r.stopIds.length - 1 ? 'disabled' : ''} title="Move later">↓</button><button data-stop-remove="${i}" ${r.stopIds.length <= 2 ? 'disabled' : ''} title="Remove stop">×</button></div></div>`; }).join('')}</div></div>`;
    $('route-headway').onchange = e => setRouteField(r, 'headway', Math.max(3, Math.min(120, Number(e.target.value) || r.headway)));
    el.querySelectorAll('[data-stop-up], [data-stop-down], [data-stop-remove]').forEach(button => {
      const index = Number(button.dataset.stopUp ?? button.dataset.stopDown ?? button.dataset.stopRemove);
      const stopName = stop(r.stopIds[index])?.name || 'stop';
      const label = button.hasAttribute('data-stop-up') ? `Move ${stopName} earlier` : button.hasAttribute('data-stop-down') ? `Move ${stopName} later` : `Remove ${stopName}`;
      button.setAttribute('aria-label', label);
    });
    const ringToggle = $('route-ring');
    if (ringToggle) ringToggle.onchange = e => {
      remember();
      const index = state.customRoutes.findIndex(item => item.id === r.id);
      state.customRoutes[index] = { ...state.customRoutes[index], ring: e.target.checked, geometry: routeGeometry(r.stopIds, e.target.checked), edited: true };
      changed();
    };
    $('route-active').onchange = e => setRouteField(r, 'active', e.target.checked);
    const reverseRing = $('reverse-ring-button');
    if (reverseRing) reverseRing.onclick = () => setRouteStops(r, [r.stopIds[0], ...r.stopIds.slice(1).reverse()]);
    $('add-stop-button').onclick = () => { state.tool = 'add-stop'; setMobileView('map'); map.getCanvas().style.cursor = 'crosshair'; toast('Click an existing stop on the map to insert it into this line.'); };
    const revert = $('revert-route-button'); if (revert) revert.onclick = () => { remember(); delete state.overrides[r.id]; changed(); toast('Line restored from source snapshot.'); };
    const del = $('delete-route-button'); if (del) del.onclick = () => { remember(); state.customRoutes = state.customRoutes.filter(x => x.id !== r.id); state.customStops = state.customStops.filter(s => !s.id.startsWith(r.id + ':')); state.selected = null; changed(); toast(`${modeLabel(r.mode)} line deleted.`); };
  }
  function enterMetroTool() { state.tool = 'metro'; state.selected = null; state.selectedStop = null; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftMode = 'metro'; state.draftTemplate = null; state.draftColor = colors.metro; state.draftName = nextDraftName('metro'); setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false); setPanel('inspector', true); map.getCanvas().style.cursor = 'crosshair'; renderList(); renderInspector(); renderMap(); toast('Click the map to place metro stations.'); }

  function scheduleStats() { clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recomputeStats, 35); }
  function recomputeStats() {
    $('stat-passengers').textContent = '…'; $('stat-satisfaction').textContent = '…';
    setTimeout(() => { state.stats = sim.calculate(network, state.customRoutes, state.customStops, state.overrides); renderStats(); }, 15);
  }
  function renderStats() {
    const s = state.stats, b = state.baseline; if (!s) return;
    const served = s.passengers > 0;
    $('stat-passengers').textContent = format(s.passengers);
    $('stat-satisfaction').textContent = served ? `${s.satisfaction.toFixed(2)}/100` : 'No trips';
    $('stat-satisfaction').closest('.stat-card').classList.toggle('unavailable', !served);
    $('stat-satisfaction').title = served ? 'Modeled satisfaction index, not observed survey data.' : 'No modeled transit trips were served; satisfaction cannot be estimated.';
    $('stat-wait').textContent = served ? `${s.wait.toFixed(2)} min` : '—';
    $('stat-wait').title = served ? 'Average modeled initial waiting time.' : 'No modeled transit trips were served; waiting time cannot be estimated.';
    $('stat-cost').textContent = compactMillions(s.cost);
    $('stat-cost').title = `zł ${format(s.cost)} per simulated day`;
    $('stat-cost').setAttribute('aria-label', `Operating cost: ${format(s.cost)} Polish złoty per simulated day`);
    const delta = (a, baseline, suffix = '', digits = 0) => { const d = a - baseline; return `${d > 0 ? '+' : ''}${digits ? d.toFixed(digits) : format(d)}${suffix} vs baseline`; };
    $('delta-passengers').textContent = b ? delta(s.passengers, b.passengers) : 'Model estimate';
    $('delta-satisfaction').textContent = served ? (b ? delta(s.satisfaction, b.satisfaction, ' pts', 2) : 'Model index') : 'Unavailable';
    $('secondary-stats').innerHTML = `<span><b>${served ? `${s.travel.toFixed(2)} min` : '—'}</b> journey</span><span><b>${served ? s.transfers : '—'}</b> transfers</span><span><b>${s.coverage}%</b> demand served</span>`;
  }

  function openData() {
    const source = population?.source || {};
    const populationCredit = maskCells.length ? `<p><b>Population</b> — <a href="${escape(source.url || './data/population-density.json')}" target="_blank" rel="noopener">GUS 2021 resident grid</a>; ${escape(source.attribution || '')} The mask uses published 1 km polygons, including zero-resident cells. A muted municipal fill blends gaps at city edges. Cells are selected by their centers inside the eight PRG city boundaries, so the selected total is not an exact full-municipality count.</p>` : '';
    const demandExplanation = state.stats?.demandPopulation ? `The selected 2021 grid contains ${format(state.stats.demandPopulation)} residents. We group them around ${sim.zones.length} fixed neighborhood anchors and weight origins and destinations by those residents. At 0.6 assumed cross-neighborhood trip opportunities per resident per day, that produces ${format(state.stats.demandTrips)} modeled opportunities. The population and service snapshots are from different years.` : 'Population data is unavailable, so the model uses 90,000 assumed daily trip opportunities.';
    modal(`<span class="chip">DATA & MODEL</span><h2>Real network. Estimated outcomes.</h2><p>The fixed snapshot covers ${escape(network.focus.join(', '))}, with surrounding interchange context.</p>
      <div class="modal-sources"><p><b>GZM ZTM</b> — <a href="https://otwartedane.metropoliagzm.pl/dataset/rozklady-jazdy-i-lokalizacja-przystankow-gtfs-wersja-rozszerzona" target="_blank" rel="noopener">GTFS dataset</a>, snapshot for 23 September 2026, CC BY.</p><p><b>Koleje Śląskie</b> — <a href="https://koleje-ks.pl/gtfs/2025-2026.zip" target="_blank" rel="noopener">2025–2026 GTFS feed</a>, downloaded 23 September 2026.</p>${populationCredit}<p><b>Rapid transit access</b> — derived from the active tram, rail and player metro stops in this scenario. Each colored 1 km cell uses straight-line distance from its center to the nearest such stop. It is not a walking route, travel-time estimate, capacity measure or observed dissatisfaction.</p><p><b>Past concepts</b> — three schematic line drafts drawn from a <a href="https://bip.metropoliagzm.pl/attachments/download/189291" target="_blank" rel="noopener">2018 GZM transport concept</a>. Draft stations are not surveyed alignments.</p><p><b>Basemap</b> — <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>, delivered by <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>.</p></div>
      <h3>How the figures work</h3><p>${demandExplanation} Paths use stop sequences, walking transfers, interval estimates and mode speeds. A route's average initial wait is half its interval. Passenger count is a simulated transit share, never an observed count.</p><p>Satisfaction is an index based on modeled journey time, waiting and transfers. It does not provide geographically observed dissatisfaction, so no dissatisfaction mask is shown. Citywide wage was removed from the planning map because it cannot describe district-level conditions. Cost is route-kilometers × departures × assumed cost per kilometer (bus zł12, tram zł20, rail zł38, metro zł55). These values support relative experiments, not official forecasts.</p><p>Each imported route uses one representative GTFS shape per direction; branches and short turns are simplified. Ordinary player lines run both ways; rings run in the drawn order and include their closing segment. New lines and edited stops use direct segments. Play moves illustrative vehicles along route shapes, with estimated travel-time pacing and approximate frequency-based spacing; these are not real-time positions or an official timetable.</p><p><a href="./data/network.json" target="_blank">Open network</a> · <a href="./data/population-density.json" target="_blank">Open population grid</a></p>`);
  }
  function openGuide() {
    modal(`<span class="chip">QUICK GUIDE</span><h2>Test an idea for GZM.</h2><ol><li><b>Explore</b> the real bus, tram and rail patterns. Click a line in the list or on the map.</li><li><b>Reduce map clutter</b> with the mode buttons in the map legend. They hide routes, stops and vehicles without changing the network.</li><li><b>Tinker</b> with its service interval, active state and stops. The stats compare your scenario with the baseline.</li><li><b>Build</b> a metro from map clicks, optionally close it into a one-direction ring, or load a documented past concept as an editable draft.</li><li><b>Plan</b> with resident density or tram-and-rail access layers. The side rails collapse desktop panels, which expand on hover or click; mobile tabs open map, network or line views.</li><li><b>Play</b> the illustrative vehicle animation. Use Undo, Reset, Export and Import to manage scenarios.</li></ol><p>Map: drag to pan, scroll or pinch to zoom. Right-click for location data, line actions and the ruler. While drawing, right-click a station to move or remove it, or middle-drag it. Click a stop to see its service intervals. Press F for fullscreen; Display settings can hide its button. Right-drag on empty map space to rotate.</p>`);
  }
  function exportScenario() {
    const payload = { app: 'GZM Transit Lab', networkVersion: network.version, savedAt: new Date().toISOString(), ...JSON.parse(snapshot()) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `gzm-transit-lab-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Scenario exported.');
  }

  $('route-list').onclick = e => { const card = e.target.closest('[data-route]'); if (card) card.dataset.route === state.selected ? clearSelection() : selectRoute(card.dataset.route); };
  $('template-list').onclick = e => { const button = e.target.closest('[data-template-id]'); if (button) loadTemplate(button.dataset.templateId); };
  $('network-rail').onclick = () => setPanel('network', !state.networkOpen);
  $('inspector-rail').onclick = () => setPanel('inspector', !state.inspectorOpen);
  $('planning-layer').onchange = e => { closeContextMenu(); state.activeLayer = e.target.value; renderPopulationControl(); };
  $('map-context-menu').oncontextmenu = e => e.preventDefault();
  $('map-context-menu').onclick = e => {
    const action = e.target.closest('[data-context-action]')?.dataset.contextAction;
    if (!action || !contextLocation) return;
    const { pos, nearby, route, draftIndex } = contextLocation;
    closeContextMenu();
    if (action === 'route' && route) { finishRuler(); selectRoute(route.id); }
    else if (action === 'inspect-stop' && nearby) { finishRuler(); inspectStop(nearby.id); }
    else if (action === 'add-stop' && nearby) { finishRuler(); addExistingStop(nearby.pos); }
    else if (action === 'move-stop' && draftIndex >= 0) { finishRuler(); state.movingDraftIndex = draftIndex; renderInspector(); toast(`Click the new position for ${state.draft[draftIndex].name}. Middle-drag also works.`); }
    else if (action === 'remove-stop' && draftIndex >= 0) { finishRuler(); const [removed] = state.draft.splice(draftIndex, 1); state.movingDraftIndex = null; renderInspector(); renderMap(); toast(`${removed.name} removed from draft.`); }
    else if (action === 'metro') { finishRuler(); if (state.tool !== 'metro') enterMetroTool(); addDraftStation(pos); }
    else if (action === 'ruler') { if (rulerPoints.length) addRulerPoint(pos); else startRuler(pos); }
    else if (action === 'ruler-finish') finishRuler();
    else if (action === 'ruler-clear') clearRuler();
    else if (action === 'zoom') map.easeTo({ center: pos, zoom: Math.max(13.8, map.getZoom()), duration: 450 });
    else if (action === 'copy') copyCoordinates(pos);
    else if (action === 'data') openData();
  };
  $('map-context-menu').onkeydown = e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = [...$('map-context-menu').querySelectorAll('[role="menuitem"]')];
    const current = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  $('map-context-menu').addEventListener('focusout', e => { if (!e.currentTarget.contains(e.relatedTarget)) closeContextMenu(); });
  $('ruler-finish').onclick = finishRuler;
  $('ruler-clear').onclick = clearRuler;
  document.addEventListener('pointerdown', e => {
    if (!$('map-context-menu').hidden && !$('map-context-menu').contains(e.target) && !$('map').contains(e.target)) closeContextMenu();
  });
  $('map-legend').onclick = e => {
    const button = e.target.closest('[data-map-mode]'); if (!button) return;
    const mode = button.dataset.mapMode;
    state.mapModes[mode] = !state.mapModes[mode];
    applyMapModeVisibility();
  };
  $('heatmap-toggle').onclick = () => { state.populationVisible = !state.populationVisible; renderPopulationControl(); };
  document.querySelector('.mobile-tabs').onclick = e => { const button = e.target.closest('[data-view]'); if (button) setMobileView(button.dataset.view); };
  $('inspector-content').onclick = e => {
    const target = e.target.closest('button'); if (!target) return;
    if (target.hasAttribute('data-clear-selection')) { clearSelection(); return; }
    if (target.dataset.inspectRoute) { selectRoute(target.dataset.inspectRoute); return; }
    if (target.dataset.inspectStop) { inspectStop(target.dataset.inspectStop); return; }
    if (target.dataset.draftRemove != null) { state.draft.splice(Number(target.dataset.draftRemove), 1); state.movingDraftIndex = null; renderInspector(); renderMap(); return; }
    const r = routeById(state.selected); if (!r) return;
    const ids = r.stopIds.slice(); let i, j;
    if (target.dataset.stopUp != null) { i = Number(target.dataset.stopUp); j = i - 1; }
    else if (target.dataset.stopDown != null) { i = Number(target.dataset.stopDown); j = i + 1; }
    else if (target.dataset.stopRemove != null) { ids.splice(Number(target.dataset.stopRemove), 1); setRouteStops(r, ids); return; }
    else return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; setRouteStops(r, ids);
  };
  $('mode-filters').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { state.filter = b.dataset.mode; state.showAll = false; renderList(); } };
  $('route-search').oninput = e => { state.search = e.target.value; renderList(); };
  $('more-routes').onclick = () => { state.showAll = true; renderList(); };
  $('metro-tool').onclick = enterMetroTool;
  $('fullscreen-button').onclick = toggleFullscreen;
  $('settings-button').onclick = openSettings;
  $('fit-button').onclick = fitFocus;
  $('undo-button').onclick = () => { if (!state.history.length) return; Object.assign(state, JSON.parse(state.history.pop())); persist(); renderList(); renderInspector(); renderMap(); scheduleStats(); toast('Last edit undone.'); };
  $('export-button').onclick = exportScenario;
  $('import-button').onclick = () => $('import-file').click();
  $('import-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (![network.version, ...LEGACY_VERSIONS].includes(data.networkVersion)) throw new Error('This scenario does not match a supported network snapshot.');
      const scenario = normalizeScenario(data);
      remember(); Object.assign(state, scenario); state.selected = null; state.selectedStop = null; state.tool = 'inspect'; changed(); toast(data.networkVersion !== network.version ? 'Earlier scenario imported into the eight-city snapshot.' : 'Scenario imported.');
    } catch (err) { toast(err.message || 'Could not read this scenario.'); }
    e.target.value = '';
  };
  $('reset-button').onclick = () => {
    if (!confirm('Restore the published network snapshot and remove your local edits? You can undo immediately afterward.')) return;
    remember(); Object.assign(state, empty()); state.selected = null; state.selectedStop = null; state.tool = 'inspect'; state.draft = []; state.draftRing = false; changed(); toast('Source snapshot restored.');
  };
  $('guide-button').onclick = openGuide; $('about-button').onclick = openData; $('model-link').onclick = openData;
  $('mobile-menu-button').onclick = () => {
    modal('<span class="chip">SCENARIO</span><h2>Manage this sandbox</h2><div class="mobile-menu-actions"><button data-mobile-action="guide-button">Guide</button><button data-mobile-action="fullscreen-button">Toggle fullscreen</button><button data-mobile-action="settings-button">Display settings</button><button data-mobile-action="export-button">Export scenario</button><button data-mobile-action="import-button">Import scenario</button><button data-mobile-action="reset-button">Reset snapshot</button><button data-mobile-action="about-button">Data & model</button></div>');
  };
  $('modal-content').onclick = e => { const button = e.target.closest('[data-mobile-action]'); if (button) { const id = button.dataset.mobileAction; closeModal(); $(id).click(); } };
  $('modal-close').onclick = closeModal; $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
  document.onkeydown = e => {
    if (e.key === 'Escape') {
      if (!$('map-context-menu').hidden) { closeContextMenu(); map.getCanvas().focus(); return; }
      if (!$('modal').hidden) { closeModal(); return; }
      if (rulerActive) { finishRuler(); return; }
      if (state.movingDraftIndex !== null) { state.movingDraftIndex = null; renderInspector(); toast('Station move cancelled.'); return; }
      if (state.selected || state.selectedStop) { clearSelection(); return; }
      if (state.tool !== 'inspect') {
        if (state.draft.length && !confirm('Discard this in-progress line?')) return;
        state.tool = 'inspect'; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = null; state.draftMode = 'metro'; state.draftColor = colors.metro;
        map.getCanvas().style.cursor = '';
        renderInspector(); renderMap();
      }
      return;
    }
    if (!$('modal').hidden) {
      if (e.key === 'Tab') {
        const items = [...$('modal').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (!items.includes(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      return;
    }
    const editing = e.target instanceof Element && e.target.matches('input, textarea, select, [contenteditable="true"]');
    if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFullscreen(); return; }
    if (!editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('undo-button').click(); }
  };
  $('play-button').onclick = () => {
    state.playing = !state.playing;
    $('play-button').textContent = state.playing ? 'Ⅱ Pause' : '▶ Play';
    $('play-button').setAttribute('aria-pressed', String(state.playing));
    if (state.playing) { lastFrame = 0; animationFrame = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  };
  $('speed-button').onclick = () => { state.speed = ({ 1: 4, 4: 12, 12: 1 })[state.speed]; $('speed-button').textContent = `${state.speed}×`; };

  function frame(timestamp) {
    if (!state.playing) return;
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(100, timestamp - lastFrame); lastFrame = timestamp;
    const advance = dt / 1000 * state.speed;
    state.minutes = (state.minutes + advance) % 1440;
    state.elapsedMinutes += advance;
    const h = Math.floor(state.minutes / 60), m = Math.floor(state.minutes % 60);
    const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if ($('sim-clock').textContent !== clock) $('sim-clock').textContent = clock;
    if (timestamp - lastVehicles > 170) { renderVehicles(); lastVehicles = timestamp; }
    animationFrame = requestAnimationFrame(frame);
  }
  function renderVehicles() {
    if (!map.getSource('vehicles')) return;
    const routes = allRoutes().filter(r => state.mapModes[r.mode] && r.active !== false && r.geometry?.some(seg => seg?.length > 1));
    const picked = [...routes.filter(r => r.mode === 'metro'), ...routes.filter(r => r.mode === 'tram').slice(0, 12), ...routes.filter(r => r.mode === 'rail').slice(0, 8), ...routes.filter(r => r.mode === 'bus').slice(0, 10)];
    const modeSpeed = { bus: 22, tram: 25, rail: 48, metro: 42 };
    const features = picked.flatMap((r, i) => {
      const edges = [];
      let length = 0;
      for (const line of r.geometry) {
        if (!Array.isArray(line)) continue;
        for (let j = 1; j < line.length; j++) {
          const distance = sim.km(line[j - 1], line[j]);
          if (distance > 0) { edges.push({ a: line[j - 1], b: line[j], start: length, distance }); length += distance; }
        }
      }
      if (!edges.length) return [];
      const tripMinutes = Math.max(4, length / (modeSpeed[r.mode] || 22) * 60);
      const headway = Math.max(3, Number(r.headway) || 30);
      const bothWays = r.source === 'player' && !r.ring;
      const count = Math.min(4, Math.max(bothWays ? 2 : 1, Math.ceil(tripMinutes / headway) * (bothWays ? 2 : 1)));
      return Array.from({ length: count }, (_, vehicle) => {
        const sideCount = bothWays ? count / 2 : count;
        const reverse = bothWays && vehicle % 2 === 1;
        const sideIndex = bothWays ? Math.floor(vehicle / 2) : vehicle;
        const phase = ((state.elapsedMinutes / tripMinutes + sideIndex / sideCount + (i * .618 % 1) / sideCount) % 1 + 1) % 1;
        const at = (reverse ? 1 - phase : phase) * length;
        const edge = edges.find(item => at < item.start + item.distance) || edges[edges.length - 1];
        const t = Math.max(0, Math.min(1, (at - edge.start) / edge.distance));
        return { type: 'Feature', id: `${r.id}:${vehicle}`, properties: { color: routeColor(r), mode: r.mode }, geometry: { type: 'Point', coordinates: [edge.a[0] + (edge.b[0] - edge.a[0]) * t, edge.a[1] + (edge.b[1] - edge.a[1]) * t] } };
      });
    });
    map.getSource('vehicles').setData(featureCollection(features));
  }
  renderTemplates(); renderList(); renderInspector();
  setTimeout(() => { state.baseline = sim.calculate(network, [], [], {}); state.stats = sim.calculate(network, state.customRoutes, state.customStops, state.overrides); renderStats(); }, 30);
})();

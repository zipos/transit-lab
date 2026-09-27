(() => {
  'use strict';
  const region = window.TRANSIT_REGION;
  const network = window.TRANSIT_NETWORK;
  const population = window.TRANSIT_POPULATION;
  const templates = window.TRANSIT_TEMPLATES?.templates || [];
  const sim = window.TransitSim.createModel(network, population, { tripRate: region.demand?.tripRate });
  const densityCells = Array.isArray(population?.cells) ? population.cells.filter(c => Number.isFinite(+c.lon) && Number.isFinite(+c.lat) && Number.isFinite(+c.density) && +c.density > 0) : [];
  const maskCells = Array.isArray(population?.maskCells) ? population.maskCells.filter(c => c.geometry?.type === 'Polygon' && Number.isFinite(+c.density)) : [];
  const cityBoundaries = population?.cityBoundaries?.type === 'FeatureCollection' ? population.cityBoundaries : { type: 'FeatureCollection', features: [] };
  function migrateRegionStorage() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index++) keys.push(localStorage.key(index));
    for (const key of keys) {
      const legacyPrefix = region.legacyStoragePrefix;
      if (!legacyPrefix || !key || !key.startsWith(legacyPrefix)) continue;
      const rest = key.slice(legacyPrefix.length);
      if (rest === 'display') {
        const previous = JSON.parse(localStorage.getItem('transit-lab:settings') || '{}');
        const display = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem('transit-lab:settings', JSON.stringify({ ...display, ...previous }));
      } else if (!localStorage.getItem(`transit-lab:${region.id}:${rest}`)) {
        localStorage.setItem(`transit-lab:${region.id}:${rest}`, localStorage.getItem(key));
      }
      localStorage.removeItem(key);
    }
  }
  migrateRegionStorage();
  const STORAGE = `transit-lab:${region.id}:${network.version}`;
  const DISPLAY_STORAGE = 'transit-lab:settings';
  const LEGACY_VERSIONS = region.legacyNetworkVersions || [];
  const $ = id => document.getElementById(id);
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const format = n => new Intl.NumberFormat('en-GB').format(Math.round(n));
  const compactMillions = n => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}m` : format(n);
  const colors = { bus: '#ef705e', tram: '#15b8c7', rail: '#5387ef', metro: '#8068e8' };
  const empty = () => ({ overrides: {}, customRoutes: [], customStops: [] });
  const state = { ...empty(), daypart: 'peak', selected: null, selectedStop: null, filter: 'all', search: '', showAll: false, tool: 'inspect', draft: [], draftRing: false, movingDraftIndex: null, draftName: 'M1', draftMode: 'metro', draftTemplate: null, draftColor: '#8068e8', draftHeadway: 8, playing: false, speed: 1, minutes: 420, elapsedMinutes: 0, stats: null, baseline: null, history: [], mobileView: 'map', populationVisible: maskCells.length > 0, activeLayer: 'population', mapModes: { bus: true, tram: true, rail: true, metro: true }, networkOpen: true, inspectorOpen: false, panelTab: 'network' };
  let map, toastTimer, lastFrame = 0, lastVehicles = 0, animationFrame = 0, recomputeTimer, hoverBound = false, modalReturnFocus = null, modalInertState = [], contextLocation = null, accessCache = null, rulerPoints = [], rulerHover = null, rulerActive = false, middleDragIndex = null, middleDragOriginal = null, themeChangeToken = 0;
  let vehiclesActive = false, lastVehicleCount = 0;

  const isDebug = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
  const debugSourceCounts = {};
  if (isDebug) {
    window.__DEBUG__ = {
      sourceCounts: debugSourceCounts,
      lastFrameMs: 0,
      lastVehicleCount: 0
    };
  }
  function setSourceData(sourceId, data) {
    const source = map?.getSource(sourceId);
    if (!source) return;
    if (isDebug) {
      debugSourceCounts[sourceId] = (debugSourceCounts[sourceId] || 0) + 1;
    }
    source.setData(data);
  }

  if (!network || !sim || !window.maplibregl) {
    $('loading')?.classList.add('failed');
    $('loading').innerHTML = '<strong>Could not open the game</strong><small>Required game scripts failed to load. Please check your browser or local server and reload.</small>';
    return;
  }

  const byId = new Map(network.stops.map(s => [s.id, s]));
  const focusBounds = population?.bbox || network.bbox || [18.88, 50.12, 19.33, 50.36];
  const fitFocus = () => map.fitBounds([[focusBounds[0], focusBounds[1]], [focusBounds[2], focusBounds[3]]], { padding: fitPadding(), maxZoom: 11.5, duration: 650 });
  function stop(id) { return byId.get(id) || state.customStops.find(s => s.id === id); }

  let routeCacheList = [];
  let routeCacheMap = new Map();
  let routeIndexMap = new Map();
  function rebuildRouteCache() {
    routeCacheList = network.routes.concat(state.customRoutes).map(r => ({ ...r, ...(state.overrides[r.id] || {}) }));
    routeCacheMap = new Map(routeCacheList.map(r => [r.id, r]));
    routeIndexMap = new Map(routeCacheList.map((r, i) => [r.id, i]));
  }
  rebuildRouteCache();
  function allRoutes() { return routeCacheList; }
  function routeById(id) { return routeCacheMap.get(id); }

  function relativeLuminance(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const clean = hex.trim().replace(/^#/, '');
    let r, g, b;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16) / 255;
      g = parseInt(clean[1] + clean[1], 16) / 255;
      b = parseInt(clean[2] + clean[2], 16) / 255;
    } else if (clean.length === 6) {
      r = parseInt(clean.slice(0, 2), 16) / 255;
      g = parseInt(clean.slice(2, 4), 16) / 255;
      b = parseInt(clean.slice(4, 6), 16) / 255;
    } else {
      return null;
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    const toLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function routeColor(r) {
    if (!r) return colors.bus;
    const fallback = colors[r.mode] || '#15b8c7';
    if (!r.color) return fallback;
    const lum = relativeLuminance(r.color);
    if (lum === null || lum < 0.03 || lum > 0.9) return fallback;
    return r.color;
  }
  const linePalette = ['#8068e8', '#0c98ac', '#d94e70', '#e88b23', '#2c9c70', '#a361cf', '#376fe0', '#d4673a', '#697ab4', '#bd4f9a'];
  function suggestLineColor(points = []) {
    const existing = state.customRoutes.map(r => ({ color: routeColor(r), points: r.stopIds.map(stop).filter(Boolean).map(s => s.pos) }));
    const colorDistance = (a, b) => {
      const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
      const x = rgb(a), y = rgb(b);
      return Math.hypot(...x.map((v, i) => v - y[i]));
    };
    const center = points.length ? points[Math.floor(points.length / 2)] : null;
    return linePalette.reduce((best, candidate) => {
      const score = existing.reduce((sum, r) => {
        const nearby = center && r.points.length ? Math.min(...r.points.map(p => sim.km(center, p))) < 2 : true;
        return sum + (nearby ? 1 : .25) * Math.max(0, 180 - colorDistance(candidate, r.color));
      }, 0) + (candidate === colors.metro ? 4 : 0);
      return score < best.score ? { color: candidate, score } : best;
    }, { color: linePalette[0], score: Infinity }).color;
  }
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
    return { top: 95, bottom: 85, left: state.networkOpen ? leftPane + 15 : 75, right: 75 };
  }
  function snapshot() { return JSON.stringify({ overrides: state.overrides, customRoutes: state.customRoutes, customStops: state.customStops }); }
  function remember() { state.history.push(snapshot()); if (state.history.length > 30) state.history.shift(); }
  function persist() { try { localStorage.setItem(STORAGE, JSON.stringify({ ...JSON.parse(snapshot()), daypart: state.daypart })); } catch (_) { toast('Local storage unavailable. Export your network to keep it.'); } }
  const { safeUrl } = window.TransitScenario;
  const MAX_SCENARIO_BYTES = 5 * 1024 * 1024;
  const normalizeScenario = (data, onWarning = toast) => window.TransitScenario.normalize(data, onWarning);
  function parseScenario(serialized) {
    if (new Blob([serialized]).size > MAX_SCENARIO_BYTES) throw new Error('Scenario exceeds the file size limit (5 MB).');
    return JSON.parse(serialized);
  }
  function loadSaved() {
    try {
      const current = localStorage.getItem(STORAGE);
      const legacy = !current && LEGACY_VERSIONS.map(version => localStorage.getItem(`transit-lab:${region.id}:${version}`)).find(Boolean);
      if (current || legacy) {
        Object.assign(state, normalizeScenario(parseScenario(current || legacy)));
        if (legacy) persist();
      }
    } catch (err) { toast(err.message || 'Could not read the saved scenario.'); }
  }
  loadSaved();
  rebuildRouteCache();
  let showFullscreenButton = true;
  try { showFullscreenButton = JSON.parse(localStorage.getItem(DISPLAY_STORAGE) || '{}').showFullscreenButton !== false; } catch (_) {}
  function renderFullscreen() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('fullscreen-button').hidden = !showFullscreenButton && !active;
    $('fullscreen-button').innerHTML = `<span aria-hidden="true">⛶</span><span class="fullscreen-text">${active ? 'Exit fullscreen' : 'Fullscreen'}</span>`;
    $('fullscreen-button').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    $('fullscreen-button').setAttribute('aria-pressed', String(active));
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      } else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if (document.documentElement.webkitRequestFullscreen) await document.documentElement.webkitRequestFullscreen();
      else throw new Error('Fullscreen API unavailable');
    } catch (_) { toast('Fullscreen is unavailable in this browser.'); }
  }
  function openSettings() {
    const introLabel = introText[introLanguage()].showAgain;
    modal(`<span class="chip">DISPLAY SETTINGS</span><h2>Display</h2><div class="form-stack"><button id="settings-fullscreen" type="button">${document.fullscreenElement || document.webkitFullscreenElement ? 'Exit' : 'Enter'} fullscreen</button><label class="toggle-row"><input id="settings-fullscreen-visible" type="checkbox" ${showFullscreenButton ? 'checked' : ''}> Show fullscreen button</label><button id="settings-intro" type="button">${escape(introLabel)}</button><p class="fine-print">Press F to toggle fullscreen while the map or a panel has focus. Escape exits fullscreen.</p></div>`);
    $('settings-fullscreen').onclick = async () => { closeModal(); await toggleFullscreen(); };
    $('settings-intro').onclick = () => { writeIntroSettings({ introDone: false }); intro.index = 0; intro.active = false; intro.started = false; closeModal(); maybeStartIntro(); };
    $('settings-fullscreen-visible').onchange = e => {
      showFullscreenButton = e.target.checked;
      try { localStorage.setItem(DISPLAY_STORAGE, JSON.stringify({ showFullscreenButton })); } catch (_) {}
      renderFullscreen();
    };
  }
  for (const event of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(event, () => { renderFullscreen(); setTimeout(() => map?.resize(), 50); });
  }
  renderFullscreen();
  $('heatmap-toggle').disabled = !maskCells.length;
  renderPopulationControl();
  function setPanelTab(tab) {
    state.panelTab = tab;
    document.body.dataset.panelTab = tab;
    document.querySelectorAll('[data-panel-tab]').forEach(button => {
      const active = button.dataset.panelTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelector('.sidebar').scrollTop = 0;
  }
  setPanelTab('network');
  function setMobileView(view) {
    state.mobileView = view; document.body.dataset.mobileView = view;
    if (view !== 'map') setPanelTab(view === 'line' ? 'inspect' : view);
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
    if (!left) {
      state.inspectorOpen = open;
      if (open) { state.networkOpen = true; setPanel('network', true); setPanelTab('inspect'); }
      else if (state.panelTab === 'inspect') setPanelTab('network');
      return;
    }
    state[left ? 'networkOpen' : 'inspectorOpen'] = open;
    document.body.dataset[left ? 'networkOpen' : 'inspectorOpen'] = String(open);
    const rail = $('network-rail');
    rail.setAttribute('aria-expanded', String(open));
    rail.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} network panel`);
    rail.textContent = open ? '‹' : '›';
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
    if ($('modal').hidden) {
      modalReturnFocus = document.activeElement;
      modalInertState = [...document.body.children].filter(el => el !== $('modal')).map(el => [el, el.inert]);
      modalInertState.forEach(([el]) => { el.inert = true; });
    }
    $('modal-content').innerHTML = html;
    const heading = $('modal-content').querySelector('h2');
    if (heading) heading.id = 'modal-title';
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
    center: region.center, zoom: region.zoom, pitch: 28, bearing: -6,
    minZoom: 8.2, maxZoom: 18, maxPitch: 60,
    attributionControl: false, antialias: true,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.on('error', ev => {
    const err = ev?.error || ev;
    const msg = String(err?.message || err || '');
    const url = String(err?.url || ev?.url || '');
    const isOpenFreeMap = /openfreemap/i.test(msg) || /openfreemap/i.test(url) || /openfreemap/i.test(mapStyle()) || !map.isStyleLoaded();
    const loading = $('loading');
    if (loading) {
      loading.classList.add('failed');
      if (isOpenFreeMap) {
        loading.innerHTML = '<strong>Could not load OpenFreeMap tiles</strong><small>A request to OpenFreeMap (tiles.openfreemap.org) failed. The game files loaded, but the basemap could not be reached.</small>';
      } else {
        loading.innerHTML = '<strong>Could not load map</strong><small>MapLibre encountered an error loading map resources.</small>';
      }
    } else if (isOpenFreeMap && /tiles\.openfreemap\.org/i.test(msg + url)) {
      toast('OpenFreeMap tiles failed to load.');
    }
  });
  const restoreGameLayers = () => {
    if (!map.getStyle()?.layers || map.getSource('city-population') || map.getLayer('routes')) return;
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
    paint('selected-halo', 'line-color', '#10212b');
    paint('selected-halo', 'line-opacity', 0.6);
    paint('selected-stop-label', 'text-color', '#233746');
    paint('selected-stop-label', 'text-halo-color', '#ffffff');
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
    paint('selected-halo', 'line-color', '#ffffff');
    paint('selected-halo', 'line-opacity', 0.98);
    paint('selected-stop-label', 'text-color', '#e4f5f7');
    paint('selected-stop-label', 'text-halo-color', '#13232c');
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
    if (map.getSource('city-population')) return;
    const before = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    const beneathRoads = map.getStyle().layers.find(layer => layer.id === 'road_pier')?.id || before;
    const visible = state.populationVisible ? 'visible' : 'none';
    const densityVisible = state.populationVisible && state.activeLayer === 'population' ? 'visible' : 'none';
    const densityColors = themeMedia.matches
      ? ['#244953', '#397780', '#69b7b6', '#efc17a', '#ed8b76', '#bc6b9a', '#8557b7']
      : ['#e6f1e9', '#afdcd0', '#71c1c1', '#ffd090', '#f29a79', '#b8689e', '#704896'];
    map.addSource('city-population', { type: 'geojson', data: cityBoundaries });
    map.addSource('population-grid', { type: 'geojson', data: accessGrid().features });
    map.addLayer({ id: 'city-population-fill', type: 'fill', source: 'city-population', layout: { visibility: visible }, paint: { 'fill-color': themeMedia.matches ? '#285360' : '#cae9e0', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .36, 11, .40, 13, .52] } }, beneathRoads);
    map.addLayer({ id: 'population-grid-fill', type: 'fill', source: 'population-grid', layout: { visibility: densityVisible }, paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'density'], 0, densityColors[0], 250, densityColors[1], 1000, densityColors[2], 2500, densityColors[3], 5000, densityColors[4], 8000, densityColors[5], 12000, densityColors[6]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .48, 11, .52, 13, .68, 18, .59],
      'fill-antialias': true,
    } }, beneathRoads);
    const accessVisible = state.populationVisible && state.activeLayer === 'access' ? 'visible' : 'none';
    const accessColors = themeMedia.matches
      ? ['#245c59', '#4c9183', '#d6b476', '#ca816b', '#a95266']
      : ['#bce7d9', '#83cdb7', '#e4d796', '#efac78', '#d86f77'];
    map.addLayer({ id: 'access-grid-fill', type: 'fill', source: 'population-grid', layout: { visibility: accessVisible }, paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'accessM'], 0, accessColors[0], 400, accessColors[1], 900, accessColors[2], 1800, accessColors[3], 3000, accessColors[4]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .52, 11, .56, 13, .72, 18, .64],
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
    map.addLayer({ id: 'route-halo', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['==', ['get', 'mode'], 'metro'], 4, ['==', ['get', 'mode'], 'rail'], 3, ['==', ['get', 'mode'], 'tram'], 2, 1] }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5, 17, 9], 'line-opacity': ['case', ['==', ['get', 'active'], false], 0, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.08, 11, 0.15, 14, 0.5, 17, 0.65], ['interpolate', ['linear'], ['zoom'], 9, 0.35, 11, 0.45, 14, 0.65, 17, 0.75]] } }, before);
    map.addLayer({ id: 'routes', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['==', ['get', 'mode'], 'metro'], 4, ['==', ['get', 'mode'], 'rail'], 3, ['==', ['get', 'mode'], 'tram'], 2, 1] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 1.0, 11, 1.15, 13, 2.0, 17, 4.0], ['interpolate', ['linear'], ['zoom'], 9, 1.8, 11, 1.8, 13, 2.5, 17, 4.5]], 'line-opacity': ['case', ['==', ['get', 'active'], false], 0.08, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.25, 11, 0.25, 13, 0.45, 17, 0.70], ['interpolate', ['linear'], ['zoom'], 9, 0.85, 11, 0.85, 13, 0.88, 17, 0.92]] } }, before);
    map.addLayer({ id: 'selected-halo', type: 'line', source: 'selected-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': themeMedia.matches ? '#ffffff' : '#10212b', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 12], 'line-opacity': themeMedia.matches ? 0.98 : 0.6 } }, before);
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
    if (state.playing || vehiclesActive) renderVehicles();
  }
  function renderNetwork() {
    if (!map.getSource('network-routes')) return;
    const previousAccessKey = accessCache?.key;
    const currentAccess = accessGrid();
    if (previousAccessKey !== currentAccess.key) setSourceData('population-grid', currentAccess.features);
    const routes = allRoutes();
    setSourceData('network-routes', featureCollection(routes.map(routeFeature)));
    const stopModes = new Map();
    routes.forEach(route => {
      if (route.active !== false) {
        route.stopIds.forEach(id => {
          let modes = stopModes.get(id);
          if (!modes) { modes = new Set(); stopModes.set(id, modes); }
          modes.add(route.mode);
        });
      }
    });
    setSourceData('network-stops', featureCollection(network.stops.concat(state.customStops).map(s => pointFeature(s, { modes: [...(stopModes.get(s.id) || [])] }))));
    applyMapModeVisibility();
  }
  function renderSelection() {
    if (!map.getSource('selected-route')) return;
    const selected = routeById(state.selected);
    setSourceData('selected-route', featureCollection(selected ? [routeFeature(selected)] : []));
    setSourceData('selected-stops', featureCollection(selected ? selected.stopIds.map(stop).filter(Boolean).map(s => pointFeature(s, { color: routeColor(selected), mode: selected.mode })) : []));
    const inspected = stop(state.selectedStop);
    setSourceData('inspected-stop', featureCollection(inspected ? [pointFeature(inspected)] : []));
  }
  function renderMap() {
    renderNetwork();
    renderSelection();
    renderDraft();
    renderRuler();
  }
  function renderDraft() {
    if (!map.getSource('metro-draft')) return;
    const coords = state.draft.map(s => s.pos);
    if (state.draftRing && coords.length >= 3) coords.push(coords[0]);
    setSourceData('metro-draft', featureCollection(coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : []));
    setSourceData('metro-draft-stops', featureCollection(state.draft.map((s, i) => pointFeature({ ...s, id: String(i) }))));
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
    renderInspector(); renderDraft(); toast(`${state.draft.length} station${state.draft.length === 1 ? '' : 's'} in line draft`);
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
    renderInspector(); renderDraft(); toast(`${current.name} moved.`);
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
      setSourceData('ruler-line', featureCollection([]));
      setSourceData('ruler-points', featureCollection([]));
      return;
    }
    const display = rulerActive && rulerHover ? rulerPoints.concat([rulerHover]) : rulerPoints;
    $('ruler-distance').textContent = formatRulerDistance(rulerDistance(display));
    $('ruler-hint').textContent = rulerActive ? 'Click map to add points · right-click for options' : 'Finished · right-click to extend or clear';
    $('ruler-finish').hidden = !rulerActive;
    setSourceData('ruler-line', featureCollection(display.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: display } }] : []));
    setSourceData('ruler-points', featureCollection(rulerPoints.map((pos, index) => pointFeature({ id: `ruler:${index}`, name: '', pos }))));
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
    const rightPane = innerWidth;
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
  function changed() { rebuildRouteCache(); persist(); renderList(); renderInspector(); renderNetwork(); renderSelection(); scheduleStats(); introSync(); }
  function clearSelection() {
    state.selected = null; state.selectedStop = null;
    setPanelTab('network'); renderList(); renderInspector(); renderSelection();
  }
  function inspectStop(id) {
    if (!stop(id)) return;
    state.selected = null; state.selectedStop = id; state.tool = 'inspect';
    setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false);
    setPanel('inspector', true); renderList(); renderInspector(); renderSelection();
  }
  function selectRoute(id) {
    state.selected = id; state.selectedStop = null; state.tool = 'inspect'; state.draft = []; state.movingDraftIndex = null; setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false); setPanel('inspector', true); renderList(); renderInspector(); renderSelection();
    const r = routeById(id), points = (r?.geometry || []).flat();
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds(); points.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 13.7, duration: 650 });
    }
    introSync();
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
    $('template-count').textContent = `(${templates.length})`;
    host.innerHTML = templates.map(t => {
      const mode = ['metro', 'tram', 'rail'].includes(t.mode) ? t.mode : 'rail';
      const count = Array.isArray(t.stations) ? t.stations.length : 0;
      return `<article class="template-card"><div class="section-title"><span class="chip mode-${escape(mode)}">${escape(modeLabel(mode))}</span><span class="value">${escape(t.status || 'Historical concept')}</span></div><h3>${escape(t.title || 'Regional rail concept')}</h3><p>${escape(t.description || 'Documented regional transport proposal.')}</p><p class="fine-print">${count} named anchors · ${escape(t.confidence || 'Conceptual alignment')}</p><div class="toolbar"><a href="${escape(safeUrl(t.sourceUrl || '#'))}" target="_blank" rel="noopener">Read source ↗</a><button class="primary" data-template-id="${escape(t.id)}">Load editable draft</button></div></article>`;
    }).join('') || '<p class="empty-state">No sourced line concepts are available.</p>';
  }
  function loadTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template || !Array.isArray(template.stations) || template.stations.length < 2) return toast('This line concept is incomplete.');
    const mode = ['tram', 'rail', 'metro'].includes(template.mode) ? template.mode : 'rail';
    state.tool = 'metro'; state.selected = null; state.selectedStop = null; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = template;
    state.draftMode = mode; state.draftColor = suggestLineColor(template.stations.map(s => [Number(s.lon), Number(s.lat)]));
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
    renderList(); renderInspector(); renderDraft();
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
    $('route-list').innerHTML = list.map(r => `<button class="route-card mode-${r.mode}${r.id === state.selected ? ' selected' : ''}" data-route="${escape(r.id)}" aria-pressed="${r.id === state.selected}" style="--route-color:${escape(routeColor(r))};width:100%;text-align:left;${r.active === false ? 'opacity:.48;' : ''}"><span class="route-info"><strong>${escape(r.name)} <span class="route-dir">${escape(r.ring ? '⟳' : r.source === 'player' ? '↔' : r.direction === '1' ? '↩' : '→')}</span></strong><small>${escape(r.longName || r.stopIds.length + ' stops')}</small></span><span class="route-type">${escape(r.mode)}</span></button>`).join('') || '<p class="empty-state">No lines match this filter.</p>';
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
      const sourceNote = template ? `<div class="section"><p><b>${escape(template.status || 'Historical concept')}</b> · ${escape(template.confidence || 'Conceptual alignment')}</p><p>${escape(template.description || '')}</p><p><a href="${escape(safeUrl(template.sourceUrl || '#'))}" target="_blank" rel="noopener">${escape(template.sourceTitle || 'Open proposal source')} ↗</a></p><p class="fine-print">The proposal source does not give an engineered alignment. ${template.stationCoordinateSourceUrl ? `Map coordinates: <a href="${escape(safeUrl(template.stationCoordinateSourceUrl))}" target="_blank" rel="noopener">station data source ↗</a>.` : ''}</p></div>` : '';
      const heading = template ? `Edit this ${mode.toLowerCase()} concept` : 'Draw your metro';
      const intro = state.movingDraftIndex !== null ? `Click the new map position for ${state.draft[state.movingDraftIndex]?.name || 'this station'}. Press Escape to cancel.` : template ? 'This sourced idea is loaded as a draft. Add or remove stations to explore a variant.' : 'Tap the map to place stations. Click near an existing stop to snap to its location and enable a transfer.';
      const routeNote = (template ? 'Draft segments are direct lines between the displayed stations. Proposed station sites marked schematic are map anchors, not surveyed locations.' : 'Metro tracks are drawn as direct segments. Tunnel engineering and construction cost are outside this sandbox.') + (state.draftRing ? ' The closing segment connects directly to the first station.' : '') + ' Right-click a station to move or remove it; middle-drag to reposition it directly.';
      el.innerHTML = `<div class="section"><div class="section-title"><h2>${template ? 'PROPOSAL DRAFT' : 'NEW INFRASTRUCTURE'}</h2><span class="chip mode-${escape(state.draftMode)}">${escape(mode)}</span></div><h2 class="inspector-heading">${escape(heading)}</h2><p class="intro">${escape(intro)}</p><div class="form-stack"><label>Line name<input id="metro-name" maxlength="18" value="${escape(state.draftName)}"></label><div class="form-row"><label>Every · minutes<input id="metro-headway" type="number" min="3" max="60" value="${state.draftHeadway}"></label><label>Line color<input id="metro-color" type="color" value="${escape(state.draftColor)}"></label></div><button type="button" id="suggest-draft-color">Suggest color</button><label class="toggle-row"><input id="draft-ring" type="checkbox" ${state.draftRing ? 'checked' : ''}> Ring line · one continuous direction</label><small>Stops are served in drawn order, then the line returns to its first stop.</small></div></div>${sourceNote}<div class="section"><div class="section-title"><h3>Stations</h3><span class="value">${state.draft.length}</span></div><div class="stop-list">${state.draft.map((s, i) => `<div class="stop-row"><span class="stop-index">${i + 1}</span><span title="${escape(s.coordinateNote || '')}">${escape(s.name)}${s.schematic ? '<small class="source-note">Schematic location</small>' : ''}</span><button data-draft-remove="${i}" title="Remove station">×</button></div>`).join('') || '<p class="empty-state">Click on the map to begin.</p>'}</div><div class="toolbar" style="margin-top:14px"><button id="cancel-metro">Cancel</button><button id="finish-metro" class="primary" ${state.draft.length < (state.draftRing ? 3 : 2) ? 'disabled' : ''}>Open line</button></div></div><div class="section"><p class="fine-print">${escape(routeNote)}</p></div>`;
      $('metro-name').oninput = e => state.draftName = e.target.value;
      $('metro-headway').onchange = e => state.draftHeadway = Math.max(3, Math.min(60, Number(e.target.value) || 8));
      $('metro-color').oninput = e => { state.draftColor = e.target.value; renderDraft(); };
      $('suggest-draft-color').onclick = () => { state.draftColor = suggestLineColor(state.draft.map(s => s.pos)); $('metro-color').value = state.draftColor; renderDraft(); };
      $('draft-ring').onchange = e => { state.draftRing = e.target.checked; renderInspector(); renderDraft(); };
      el.querySelectorAll('[data-draft-remove]').forEach(button => {
        const station = state.draft[Number(button.dataset.draftRemove)];
        button.setAttribute('aria-label', `Remove ${station?.name || 'station'} from draft`);
      });
      $('finish-metro').onclick = createMetro;
      $('cancel-metro').onclick = () => { state.tool = 'inspect'; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = null; state.draftMode = 'metro'; state.draftColor = colors.metro; map.getCanvas().style.cursor = ''; renderInspector(); renderDraft(); };
      return;
    }
    if (state.selectedStop) {
      const station = stop(state.selectedStop);
      if (!station) { state.selectedStop = null; return renderInspector(); }
      const areaIds = new Set([station.id]);
      if (station.area) {
        for (const candidate of network.stops.concat(state.customStops)) {
          if (candidate.area === station.area) areaIds.add(candidate.id);
        }
      }
      const services = allRoutes().filter(route => route.stopIds.some(id => areaIds.has(id))).map(route => {
        const inboundStops = new Set();
        route.stopIds.forEach((id, index) => {
          if (!areaIds.has(id)) return;
          const previous = route.stopIds[index - 1] || (route.ring ? route.stopIds.at(-1) : null);
          const next = route.source === 'player' && !route.ring ? route.stopIds[index + 1] : null;
          for (const neighbor of [previous, next]) if (neighbor) inboundStops.add(stop(neighbor)?.name || neighbor);
          if (!previous && !next) inboundStops.add('Origin');
        });
        return { route, inbound: [...inboundStops].join(' / ') || 'Origin' };
      }).sort((a, b) => Number(a.route.active === false) - Number(b.route.active === false) || a.route.mode.localeCompare(b.route.mode) || a.route.name.localeCompare(b.route.name, 'pl'));
      el.innerHTML = `<div class="section"><div class="section-title"><h2>STOP INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close stop inspector">×</button></div><h2 class="inspector-heading">${escape(station.name)}</h2><p class="intro">${escape(station.city || 'Transit stop')} · ${services.length} ${services.length === 1 ? 'pattern' : 'patterns'} using this ${areaIds.size > 1 ? 'interchange' : 'stop'}</p><p class="fine-print">Intervals are scenario estimates per pattern and direction, not a live arrival board. Several patterns may share a line name.</p></div><div class="section"><div class="section-title"><h3>Service at this stop</h3><span class="value">${services.length}</span></div><div class="stop-service-list">${services.map(({ route, inbound }) => `<button type="button" class="stop-service mode-${escape(route.mode)}" data-inspect-route="${escape(route.id)}"><span class="stop-service-main"><b>${escape(route.name)} ${route.ring ? '⟳' : route.source === 'player' ? '↔' : route.direction === '1' ? '↩' : '→'}</b><small>${escape(route.mode)} · from ${escape(inbound)}</small></span><span class="stop-service-interval">${route.active === false || !sim.resolveService(route, state.daypart).runs ? 'Off' : `Every ${escape(sim.resolveService(route, state.daypart).headway)} min`}</span></button>`).join('') || '<p class="empty-state">No lines currently use this stop.</p>'}</div></div>`;
      return;
    }
    const r = routeById(state.selected);
    if (!r) {
      el.innerHTML = `<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2></div><div class="inspector-hero"><span class="hero-mark">↗</span><h2>Make the network yours.</h2><p>Select any route on the map or in the list to adjust service. Or draw a metro line through the real city.</p><button class="primary" id="hero-metro">+ Draw metro line</button></div></div><div class="section"><div class="section-title"><h3>Source snapshot</h3></div><p class="source-note">${network.sources.map(item => `${escape(item.name)}: ${escape(item.date || '')}`).join('<br>')}<br>OpenStreetMap basemap</p><button id="inspector-data">View data and method ↗</button></div>`;
      $('hero-metro').onclick = enterMetroTool; $('inspector-data').onclick = openData;
      return;
    }
    const templateNote = r.templateId ? `<p class="model-notice"><b>${escape(r.templateStatus || 'Based on a historical proposal')}</b> · ${escape(r.templateConfidence || 'Conceptual alignment')}<br>${escape(r.templateDescription || 'This line began from a sourced regional concept.')}${r.templateSourceUrl ? `<br><a href="${escape(safeUrl(r.templateSourceUrl))}" target="_blank" rel="noopener">${escape(r.templateSourceTitle || 'Read proposal source')} ↗</a>` : ''}<br>Stations tagged schematic are approximate map anchors; line segments are direct and do not represent an engineered alignment.</p>` : '';
    const periodService = sim.resolveService(r, state.daypart);
    const intervalHelp = r.ring ? 'Continuous one direction service, returning from the last stop to the first.' : r.source === 'player' ? 'Service runs in both directions; return trips and cost are modeled. The interval stays the same in every period.' : !periodService.runs ? 'This pattern has no trips in the selected period.' : 'Interval for the selected period. Changing it replaces the interval in every period.';
    el.innerHTML = `<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close line inspector">×</button><span class="chip mode-${escape(r.mode)}">${escape(modeLabel(r.mode))}</span></div><div class="inspector-line-title"><span class="line-badge" style="background:${escape(routeColor(r))}">${escape(r.name)}</span><div><h2>${escape(r.longName || r.name)}</h2><small>${r.source === 'player' ? `Your ${escape(modeLabel(r.mode).toLowerCase())} line` : region.feedLabels?.[r.source] || r.source} · ${r.stopIds.length} stops</small></div></div>${templateNote}${r.source === 'pkm' ? `<p class="model-notice">Main timetable sequence; branches are simplified.${r.unmappedStops?.length ? ` ${r.unmappedStops.length} stops without published map coordinates are omitted: ${escape([...new Set(r.unmappedStops)].join(', '))}.` : ''}</p>` : ''}${r.edited ? '<p class="model-notice">Stop edits use direct geometry between stops; street or track alignment is not recalculated.</p>' : ''}<div class="form-stack"><label>Service interval · minutes<input id="route-headway" type="number" min="3" max="120" value="${escape(periodService.headway)}"><small>${escape(intervalHelp)}</small></label>${r.source === 'player' ? `<label class="toggle-row"><input id="route-ring" type="checkbox" ${r.ring ? 'checked' : ''} ${r.stopIds.length < 3 ? 'disabled' : ''}> Ring line · one continuous direction</label>` : ''}<label class="toggle-row"><input id="route-active" type="checkbox" ${r.active === false ? '' : 'checked'}> Line in service</label></div><div class="toolbar"><button id="add-stop-button">+ Add existing stop</button>${r.ring ? '<button id="reverse-ring-button" type="button">Reverse ring direction</button>' : ''}${r.source === 'player' ? `<button id="delete-route-button" class="danger">Delete ${escape(modeLabel(r.mode).toLowerCase())} line</button>` : '<button id="revert-route-button">Revert line</button>'}</div></div><div class="section"><div class="section-title"><h3>Stop sequence</h3><span class="value">${r.stopIds.length}</span></div><div class="stop-list">${r.stopIds.map((id, i) => { const s = stop(id); return `<div class="stop-row"><span class="stop-index">${i + 1}</span><button class="stop-name-button" type="button" data-inspect-stop="${escape(id)}" title="Inspect all service at this stop">${escape(s?.name || id)}${s?.schematic ? '<small class="source-note">Schematic location</small>' : ''}</button><div class="stop-actions"><button data-stop-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move earlier">↑</button><button data-stop-down="${i}" ${i === r.stopIds.length - 1 ? 'disabled' : ''} title="Move later">↓</button><button data-stop-remove="${i}" ${r.stopIds.length <= 2 ? 'disabled' : ''} title="Remove stop">×</button></div></div>`; }).join('')}</div></div>`;
    const sourceLabel = el.querySelector('.inspector-line-title small');
    if (r.source === 'pkm') sourceLabel.textContent = `PKM Jaworzno timetable · ${r.stopIds.length} stops`;
    $('route-headway').parentElement.insertAdjacentHTML('afterend', `<div class="form-row"><label>Line color<input id="route-color" type="color" value="${escape(routeColor(r))}"></label><button type="button" id="suggest-route-color">Suggest color</button></div>`);
    $('route-color').onchange = e => setRouteField(r, 'color', e.target.value);
    $('suggest-route-color').onclick = () => setRouteField(r, 'color', suggestLineColor(r.stopIds.map(stop).filter(Boolean).map(s => s.pos)));
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
  function enterMetroTool() { state.tool = 'metro'; state.selected = null; state.selectedStop = null; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftMode = 'metro'; state.draftTemplate = null; state.draftColor = suggestLineColor(); state.draftName = nextDraftName('metro'); setMobileView('line'); setPanel('inspector', true); map.getCanvas().style.cursor = 'crosshair'; renderList(); renderInspector(); renderSelection(); renderDraft(); toast('Click the map to place metro stations.'); }

  let statsWorker = null, statsRevision = 0, workerUnavailable = false, statsBusy = false, pendingStats = null;
  function scheduleStats() {
    // Invalidate an in-flight result as soon as the scenario changes.
    statsRevision++;
    clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recomputeStats, 35);
  }
  function recomputeStats() {
    $('stat-passengers').textContent = '…'; $('stat-satisfaction').textContent = '…';
    const revision = ++statsRevision;
    const scenario = { revision, customRoutes: state.customRoutes, customStops: state.customStops, overrides: state.overrides, daypart: state.daypart, networkUrl: window.TRANSIT_URLS.network, populationUrl: window.TRANSIT_URLS.population, tripRate: region.demand?.tripRate };
    if (!workerUnavailable) {
      try {
        if (!statsWorker) {
          statsWorker = new Worker('./sim-worker.js?v=2026-09-28-dayparts');
          statsWorker.onmessage = ({ data }) => {
            statsBusy = false;
            if (data.revision === statsRevision) {
              state.baseline = data.baseline; state.stats = data.stats; renderStats();
            }
            if (pendingStats) {
              const next = pendingStats; pendingStats = null; statsBusy = true; statsWorker.postMessage(next);
            }
          };
          statsWorker.onerror = () => {
            statsWorker.terminate(); statsWorker = null; workerUnavailable = true; statsBusy = false; pendingStats = null;
            recomputeStats();
          };
        }
        if (statsBusy) pendingStats = structuredClone(scenario);
        else { statsBusy = true; statsWorker.postMessage(scenario); }
        return;
      } catch (_) { statsWorker?.terminate(); statsWorker = null; workerUnavailable = true; }
    }
    // Local-file previews and browsers without workers retain the same model.
    setTimeout(() => {
      if (revision !== statsRevision) return;
      state.baseline = sim.calculate(network, [], [], {}, state.daypart);
      state.stats = sim.calculate(network, scenario.customRoutes, scenario.customStops, scenario.overrides, state.daypart);
      renderStats();
    }, 15);
  }
  function renderStats() {
    const s = state.stats, b = state.baseline; if (!s) return;
    const served = s.passengers > 0;
    $('pulse-passengers').textContent = compactMillions(s.passengers);
    $('pulse-satisfaction').textContent = served ? s.satisfaction.toFixed(2) : '—';
    $('stat-passengers').textContent = format(s.passengers);
    $('stat-satisfaction').textContent = served ? `${s.satisfaction.toFixed(2)}/100` : 'No trips';
    $('stat-satisfaction').closest('.stat-card').classList.toggle('unavailable', !served);
    $('stat-satisfaction').title = served ? 'Modeled satisfaction index, not observed survey data.' : 'No modeled transit trips were served; satisfaction cannot be estimated.';
    $('stat-wait').textContent = served ? `${s.wait.toFixed(2)} min` : '—';
    $('stat-wait').title = served ? 'Average modeled waiting time across all boardings.' : 'No modeled transit trips were served; waiting time cannot be estimated.';
    $('stat-cost').textContent = compactMillions(s.cost);
    $('stat-cost').title = `zł ${format(s.cost)} per simulated day`;
    $('stat-cost').setAttribute('aria-label', `Operating cost: ${format(s.cost)} Polish złoty per simulated day`);
    const delta = (a, baseline, suffix = '', digits = 0) => { const d = a - baseline; return `${d > 0 ? '+' : ''}${digits ? d.toFixed(digits) : format(d)}${suffix} vs baseline`; };
    $('delta-passengers').textContent = b ? delta(s.passengers, b.passengers) : 'Model estimate';
    $('delta-satisfaction').textContent = served ? (b ? delta(s.satisfaction, b.satisfaction, ' pts', 2) : 'Model index') : 'Unavailable';
    $('secondary-stats').innerHTML = `<span><b>${served ? `${s.travel.toFixed(2)} min` : '—'}</b> journey</span><span><b>${served ? s.transfers : '—'}</b> transfers</span><span><b>${s.coverage}%</b> demand served</span>`;
    const cities = Object.keys(s.cityStats || {}).sort((a, b) => a.localeCompare(b, 'pl'));
    state.resultCity = cities.includes(state.resultCity) ? state.resultCity : (cities.includes(region.defaultResultArea) ? region.defaultResultArea : cities[0]);
    const local = s.cityStats?.[state.resultCity], original = b?.cityStats?.[state.resultCity];
    $('local-results').innerHTML = `<label>Local impact<select id="result-city">${cities.map(city => `<option value="${escape(city)}" ${city === state.resultCity ? 'selected' : ''}>${escape(city)}</option>`).join('')}</select></label><div class="local-results-grid"><span><b>${format(local?.passengers || 0)}</b> trips <small>${original ? delta(local.passengers, original.passengers) : ''}</small></span><span><b>${local?.passengers ? local.satisfaction.toFixed(2) : '—'}</b> satisfaction <small>${original && local?.passengers ? delta(local.satisfaction, original.satisfaction, ' pts', 2) : ''}</small></span><span><b>${local?.coverage.toFixed(2) || '0.00'}%</b> demand served <small>${original ? delta(local.coverage, original.coverage, ' pts', 2) : ''}</small></span></div>`;
    $('result-city').onchange = e => { state.resultCity = e.target.value; renderStats(); };
    maybeStartIntro();
  }

  function openData() {
    const source = population?.source || {};
    const populationCredit = maskCells.length ? `<p><b>Population</b> — <a href="${escape(safeUrl(source.url || window.TRANSIT_URLS.population))}" target="_blank" rel="noopener">${escape(source.shortName || 'Resident grid')}</a>; ${escape(source.attribution || '')} The mask uses published 1 km polygons, including zero-resident cells. Cells are selected by their centers inside ${region.municipalities.length} municipal boundaries, so totals are not exact full-municipality counts.</p>` : '';
    const feedNotes = network.sources.map(item => `<p><b>${escape(item.name)}</b> — <a href="${escape(safeUrl(item.url || '#'))}" target="_blank" rel="noopener">${escape(item.license || 'Source')}</a>${item.date ? `, ${escape(item.date)}` : ''}.${item.note ? ` ${escape(item.note)}` : ''}</p>`).join('');
    const tripRate = region.demand?.tripRate || 0.6;
    const demandExplanation = state.stats?.demandPopulation ? `The selected grid contains ${format(state.stats.demandPopulation)} residents. We group them into ${sim.zones.length} municipality-based anchors. Origins use residential population; destinations use a separate estimate based on local density and proximity to the municipal population center. This is not an observed work, school or retail zoning dataset. At ${tripRate} assumed cross-zone trip opportunities per resident per day, this produces ${format(state.stats.demandTrips)} modeled opportunities.` : 'Population data is unavailable.';
    modal(`<span class="chip">DATA & MODEL</span><h2>Real network. Estimated outcomes.</h2><p>The playable area covers ${region.municipalities.length} municipalities in ${escape(region.name.en)}. Outlying endpoints provide transit context.</p>
      <div class="modal-sources">${feedNotes}${populationCredit}<p><b>Rapid transit access</b> — straight-line distance from each cell center to the nearest active tram, rail or player metro stop.</p><p><b>Past concepts</b> — schematic drafts shipped with this region.</p><p><b>Basemap</b> — <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>, delivered by <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>.</p></div>
      <h3>How the figures work</h3><p>${demandExplanation} Paths use stop sequences, walking transfers, the selected period's interval and scheduled run times. A route's average initial wait is half its interval. The Peak, Midday and Saturday control describes that period; the clock minute does not change the model. Passenger count is a simulated transit share, never an observed count.</p><p>Satisfaction is an index based on modeled journey time, which already includes waiting and transfer penalties. The local results are grouped by trip origin. Cost is route-kilometers × departures × assumed cost per kilometer (bus zł12, tram zł20, rail zł38, metro zł55). Peak uses Wednesday trip counts. Another period uses that period's stored trip count, or Wednesday trips scaled by the peak interval divided by the period interval when no count was stored. These values support relative experiments, not official forecasts.</p><p>Each GTFS route uses one representative shape per direction; branches and short turns are simplified. Ordinary player lines run both ways; rings run in the drawn order and include their closing segment. New lines, PKM patterns and edited stops use direct segments. Play moves illustrative vehicles, not real-time positions.</p><p><a href="${escape(window.TRANSIT_URLS.network)}" target="_blank">Open network</a> · <a href="${escape(window.TRANSIT_URLS.population)}" target="_blank">Open population grid</a></p>`);
  }
  function openGuide() {
    modal(`<span class="chip">QUICK GUIDE</span><h2>Test an idea for ${escape(region.shortName.en)}.</h2><ol><li><b>Explore</b> the real bus, tram and rail patterns. Click a line in the list or on the map.</li><li><b>Reduce map clutter</b> with the mode buttons in the bottom-bar Layers menu. They hide routes, stops and vehicles without changing the network.</li><li><b>Tinker</b> with its service interval, active state and stops. The stats compare your scenario with the baseline.</li><li><b>Build</b> a metro from map clicks, optionally close it into a one-direction ring, or load a documented past concept as an editable draft.</li><li><b>Plan</b> with resident density or tram-and-rail access layers. The left rail collapses the single desktop panel, which expands on hover or click. Network, Inspect and Results share it; mobile tabs open the same views.</li><li><b>Play</b> the illustrative vehicle animation. Use Undo, Reset, Export and Import to manage scenarios.</li></ol><p>Map: drag to pan, scroll or pinch to zoom. Right-click for location data, line actions and the ruler. While drawing, right-click a station to move or remove it, or middle-drag it. Click a stop to see its service intervals. Press F for fullscreen; Display settings can hide its button. Right-drag on empty map space to rotate.</p>`);
  }
  function exportScenario() {
    const payload = { app: 'Transit Lab', region: region.id, networkVersion: network.version, savedAt: new Date().toISOString(), ...JSON.parse(snapshot()), daypart: state.daypart };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `transit-lab-${region.id}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Scenario exported.');
  }

  $('route-list').onclick = e => { const card = e.target.closest('[data-route]'); if (card) card.dataset.route === state.selected ? clearSelection() : selectRoute(card.dataset.route); };
  $('template-list').onclick = e => { const button = e.target.closest('[data-template-id]'); if (button) loadTemplate(button.dataset.templateId); };
  $('network-rail').onclick = () => setPanel('network', !state.networkOpen);
  document.querySelector('.panel-tabs').onclick = e => {
    const tab = e.target.closest('[data-panel-tab]')?.dataset.panelTab;
    if (tab) { setPanelTab(tab); introSync(); }
  };
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
    else if (action === 'remove-stop' && draftIndex >= 0) { finishRuler(); const [removed] = state.draft.splice(draftIndex, 1); state.movingDraftIndex = null; renderInspector(); renderDraft(); toast(`${removed.name} removed from draft.`); }
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
    introSync();
  };
  $('heatmap-toggle').onclick = () => { state.populationVisible = !state.populationVisible; renderPopulationControl(); };
  document.querySelector('.mobile-tabs').onclick = e => { const button = e.target.closest('[data-view]'); if (button) setMobileView(button.dataset.view); };
  $('inspector-content').onclick = e => {
    const target = e.target.closest('button'); if (!target) return;
    if (target.hasAttribute('data-clear-selection')) { clearSelection(); return; }
    if (target.dataset.inspectRoute) { selectRoute(target.dataset.inspectRoute); return; }
    if (target.dataset.inspectStop) { inspectStop(target.dataset.inspectStop); return; }
    if (target.dataset.draftRemove != null) { state.draft.splice(Number(target.dataset.draftRemove), 1); state.movingDraftIndex = null; renderInspector(); renderDraft(); return; }
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
  $('zoom-out-button').onclick = () => map.zoomOut({ duration: 250 });
  $('zoom-in-button').onclick = () => map.zoomIn({ duration: 250 });
  $('compass-button').onclick = () => map.easeTo({ bearing: 0, duration: 350 });
  $('tilt-button').onclick = () => map.easeTo({ pitch: map.getPitch() > 10 ? 0 : 45, duration: 350 });
  $('undo-button').onclick = () => { if (!state.history.length) return; const daypart = state.daypart; Object.assign(state, normalizeScenario(parseScenario(state.history.pop()))); state.daypart = daypart; rebuildRouteCache(); persist(); renderList(); renderInspector(); renderMap(); scheduleStats(); toast('Last edit undone.'); };
  $('export-button').onclick = exportScenario;
  $('import-button').onclick = () => $('import-file').click();
  $('import-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > MAX_SCENARIO_BYTES) throw new Error('Scenario exceeds the file size limit (5 MB).');
      const data = parseScenario(await file.text());
      if (data.region && data.region !== region.id) throw new Error(`This scenario is for ${data.region}, not ${region.name.en}.`);
      if (![network.version, ...LEGACY_VERSIONS].includes(data.networkVersion)) throw new Error('This scenario does not match a supported network snapshot.');
      const warnings = [];
      const scenario = normalizeScenario(data, warning => warnings.push(warning));
      remember(); Object.assign(state, scenario); state.selected = null; state.selectedStop = null; state.tool = 'inspect'; changed(); toast(warnings.length ? warnings.join(' ') : data.networkVersion !== network.version ? 'Earlier scenario imported into the metropolitan snapshot.' : 'Scenario imported.');
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
  $('modal-content').onclick = e => { const button = e.target.closest('[data-mobile-action]'); if (button) { const id = button.dataset.mobileAction; closeModal(); if (id === 'settings-button') openSettings(); else if (id === 'fullscreen-button') toggleFullscreen(); else $(id).click(); } };
  $('modal-close').onclick = closeModal; $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
  document.onkeydown = e => {
    if (e.key === 'Escape') {
      if ($('layers-menu').open) { $('layers-menu').open = false; $('layers-menu').querySelector('summary').focus(); return; }
      if (!$('map-context-menu').hidden) { closeContextMenu(); map.getCanvas().focus(); return; }
      if (!$('modal').hidden) { closeModal(); return; }
      if (rulerActive) { finishRuler(); return; }
      if (state.movingDraftIndex !== null) { state.movingDraftIndex = null; renderInspector(); toast('Station move cancelled.'); return; }
      if (state.selected || state.selectedStop) { clearSelection(); return; }
      if (state.tool !== 'inspect') {
        if (state.draft.length && !confirm('Discard this in-progress line?')) return;
        state.tool = 'inspect'; state.draft = []; state.draftRing = false; state.movingDraftIndex = null; state.draftTemplate = null; state.draftMode = 'metro'; state.draftColor = colors.metro;
        map.getCanvas().style.cursor = '';
        renderInspector(); renderDraft();
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
  const routeGeomCache = new Map();
  function getRouteGeometryData(r) {
    const cached = routeGeomCache.get(r.id);
    if (cached && cached.geomRef === r.geometry) return cached;
    const segmentList = [];
    let length = 0;
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    if (Array.isArray(r.geometry)) {
      for (const line of r.geometry) {
        if (!Array.isArray(line)) continue;
        for (let j = 1; j < line.length; j++) {
          const p1 = line[j - 1], p2 = line[j];
          const distance = sim.km(p1, p2);
          if (distance > 0) {
            segmentList.push(p1[0], p1[1], p2[0], p2[1], length, distance);
            length += distance;
            if (p1[0] < minLng) minLng = p1[0];
            if (p1[0] > maxLng) maxLng = p1[0];
            if (p1[1] < minLat) minLat = p1[1];
            if (p1[1] > maxLat) maxLat = p1[1];
            if (p2[0] < minLng) minLng = p2[0];
            if (p2[0] > maxLng) maxLng = p2[0];
            if (p2[1] < minLat) minLat = p2[1];
            if (p2[1] > maxLat) maxLat = p2[1];
          }
        }
      }
    }
    const count = segmentList.length / 6;
    const starts = new Float64Array(count);
    const dists = new Float64Array(count);
    const coords = new Float64Array(count * 4);
    for (let i = 0; i < count; i++) {
      coords[i * 4] = segmentList[i * 6];
      coords[i * 4 + 1] = segmentList[i * 6 + 1];
      coords[i * 4 + 2] = segmentList[i * 6 + 2];
      coords[i * 4 + 3] = segmentList[i * 6 + 3];
      starts[i] = segmentList[i * 6 + 4];
      dists[i] = segmentList[i * 6 + 5];
    }
    const data = {
      geomRef: r.geometry,
      count,
      length,
      starts,
      dists,
      coords,
      bbox: count > 0 ? [minLng, minLat, maxLng, maxLat] : null
    };
    routeGeomCache.set(r.id, data);
    return data;
  }

  function findSegmentIndex(starts, dists, at, count) {
    let low = 0, high = count - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const s = starts[mid];
      const e = s + dists[mid];
      if (at < s) high = mid - 1;
      else if (at >= e) low = mid + 1;
      else return mid;
    }
    return Math.max(0, Math.min(count - 1, low));
  }

  function clearVehicles() {
    vehiclesActive = false;
    lastVehicleCount = 0;
    if (isDebug) window.__DEBUG__.lastVehicleCount = 0;
    setSourceData('vehicles', featureCollection([]));
  }

  const daypartClock = { peak: 450, midday: 720, saturday: 720 };
  function formatClock(minutes) {
    const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function renderDaypart() {
    for (const button of document.querySelectorAll('[data-daypart]')) {
      button.setAttribute('aria-pressed', String(button.dataset.daypart === state.daypart));
    }
  }
  function setDaypart(daypart) {
    if (!Object.hasOwn(daypartClock, daypart) || state.daypart === daypart) return;
    state.daypart = daypart;
    state.baseline = null;
    state.minutes = daypartClock[daypart];
    state.elapsedMinutes = 0;
    $('sim-clock').textContent = formatClock(state.minutes);
    renderDaypart();
    renderInspector();
    if (!state.playing) clearVehicles();
    else renderVehicles();
    persist();
    scheduleStats();
  }
  renderDaypart();
  $('sim-clock').title = 'Click to reset simulation time and clear vehicles';
  $('sim-clock').onclick = () => {
    state.minutes = daypartClock[state.daypart] || 450;
    state.elapsedMinutes = 0;
    $('sim-clock').textContent = formatClock(state.minutes);
    if (!state.playing) clearVehicles();
  };
  document.querySelector('.daypart-switch').onclick = event => {
    const daypart = event.target.closest('[data-daypart]')?.dataset.daypart;
    if (daypart) setDaypart(daypart);
  };

  $('play-button').onclick = () => {
    state.playing = !state.playing;
    $('play-button').textContent = state.playing ? 'Ⅱ Pause' : '▶ Play';
    $('play-button').setAttribute('aria-pressed', String(state.playing));
    if (state.playing) {
      vehiclesActive = true;
      lastFrame = 0;
      renderVehicles();
      animationFrame = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };
  $('speed-button').onclick = () => { state.speed = ({ 1: 4, 4: 12, 12: 1 })[state.speed]; $('speed-button').textContent = `${state.speed}×`; };

  function frame(timestamp) {
    if (!state.playing) return;
    const frameStart = isDebug ? performance.now() : 0;
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(100, timestamp - lastFrame); lastFrame = timestamp;
    const advance = dt / 1000 * state.speed;
    state.minutes = (state.minutes + advance) % 1440;
    state.elapsedMinutes += advance;
    const clock = formatClock(state.minutes);
    if ($('sim-clock').textContent !== clock) $('sim-clock').textContent = clock;
    if (timestamp - lastVehicles > 170) { renderVehicles(); lastVehicles = timestamp; }
    if (isDebug) {
      const dur = performance.now() - frameStart;
      window.__DEBUG__.lastFrameMs = dur;
      if (Math.random() < 0.02) console.log(`[debug] frame: ${dur.toFixed(2)}ms, vehicles: ${lastVehicleCount}`);
    }
    animationFrame = requestAnimationFrame(frame);
  }

  const modeSpeed = { bus: 22, tram: 25, rail: 48, metro: 42 };
  const modePriority = { metro: 0, rail: 1, tram: 2, bus: 3 };

  function renderVehicles() {
    if (!map.getSource('vehicles')) return;
    if (!state.playing && !vehiclesActive) return;

    let minLng = -Infinity, maxLng = Infinity, minLat = -Infinity, maxLat = Infinity;
    try {
      const bounds = map.getBounds();
      if (bounds) {
        const marginX = (bounds.getEast() - bounds.getWest()) * 0.2;
        const marginY = (bounds.getNorth() - bounds.getSouth()) * 0.2;
        minLng = bounds.getWest() - marginX;
        maxLng = bounds.getEast() + marginX;
        minLat = bounds.getSouth() - marginY;
        maxLat = bounds.getNorth() + marginY;
      }
    } catch (_) {}

    const routes = allRoutes().filter(r => state.mapModes[r.mode] && r.active !== false && r.geometry?.length);
    const visibleRoutes = [];
    for (const r of routes) {
      const geom = getRouteGeometryData(r);
      if (!geom.bbox || geom.length <= 0) continue;
      if (geom.bbox[0] > maxLng || geom.bbox[2] < minLng || geom.bbox[1] > maxLat || geom.bbox[3] < minLat) {
        continue;
      }
      visibleRoutes.push({ route: r, geom });
    }

    visibleRoutes.sort((a, b) => {
      const pDiff = (modePriority[a.route.mode] ?? 9) - (modePriority[b.route.mode] ?? 9);
      if (pDiff !== 0) return pDiff;
      const hA = sim.resolveService(a.route, state.daypart).headway;
      const hB = sim.resolveService(b.route, state.daypart).headway;
      return hA - hB;
    });

    const maxVehicles = (typeof innerWidth !== 'undefined' && innerWidth <= 600) ? 200 : 800;
    const features = [];

    for (const { route: r, geom } of visibleRoutes) {
      if (features.length >= maxVehicles) break;
      const service = sim.resolveService(r, state.daypart);
      if (!service.runs) continue;
      const length = geom.length;
      const tripMinutes = Math.max(4, length / (modeSpeed[r.mode] || 22) * 60);
      const headway = service.headway;
      const bothWays = r.source === 'player' && !r.ring;
      const targetCount = Math.min(4, Math.max(bothWays ? 2 : 1, Math.ceil(tripMinutes / headway) * (bothWays ? 2 : 1)));
      const count = Math.min(targetCount, maxVehicles - features.length);
      const routeIdx = routeIndexMap.get(r.id) ?? 0;

      for (let vehicle = 0; vehicle < count; vehicle++) {
        const sideCount = bothWays ? targetCount / 2 : targetCount;
        const reverse = bothWays && vehicle % 2 === 1;
        const sideIndex = bothWays ? Math.floor(vehicle / 2) : vehicle;
        const phase = ((state.elapsedMinutes / tripMinutes + sideIndex / sideCount + (routeIdx * .618 % 1) / sideCount) % 1 + 1) % 1;
        const at = (reverse ? 1 - phase : phase) * length;
        const k = findSegmentIndex(geom.starts, geom.dists, at, geom.count);
        const start = geom.starts[k];
        const dist = geom.dists[k];
        const t = dist > 0 ? Math.max(0, Math.min(1, (at - start) / dist)) : 0;
        const ax = geom.coords[k * 4], ay = geom.coords[k * 4 + 1];
        const bx = geom.coords[k * 4 + 2], by = geom.coords[k * 4 + 3];
        features.push({
          type: 'Feature',
          id: `${r.id}:${vehicle}`,
          properties: { color: routeColor(r), mode: r.mode },
          geometry: { type: 'Point', coordinates: [ax + (bx - ax) * t, ay + (by - ay) * t] }
        });
      }
    }

    lastVehicleCount = features.length;
    if (isDebug) window.__DEBUG__.lastVehicleCount = lastVehicleCount;
    setSourceData('vehicles', featureCollection(features));
  }
  renderTemplates(); renderList(); renderInspector();
  document.addEventListener('pointerdown', e => {
    if (intro.active && intro.index === 0) return;
    if (!$('layers-menu').contains(e.target)) $('layers-menu').open = false;
  });
  const introText = {
    en: {
      kicker: step => `Step ${step} of 5`,
      skip: 'Skip', close: 'Close intro', skipStep: 'Skip this step', showAgain: 'Show the intro again',
      steps: [
        ['Hide the buses', 'Use the bus button in Layers. The tram lines stay on the map.'],
        ['Select tram T6', 'Choose T6 in the line list.'],
        ['Run T6 every 6 minutes', 'Set its service interval to 6 minutes.'],
        ['Draw a metro', 'Place three stations and open the line. Skipping this step is fine.'],
        ['Read the result', 'Open Results and look at the change in passenger trips.']
      ]
    },
    pl: {
      kicker: step => `Krok ${step} z 5`,
      skip: 'Pomiń', close: 'Zamknij wprowadzenie', skipStep: 'Pomiń ten krok', showAgain: 'Pokaż wprowadzenie ponownie',
      steps: [
        ['Ukryj autobusy', 'Użyj przycisku autobusów w Warstwach. Tramwaje zostają na mapie.'],
        ['Wybierz tramwaj T6', 'Wskaż T6 na liście linii.'],
        ['T6 co 6 minut', 'Ustaw odstęp tej linii na 6 minut.'],
        ['Narysuj metro', 'Postaw trzy stacje i otwórz linię. Ten krok można pominąć.'],
        ['Zobacz wynik', 'Otwórz Wyniki i spójrz na zmianę liczby podróży.']
      ]
    }
  };
  const intro = { index: 0, active: false, started: false };
  const introLanguage = () => (navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en';
  function introSettings() { try { return JSON.parse(localStorage.getItem('transit-lab:settings') || '{}'); } catch (_) { return {}; } }
  function writeIntroSettings(patch) {
    try { localStorage.setItem('transit-lab:settings', JSON.stringify({ ...introSettings(), ...patch })); } catch (_) {}
  }
  function introTarget() {
    if (intro.index === 0) return document.querySelector('[data-map-mode="bus"]');
    if (intro.index === 1) {
      const route = allRoutes().find(item => item.name === 'T6');
      return route ? document.querySelector(`[data-route="${CSS.escape(route.id)}"]`) : null;
    }
    if (intro.index === 2) return $('route-headway');
    if (intro.index === 3) return $('metro-tool');
    return document.querySelector('[data-panel-tab="results"]');
  }
  function introDoneAction() {
    if (intro.index === 0) return state.mapModes.bus === false;
    if (intro.index === 1) return routeById(state.selected)?.name === 'T6';
    if (intro.index === 2) { const route = routeById(state.selected); return route?.name === 'T6' && Number(route.headway) === 6; }
    if (intro.index === 3) return state.customRoutes.some(route => route.source === 'player');
    return state.panelTab === 'results';
  }
  function placeIntro(target) {
    const coach = $('intro-coach');
    if (!coach || !target) return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = target.getBoundingClientRect();
    const width = coach.offsetWidth, height = coach.offsetHeight;
    let top = rect.bottom + 10, left = Math.min(Math.max(8, rect.left), innerWidth - width - 8);
    if (top + height > innerHeight - 8) top = Math.max(8, rect.top - height - 10);
    coach.style.top = `${top}px`;
    coach.style.left = `${left}px`;
    const box = coach.getBoundingClientRect();
    const overlaps = !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom);
    if (overlaps) coach.style.top = `${Math.max(8, rect.top - height - 10)}px`;
  }
  function showIntro() {
    const copy = introText[introLanguage()];
    let coach = $('intro-coach');
    if (!coach) {
      coach = document.createElement('div');
      coach.id = 'intro-coach';
      coach.className = 'intro-coach';
      coach.setAttribute('role', 'dialog');
      coach.setAttribute('aria-labelledby', 'intro-title');
      coach.innerHTML = `<p id="intro-kicker"></p><h2 id="intro-title"></h2><p id="intro-body"></p><div class="intro-actions"><button type="button" id="intro-skip-step"></button><button type="button" id="intro-skip"></button><button type="button" id="intro-close"></button></div>`;
      document.body.appendChild(coach);
      $('intro-skip').onclick = finishIntro;
      $('intro-close').onclick = finishIntro;
      $('intro-skip-step').onclick = () => { intro.index = 4; showIntro(); };
    }
    const [title, body] = copy.steps[intro.index];
    $('intro-kicker').textContent = copy.kicker(intro.index + 1);
    $('intro-title').textContent = title;
    $('intro-body').textContent = body;
    $('intro-skip').textContent = copy.skip;
    $('intro-close').textContent = copy.close;
    $('intro-skip-step').textContent = copy.skipStep;
    $('intro-skip-step').hidden = intro.index !== 3;
    document.body.dataset.introStep = String(intro.index);
    if (intro.index === 0) $('layers-menu').open = true;
    if (intro.index === 1 && state.panelTab !== 'network') setPanelTab('network');
    if (intro.index === 2) setPanel('inspector', true);
    document.querySelectorAll('.intro-target').forEach(element => element.classList.remove('intro-target'));
    const target = introTarget();
    if (!target && intro.index === 1) { finishIntro(); toast('Could not find tram T6.'); return; }
    if (target) {
      target.classList.add('intro-target');
      placeIntro(target);
    }
  }
  function finishIntro() {
    intro.active = false;
    writeIntroSettings({ introDone: true });
    delete document.body.dataset.introStep;
    $('intro-coach')?.remove();
    document.querySelectorAll('.intro-target').forEach(element => element.classList.remove('intro-target'));
  }
  function introSync() {
    if (!intro.active) return;
    while (intro.index <= 4 && introDoneAction()) intro.index += 1;
    if (intro.index > 4) { finishIntro(); return; }
    showIntro();
  }
  function maybeStartIntro() {
    if (intro.started || intro.active || introSettings().introDone) return;
    if (!Number.isFinite(state.stats?.passengers)) return;
    intro.started = true;
    intro.active = true;
    intro.index = 0;
    showIntro();
  }
  window.addEventListener('resize', () => { if (intro.active) placeIntro(introTarget()); });
  scheduleStats();
})();

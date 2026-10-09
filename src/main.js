import { loadRegion, reportRegionError, paintRegion } from './region.js?v=2026-09-28-engine';
import { t, localize, applyDom, setLocale, onLocale, fmtNumber, fmtDecimal, plural } from './i18n/index.js?v=2026-10-09-budget';
import { createModel, modelVersion, walkMinutes } from './sim/model.js?v=2026-10-09-challenges';
import { choiceParams, crowdMultiplier } from './sim/params.js?v=2026-09-28-flows';
import { summarizeBudget, capitalCosts } from './sim/budget.js?v=2026-10-09-budget';
import { minify, expand, bytesToBase64Url, base64UrlToBytes, compressJson, decompressJson, shareUrl } from './share.js?v=2026-09-28-share2';
import { createSlot, activateSlot, duplicateSlot, renameSlot, deleteSlot, slotLimit } from './slots.js?v=2026-09-28-share2';
import { normalize, safeUrl as scenarioSafeUrl, safeColor } from './scenario.js?v=2026-09-28-builder';
import { colors, modes, cruiseSpeed, capacity } from './modes.js?v=2026-09-28-builder';
import { groupLines } from './lines.js?v=2026-09-28-share2';
import { renderRouteList } from './ui/list.js?v=2026-09-28-share2';
import { renderDraftInspector } from './ui/draft.js?v=2026-09-28-builder';
import { renderStopInspector } from './ui/inspector-stop.js?v=2026-09-28-flows';
import { renderLineInspector } from './ui/inspector-line.js?v=2026-10-09-budget';
import { renderResults } from './ui/results.js?v=2026-10-09-budget';
import { createModal } from './ui/modal.js?v=2026-09-28-share2';
import {
  loadChallengeBook, saveChallengeBook, evaluateChallenge, challengeAllowsMode, countPlayerLines,
  challengeAllowsNewLines, challengeAllowsPublishedEdit, odMinutesForChallenge,
} from './challenges.js?v=2026-10-09-challenges';
import {
  flowBandCollection, flowStopCollection, paintFlowCells, paintTravelCells,
  vcColorExpression, modeColorExpression, flowWidthExpression, flowBandOpacityExpression,
} from './layers.js?v=2026-10-09-layers';

window.TransitScenario = { normalize, safeUrl: scenarioSafeUrl, safeColor };
applyDom();
document.querySelectorAll('[data-locale]').forEach(button => {
  button.addEventListener('click', () => setLocale(button.dataset.locale));
});

async function startApp() {
  let loaded;
  try { loaded = await loadRegion(); }
  catch (error) { reportRegionError(error); return; }
  if (!loaded) return;
  'use strict';
  const region = window.TRANSIT_REGION;
  const network = window.TRANSIT_NETWORK;
  const population = window.TRANSIT_POPULATION;
  const templates = window.TRANSIT_TEMPLATES?.templates || [];
  const challengeCatalog = window.TRANSIT_CHALLENGES?.challenges || [];
  let challengeBook = loadChallengeBook(region.id);
  const sim = createModel(network, population, { tripRate: region.demand?.tripRate, choice: region.demand?.choice });
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
  const format = n => fmtNumber(n);
  function modeLabel(mode) {
    const key = `mode.${mode || 'line'}`;
    const value = t(key);
    return value === key ? String(mode || 'line') : value;
  }
  const compactMillions = n => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}m` : format(n);
  const empty = () => ({ overrides: {}, customRoutes: [], customStops: [] });
  const state = { ...empty(), daypart: 'peak', selected: null, selectedStop: null, lineIntervalOnly: false, filter: 'all', search: '', showAll: false, tool: 'inspect', draft: [], draftWaypoints: [], draftRing: false, draftMove: false, movingDraftIndex: null, editingRouteId: null, draftName: 'M1', draftMode: 'metro', draftVehicle: 'metro6', draftAlignment: 'tunnel', draftTemplate: null, draftColor: '#8068e8', draftHeadway: 6, playing: false, speed: 1, minutes: 420, elapsedMinutes: 0, stats: null, baseline: null, budgetMode: false, budgetSummary: null, history: [], sharePreview: null, compareSlotId: null, compareName: '', challenge: null, challengeOdMinutes: null, mobileView: 'map', populationVisible: maskCells.length > 0, activeLayer: 'population', flowsVisible: false, flowsCrowding: false, layerCompare: false, travelOrigin: null, travel: null, mapModes: { bus: true, tram: true, rail: true, metro: true }, networkOpen: true, inspectorOpen: false, panelTab: 'network' };
  let map, toastTimer, lastFrame = 0, lastVehicles = 0, animationFrame = 0, recomputeTimer, hoverBound = false, insightHoverBound = false, insightPopup = null, modalReturnFocus = null, modalInertState = [], contextLocation = null, accessCache = null, rulerPoints = [], rulerHover = null, rulerActive = false, middleDragIndex = null, middleDragOriginal = null, themeChangeToken = 0, flowsStatsKey = null, insightGridKey = null, insightGridFrame = 0, travelRevision = 0;
  const zoneIndexById = new Map((population?.zones || []).map((zone, index) => [zone.id, index]));
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
    $('loading').innerHTML = `<strong>${escape(t('loading.game'))}</strong><small>${escape(t('loading.gameDetail'))}</small>`;
    return;
  }

  const byId = new Map(network.stops.map(s => [s.id, s]));
  const focusBounds = population?.bbox || network.bbox || [18.88, 50.12, 19.33, 50.36];
  const fitFocus = () => map.fitBounds([[focusBounds[0], focusBounds[1]], [focusBounds[2], focusBounds[3]]], { padding: fitPadding(), maxZoom: 11.5, duration: 650 });
  function stop(id) { return byId.get(id) || state.customStops.find(s => s.id === id); }

  let routeCacheList = [];
  let routeCacheMap = new Map();
  let routeIndexMap = new Map();
  let lineCache = [];
  let lineByPatternId = new Map();
  function rebuildRouteCache() {
    routeCacheList = network.routes.concat(state.customRoutes).map(r => ({ ...r, ...(state.overrides[r.id] || {}) }));
    routeCacheMap = new Map(routeCacheList.map(r => [r.id, r]));
    routeIndexMap = new Map(routeCacheList.map((r, i) => [r.id, i]));
    lineCache = groupLines(routeCacheList, id => stop(id));
    lineByPatternId = new Map();
    for (const line of lineCache) for (const pattern of line.patterns) lineByPatternId.set(pattern.id, line);
  }
  rebuildRouteCache();
  function allRoutes() { return routeCacheList; }
  function routeById(id) { return routeCacheMap.get(id); }
  function lines() { return lineCache; }
  function lineFor(id) { return lineByPatternId.get(id) || null; }

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
  function nextDraftName(mode) {
    const prefix = ({ metro: 'M', tram: 'T', rail: 'R', bus: 'B' })[mode] || 'L';
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
  const slotsKey = `transit-lab:${region.id}:slots`;
  function readBook() {
    try {
      const parsed = JSON.parse(localStorage.getItem(slotsKey) || '');
      if (parsed && Array.isArray(parsed.slots)) return parsed;
    } catch (_) {}
    return { active: null, slots: [] };
  }
  function writeBook(book) {
    try { localStorage.setItem(slotsKey, JSON.stringify(book)); return true; }
    catch (_) { toast(t('toast.quota')); return false; }
  }
  function currentScenario() { return { ...JSON.parse(snapshot()), daypart: state.daypart, region: region.id, networkVersion: network.version, challenge: state.challenge || null }; }
  function summaryFrom(stats) {
    if (!stats) return null;
    const stored = { ...stats };
    delete stored.flows;
    return { passengers: stored.passengers, cost: stored.cost, modelVersion, networkVersion: network.version, stats: stored };
  }
  function persist() {
    if (state.sharePreview) return;
    try {
      const body = currentScenario();
      localStorage.setItem(STORAGE, JSON.stringify(body));
      const book = readBook();
      let slot = book.slots.find(item => item.id === book.active);
      if (!slot) slot = createSlot(book, body, summaryFrom(state.stats), t('slots.autosave'));
      else { slot.scenario = body; slot.updated = Date.now(); slot.networkVersion = network.version; }
      writeBook(book);
    } catch (_) { toast(t('toast.storage')); }
  }
  const { safeUrl } = window.TransitScenario;
  const MAX_SCENARIO_BYTES = 5 * 1024 * 1024;
  const normalizeScenario = (data, onWarning = toast) => window.TransitScenario.normalize(data, onWarning);
  function parseScenario(serialized) {
    if (new Blob([serialized]).size > MAX_SCENARIO_BYTES) throw new Error(t('scenario.size'));
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
    } catch (err) { toast(err.message || t('toast.saved')); }
  }
  loadSaved();
  const ownScenario = currentScenario();
  await openSharedLink();
  ensureSlot(ownScenario);
  rebuildRouteCache();
  let showFullscreenButton = true;
  try { showFullscreenButton = JSON.parse(localStorage.getItem(DISPLAY_STORAGE) || '{}').showFullscreenButton !== false; } catch (_) {}
  function renderFullscreen() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('fullscreen-button').hidden = !showFullscreenButton && !active;
    $('fullscreen-button').innerHTML = `<span aria-hidden="true">⛶</span><span class="fullscreen-text">${active ? t('top.exitFullscreen') : t('top.fullscreen')}</span>`;
    $('fullscreen-button').setAttribute('aria-label', active ? t('top.exitFullscreen') : t('top.enterFullscreen'));
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
    } catch (_) { toast(t('toast.fullscreen')); }
  }
  function openSettings() {
    const fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    modal(`<span class="chip">${escape(t('settings.chip'))}</span><h2>${escape(t('settings.title'))}</h2><div class="form-stack"><div class="locale-switch" role="group">${escape(t('settings.language'))} <button type="button" data-settings-locale="pl">PL</button> <button type="button" data-settings-locale="en">EN</button></div><button id="settings-fullscreen" type="button">${escape(fullscreen ? t('settings.exit') : t('settings.enter'))}</button><label class="toggle-row"><input id="settings-fullscreen-visible" type="checkbox" ${showFullscreenButton ? 'checked' : ''}> ${escape(t('settings.showButton'))}</label><button id="settings-intro" type="button">${escape(t('intro.showAgain'))}</button><p class="fine-print">${escape(t('settings.note'))}</p></div>`);
    $('settings-fullscreen').onclick = async () => { closeModal(); await toggleFullscreen(); };
    $('settings-intro').onclick = () => { writeIntroSettings({ introDone: false }); intro.index = 0; intro.active = false; intro.started = false; closeModal(); maybeStartIntro(); };
    $('modal-content').querySelectorAll('[data-settings-locale]').forEach(button => { button.onclick = () => { setLocale(button.dataset.settingsLocale); closeModal(); }; });
    $('settings-fullscreen-visible').onchange = e => {
      showFullscreenButton = e.target.checked;
      writeIntroSettings({ showFullscreenButton });
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
    rail.setAttribute('aria-label', open ? t('top.hidePanel') : t('top.showPanel'));
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
    toggle.setAttribute('aria-label', state.populationVisible ? t('bottom.hideLayer') : t('bottom.showLayer'));
    toggle.lastChild.textContent = ` ${state.populationVisible ? t('bottom.on') : t('bottom.off')}`;
    $('heatmap-legend').hidden = !state.populationVisible;
    $('planning-layer').value = state.activeLayer;
    $('heatmap-legend').dataset.layer = state.activeLayer;
    $('heatmap-legend').dataset.compare = state.layerCompare && (state.activeLayer === 'travel' || state.activeLayer === 'winners') ? '1' : '0';
    const note = $('layer-legend-note');
    const compareRow = $('layer-compare-row');
    const crowdRow = $('flows-crowd-row');
    if ($('flows-toggle')) $('flows-toggle').checked = state.flowsVisible;
    if ($('flows-crowd-toggle')) $('flows-crowd-toggle').checked = state.flowsCrowding;
    if ($('layer-compare-toggle')) $('layer-compare-toggle').checked = state.layerCompare;
    if (crowdRow) crowdRow.hidden = !state.flowsVisible;
    if (compareRow) compareRow.hidden = !(state.activeLayer === 'travel' || state.activeLayer === 'winners');
    let caption = t('bottom.densityCaption', { year: population?.source?.year || '2021', source: population?.source?.shortName || t('bottom.densitySource') });
    let title = t('bottom.densityLegend');
    let min = '0';
    let max = `${fmtNumber(8000)}+`;
    let noteText = '';
    if (state.activeLayer === 'access') {
      caption = t('bottom.accessCaption');
      title = t('bottom.accessLegend');
      max = t('bottom.accessMax');
    } else if (state.activeLayer === 'winners') {
      if (state.layerCompare) {
        caption = t('bottom.winnersCaption');
        title = t('bottom.winnersLegend');
        min = t('bottom.winnersMin');
        max = t('bottom.winnersMax');
      } else {
        caption = t('bottom.winnersScenarioCaption');
        title = t('bottom.winnersScenarioLegend');
        min = t('bottom.winnersScenarioMin');
        max = t('bottom.winnersScenarioMax');
      }
    } else if (state.activeLayer === 'travel') {
      const name = state.travelOrigin?.name || t('context.fallback');
      caption = state.travelOrigin ? t('bottom.travelCaption', { name }) : t('bottom.travelNeedOrigin');
      title = state.layerCompare ? t('bottom.travelCompareLegend') : t('bottom.travelLegend');
      if (state.layerCompare) { min = t('bottom.travelSavedMin'); max = t('bottom.travelSavedMax'); }
      else { min = '0'; max = t('bottom.travelMax'); }
      if (state.travel) noteText = t('bottom.travelReach', { n30: format(state.travel.residents30), n45: format(state.travel.residents45) });
    }
    if (state.flowsVisible) caption = t('bottom.flowsCaption');
    $('heatmap-caption').textContent = caption;
    $('layer-legend-title').textContent = title;
    $('layer-legend-min').textContent = min;
    $('layer-legend-max').textContent = max;
    if (note) {
      if (!noteText) {
        note.hidden = true;
        note.textContent = '';
        note.style.opacity = '';
      } else if (note.hidden || !note.textContent) {
        note.hidden = false;
        note.textContent = noteText;
        note.style.opacity = '1';
      } else if (note.textContent !== noteText) {
        note.hidden = false;
        note.style.opacity = '0.35';
        requestAnimationFrame(() => {
          if (note.textContent !== noteText) note.textContent = noteText;
          note.style.opacity = '1';
        });
      }
    }
    const fillLayers = [
      ['city-population-fill', 'shared'],
      ['population-grid-fill', 'population'],
      ['city-population-outline', 'shared'],
      ['access-grid-fill', 'access'],
      ['insight-grid-fill', 'insight'],
    ];
    for (const [id, layer] of fillLayers) {
      if (!map?.getLayer(id)) continue;
      const insight = state.activeLayer === 'winners' || state.activeLayer === 'travel';
      const show = state.populationVisible && (
        layer === 'shared'
        || (layer === 'insight' && insight)
        || (layer !== 'insight' && state.activeLayer === layer)
      );
      map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
    }
    applyFlowLayerVisibility();
    applyInsightPaint();
  }
  const { modal, closeModal, confirmDialog } = createModal($);

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
        loading.innerHTML = `<strong>${escape(t('loading.tiles'))}</strong><small>${escape(t('loading.tilesDetail'))}</small>`;
      } else {
        loading.innerHTML = `<strong>${escape(t('loading.map'))}</strong><small>${escape(t('loading.mapDetail'))}</small>`;
      }
    } else if (isOpenFreeMap && /tiles\.openfreemap\.org/i.test(msg + url)) {
      toast(t('toast.tiles'));
    }
  });
  const restoreGameLayers = () => {
    if (!map.getStyle()?.layers || map.getSource('city-population') || map.getLayer('routes')) return;
    hoverBound = false;
    insightHoverBound = false;
    flowsStatsKey = null;
    insightGridKey = null;
    if (themeMedia.matches) stylizeDarkBasemap(); else stylizeBasemap();
    addLayers(); renderMap();
    rebuildFlowLayers();
    if (state.activeLayer === 'winners' || state.activeLayer === 'travel') rebuildInsightGrid();
    renderPopulationControl();
  };
  map.on('style.load', restoreGameLayers);
  map.on('styledata', restoreGameLayers);
  map.on('load', () => {
    $('loading').remove();
    map.on('click', onMapClick);
    $('map').addEventListener('contextmenu', event => event.preventDefault());
    $('map').addEventListener('mousedown', onMiddleDraftMouseDown, true);
    $('map').addEventListener('pointerdown', onDraftPointerDown, true);
    $('map').addEventListener('pointerup', cancelDraftPress, true);
    $('map').addEventListener('pointercancel', cancelDraftPress, true);
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
  const zoneByCellId = new Map();
  for (const zone of population?.zones || []) {
    for (const cell of zone.cells || []) {
      const source = population.cells?.[cell.index];
      if (source?.id) zoneByCellId.set(source.id, zone);
    }
  }
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
      const minutes = Number.isFinite(distance) ? walkMinutes(distance) : 999;
      return { ...feature, properties: { ...feature.properties, accessMin: +minutes.toFixed(1) } };
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
      'fill-color': ['interpolate', ['linear'], ['get', 'accessMin'], 0, accessColors[0], 5, accessColors[1], 10, accessColors[2], 15, accessColors[3], 20, accessColors[4]],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .52, 11, .56, 13, .72, 18, .64],
      'fill-antialias': true,
    } }, beneathRoads);
    map.addSource('insight-grid', { type: 'geojson', data: featureCollection([]) });
    map.addLayer({ id: 'insight-grid-fill', type: 'fill', source: 'insight-grid', layout: { visibility: 'none' }, paint: {
      'fill-color': '#4f9a7a',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, .48, 11, .55, 13, .68, 18, .6],
      'fill-antialias': true,
    } }, beneathRoads);
    map.addLayer({ id: 'city-population-outline', type: 'line', source: 'city-population', layout: { visibility: visible }, paint: {
      'line-color': themeMedia.matches ? '#8ab7bd' : '#5b8990',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, .8, 15, 1.8],
      'line-opacity': .77,
    } }, beneathRoads);
    map.addSource('flow-bands', { type: 'geojson', data: featureCollection([]) });
    map.addSource('flow-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('network-routes', { type: 'geojson', data: featureCollection([]) });
    map.addSource('selected-route', { type: 'geojson', data: featureCollection([]) });
    map.addSource('network-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('selected-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('inspected-stop', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft-stops', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft-rings', { type: 'geojson', data: featureCollection([]) });
    map.addSource('metro-draft-waypoints', { type: 'geojson', data: featureCollection([]) });
    map.addSource('ruler-line', { type: 'geojson', data: featureCollection([]) });
    map.addSource('ruler-points', { type: 'geojson', data: featureCollection([]) });
    map.addSource('vehicles', { type: 'geojson', data: featureCollection([]) });
    map.addLayer({ id: 'route-halo', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['==', ['get', 'mode'], 'metro'], 4, ['==', ['get', 'mode'], 'rail'], 3, ['==', ['get', 'mode'], 'tram'], 2, 1] }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5, 17, 9], 'line-opacity': ['case', ['==', ['get', 'active'], false], 0, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.08, 11, 0.15, 14, 0.5, 17, 0.65], ['interpolate', ['linear'], ['zoom'], 9, 0.35, 11, 0.45, 14, 0.65, 17, 0.75]] } }, before);
    map.addLayer({ id: 'routes', type: 'line', source: 'network-routes', layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['==', ['get', 'mode'], 'metro'], 4, ['==', ['get', 'mode'], 'rail'], 3, ['==', ['get', 'mode'], 'tram'], 2, 1] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 1.0, 11, 1.15, 13, 2.0, 17, 4.0], ['interpolate', ['linear'], ['zoom'], 9, 1.8, 11, 1.8, 13, 2.5, 17, 4.5]], 'line-opacity': ['case', ['==', ['get', 'active'], false], 0.08, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.25, 11, 0.25, 13, 0.45, 17, 0.70], ['interpolate', ['linear'], ['zoom'], 9, 0.85, 11, 0.85, 13, 0.88, 17, 0.92]] } }, before);
    map.addLayer({ id: 'flow-band-halo', type: 'line', source: 'flow-bands', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'sort'] }, paint: { 'line-color': '#ffffff', 'line-width': flowWidthExpression(), 'line-opacity': flowBandOpacityExpression(0.55), 'line-gap-width': 0 } }, before);
    map.addLayer({ id: 'flow-bands', type: 'line', source: 'flow-bands', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'sort'] }, paint: { 'line-color': modeColorExpression(), 'line-width': flowWidthExpression(), 'line-opacity': flowBandOpacityExpression(0.88) } }, before);
    map.addLayer({ id: 'flow-stops', type: 'circle', source: 'flow-stops', layout: { visibility: 'none' }, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['min', 8, ['+', 2, ['*', 0.04, ['sqrt', ['get', 'boardings']]]]], 15, ['min', 18, ['+', 3, ['*', 0.08, ['sqrt', ['get', 'boardings']]]]]],
      'circle-color': themeMedia.matches ? '#e4f5f7' : '#163b48',
      'circle-opacity': 0.82,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.2,
    } }, before);
    map.addLayer({ id: 'selected-halo', type: 'line', source: 'selected-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': themeMedia.matches ? '#ffffff' : '#10212b', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 12], 'line-opacity': themeMedia.matches ? 0.98 : 0.6 } }, before);
    map.addLayer({ id: 'selected-line', type: 'line', source: 'selected-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 8], 'line-opacity': .95 } }, before);
    map.addLayer({ id: 'all-stops', type: 'circle', source: 'network-stops', minzoom: 13.1, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.2, 17, 5], 'circle-color': '#fff', 'circle-stroke-color': '#71879b', 'circle-stroke-width': 1.2, 'circle-opacity': .86 } });
    map.addLayer({ id: 'selected-stop-halo', type: 'circle', source: 'selected-stops', paint: { 'circle-radius': 9, 'circle-color': '#fff', 'circle-opacity': .9 } });
    map.addLayer({ id: 'selected-stop', type: 'circle', source: 'selected-stops', paint: { 'circle-radius': 5.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    map.addLayer({ id: 'selected-stop-label', type: 'symbol', source: 'selected-stops', minzoom: 12, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': themeMedia.matches ? '#e4f5f7' : '#233746', 'text-halo-color': themeMedia.matches ? '#13232c' : '#fff', 'text-halo-width': 2 } });
    map.addLayer({ id: 'inspected-stop-halo', type: 'circle', source: 'inspected-stop', paint: { 'circle-radius': 13, 'circle-color': '#fff', 'circle-opacity': .95 } });
    map.addLayer({ id: 'inspected-stop-dot', type: 'circle', source: 'inspected-stop', paint: { 'circle-radius': 8, 'circle-color': '#163b48', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'draft-rings', type: 'fill', source: 'metro-draft-rings', paint: { 'fill-color': state.draftColor, 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'metro-draft', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': state.draftColor, 'line-width': 5, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draft-stops', type: 'circle', source: 'metro-draft-stops', paint: { 'circle-radius': 8, 'circle-color': state.draftColor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    map.addLayer({ id: 'draft-waypoints', type: 'circle', source: 'metro-draft-waypoints', paint: { 'circle-radius': 4, 'circle-color': state.draftColor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
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
    bindInsightHover();
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
      const modeKey = label.charAt(0).toUpperCase() + label.slice(1);
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', t(visible ? `bottom.hide${modeKey}` : `bottom.show${modeKey}`));
      button.title = t(visible ? `bottom.hide${modeKey}Title` : `bottom.show${modeKey}Title`);
    });
    if (state.playing || vehiclesActive) renderVehicles();
    applyFlowLayerVisibility();
  }
  const routeOpacityPaint = ['case', ['==', ['get', 'active'], false], 0.08, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.25, 11, 0.25, 13, 0.45, 17, 0.70], ['interpolate', ['linear'], ['zoom'], 9, 0.85, 11, 0.85, 13, 0.88, 17, 0.92]];
  const routeHaloOpacityPaint = ['case', ['==', ['get', 'active'], false], 0, ['==', ['get', 'mode'], 'bus'], ['interpolate', ['linear'], ['zoom'], 9, 0.08, 11, 0.15, 14, 0.5, 17, 0.65], ['interpolate', ['linear'], ['zoom'], 9, 0.35, 11, 0.45, 14, 0.65, 17, 0.75]];
  function applyFlowLayerVisibility() {
    const show = state.flowsVisible && !!state.stats?.flows;
    for (const id of ['flow-bands', 'flow-band-halo', 'flow-stops']) {
      if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
    }
    if (map?.getLayer('flow-bands')) {
      map.setPaintProperty('flow-bands', 'line-color', state.flowsCrowding ? vcColorExpression(themeMedia.matches) : modeColorExpression());
      map.setPaintProperty('flow-bands', 'line-opacity', flowBandOpacityExpression(0.88));
      map.setPaintProperty('flow-band-halo', 'line-opacity', flowBandOpacityExpression(0.55));
    }
    if (map?.getLayer('routes')) {
      map.setPaintProperty('routes', 'line-opacity', show ? 0.18 : routeOpacityPaint);
      map.setPaintProperty('route-halo', 'line-opacity', show ? 0.08 : routeHaloOpacityPaint);
    }
  }
  function applyInsightPaint() {
    if (!map?.getLayer('insight-grid-fill')) return;
    const dark = themeMedia.matches;
    if (state.activeLayer === 'winners' && state.layerCompare) {
      map.setPaintProperty('insight-grid-fill', 'fill-color', [
        'interpolate', ['linear'], ['get', 'accessDelta'],
        -40, dark ? '#a95266' : '#b44a5a',
        0, dark ? '#d6c4ad' : '#e8d5c0',
        40, dark ? '#4c9183' : '#4f9a7a',
      ]);
    } else if (state.activeLayer === 'winners') {
      map.setPaintProperty('insight-grid-fill', 'fill-color', [
        'interpolate', ['linear'], ['get', 'access45'],
        0, dark ? '#2a343a' : '#d7dde2',
        25, dark ? '#4c9183' : '#5ea08a',
        55, dark ? '#d6b476' : '#d6c36a',
        85, dark ? '#ca816b' : '#d98a5a',
      ]);
    } else if (state.activeLayer === 'travel' && state.layerCompare) {
      map.setPaintProperty('insight-grid-fill', 'fill-color', [
        'interpolate', ['linear'], ['get', 'minutesSaved'],
        -20, dark ? '#a95266' : '#b44a5a',
        0, dark ? '#d6c4ad' : '#e8d5c0',
        20, dark ? '#4c9183' : '#4f9a7a',
      ]);
    } else if (state.activeLayer === 'travel') {
      map.setPaintProperty('insight-grid-fill', 'fill-color', [
        'match', ['get', 'travelBand'],
        10, dark ? '#245c59' : '#2f6f6a',
        20, dark ? '#4c9183' : '#5ea08a',
        30, dark ? '#d6b476' : '#d6c36a',
        40, dark ? '#ca816b' : '#d98a5a',
        50, dark ? '#a95266' : '#b44a5a',
        60, dark ? '#855057' : '#7a3d55',
        dark ? '#2a343a' : '#d7dde2',
      ]);
    }
  }
  function rebuildFlowLayers() {
    if (!map?.getSource('flow-bands')) return;
    const flows = state.stats?.flows;
    const key = flows ? `${flows.boardingsTotal}|${flows.passengerKm}|${flows.refined}|${flows.segmentDaily?.length}` : 'none';
    if (key === flowsStatsKey) {
      applyFlowLayerVisibility();
      return;
    }
    flowsStatsKey = key;
    if (!flows) {
      setSourceData('flow-bands', featureCollection([]));
      setSourceData('flow-stops', featureCollection([]));
      applyFlowLayerVisibility();
      return;
    }
    const lookup = id => stop(id);
    requestAnimationFrame(() => {
      if (state.stats?.flows !== flows) return;
      setSourceData('flow-bands', flowBandCollection(flows, lookup));
      setSourceData('flow-stops', flowStopCollection(flows, lookup));
      applyFlowLayerVisibility();
    });
  }
  function insightGridCacheKey() {
    if (state.activeLayer === 'winners') {
      const access = state.stats?.access45;
      const base = state.baseline?.access45;
      return `w:${state.layerCompare}:${access?.length}:${base?.length}:${statsRevision}`;
    }
    if (state.activeLayer === 'travel' && state.travel && state.travelOrigin?.pos) {
      const [lng, lat] = state.travelOrigin.pos;
      return `t:${state.layerCompare}:${state.daypart}:${lng.toFixed(5)}:${lat.toFixed(5)}:${state.travel.residents45}:${statsRevision}`;
    }
    return 'off';
  }
  function flushInsightGrid() {
    if (!map?.getSource('insight-grid')) return;
    const key = insightGridCacheKey();
    if (key === insightGridKey && key !== 'off') {
      applyInsightPaint();
      return;
    }
    insightGridKey = key;
    if (state.activeLayer === 'winners') {
      const access = state.stats?.access45 || state.stats?.zoneStats?.map(z => z.access45) || [];
      const base = state.baseline?.access45 || state.baseline?.zoneStats?.map(z => z.access45) || access;
      setSourceData('insight-grid', paintFlowCells(maskFeatures, zoneByCellId, zoneIndexById, access, base));
    } else if (state.activeLayer === 'travel' && state.travel) {
      setSourceData('insight-grid', paintTravelCells(
        maskFeatures, zoneByCellId, zoneIndexById,
        state.travel.zoneClock, state.travel.baselineClock, state.layerCompare,
      ));
    } else {
      setSourceData('insight-grid', featureCollection([]));
    }
    applyInsightPaint();
  }
  function rebuildInsightGrid() {
    cancelAnimationFrame(insightGridFrame);
    insightGridFrame = requestAnimationFrame(flushInsightGrid);
  }
  function applyTravelResult(scenario, baseline, revision) {
    if (revision !== travelRevision) return;
    state.travel = {
      zoneClock: scenario.zoneClock,
      baselineClock: baseline.zoneClock,
      zoneGc: scenario.zoneGc,
      residents30: scenario.residents30,
      residents45: scenario.residents45,
      searchMs: scenario.searchMs,
      buildMs: scenario.buildMs,
    };
    insightGridKey = null;
    rebuildInsightGrid();
    renderPopulationControl();
    $('layers-menu').open = true;
  }
  function requestTravelFrom(pos, name) {
    state.travelOrigin = { pos: pos.slice(), name: name || t('context.fallback') };
    state.activeLayer = 'travel';
    state.populationVisible = true;
    insightGridKey = null;
    renderPopulationControl();
    const revision = ++travelRevision;
    const runMain = () => {
      const scenario = sim.travelFrom(pos, network, state.customRoutes, state.customStops, state.overrides, state.daypart);
      const baseline = sim.travelFrom(pos, network, [], [], {}, state.daypart);
      applyTravelResult(scenario, baseline, revision);
    };
    const postTravelWorker = () => {
      statsPool[0].postMessage({
        job: 'travelTime',
        revision,
        compareBaseline: true,
        pos: pos.slice(),
        customRoutes: state.customRoutes,
        customStops: state.customStops,
        overrides: state.overrides,
        daypart: state.daypart,
        networkUrl: window.TRANSIT_URLS.network,
        populationUrl: window.TRANSIT_URLS.population,
        tripRate: region.demand?.tripRate,
      });
    };
    if (!workerUnavailable && !statsBusy) {
      try {
        if (!statsPool?.length) ensurePool();
        if (statsPool?.length) {
          postTravelWorker();
          return;
        }
      } catch (_) {
        workerUnavailable = true;
      }
    }
    // Fallback when workers are busy with stats slices or unavailable.
    setTimeout(runMain, 0);
  }
  function bindInsightHover() {
    if (insightHoverBound || !map.getLayer('insight-grid-fill')) return;
    insightHoverBound = true;
    insightPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'insight-popup', maxWidth: '240px' });
    const hide = () => { map.getCanvas().style.cursor = state.tool === 'inspect' ? '' : 'crosshair'; insightPopup.remove(); };
    map.on('mouseenter', 'insight-grid-fill', event => {
      if (!state.populationVisible) return;
      const props = event.features?.[0]?.properties;
      if (!props) return;
      map.getCanvas().style.cursor = 'help';
      let body = '';
      if (state.activeLayer === 'winners') {
        if (state.layerCompare) {
          const delta = Number(props.accessDelta) || 0;
          body = `${delta > 0 ? '+' : ''}${fmtDecimal(delta, 1)} ${t('bottom.winnersDeltaUnit')}`;
        } else {
          body = `${fmtDecimal(Number(props.access45) || 0, 1)} ${t('bottom.winnersScenarioUnit')}`;
        }
      } else if (state.activeLayer === 'travel' && state.travel) {
        if (state.layerCompare) {
          const saved = Number(props.minutesSaved) || 0;
          body = saved > 0 ? t('bottom.travelTipSaved', { min: fmtDecimal(saved, 1) }) : t('bottom.travelTipSame', { min: fmtDecimal(Number(props.travelMin) || 0, 0) });
        } else {
          body = t('bottom.travelTipMinutes', { min: fmtDecimal(Number(props.travelMin) || 0, 0) });
        }
      }
      if (!body) return;
      insightPopup.setLngLat(event.lngLat).setHTML(`<strong>${escape(body)}</strong>`).addTo(map);
    });
    map.on('mousemove', 'insight-grid-fill', event => { if (insightPopup.isOpen()) insightPopup.setLngLat(event.lngLat); });
    map.on('mouseleave', 'insight-grid-fill', hide);
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
    const highlighted = selected ? (lineFor(selected.id)?.patterns || [selected]) : [];
    setSourceData('selected-route', featureCollection(highlighted.map(routeFeature)));
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
    ensureWaypoints();
    const coords = draftCoordinates();
    setSourceData('metro-draft', featureCollection(coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : []));
    setSourceData('metro-draft-stops', featureCollection(state.draft.map((s, i) => pointFeature({ ...s, id: String(i) }))));
    const waypoints = (state.draftWaypoints || []).flat().map((pos, index) => pointFeature({ id: `w${index}`, name: '', pos }));
    setSourceData('metro-draft-waypoints', featureCollection(waypoints));
    const radius = state.draftMode === 'rail' || state.draftMode === 'metro' ? 1.2 : 0.8;
    setSourceData('metro-draft-rings', featureCollection(state.tool === 'metro' ? state.draft.map(station => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(station.pos, radius)] } })) : []));
    map.setPaintProperty('draft-line', 'line-color', state.draftColor);
    map.setPaintProperty('draft-stops', 'circle-color', state.draftColor);
    map.setPaintProperty('draft-waypoints', 'circle-color', state.draftColor);
    map.setPaintProperty('draft-rings', 'fill-color', state.draftColor);
  }

  function onMapClick(event) {
    if (!$('map-context-menu').hidden) { closeContextMenu(); return; }
    if (rulerActive) { addRulerPoint([event.lngLat.lng, event.lngLat.lat]); return; }
    if (state.tool === 'metro') {
      if (draftPressConsumed) { draftPressConsumed = false; return; }
      if (state.movingDraftIndex !== null) {
        const index = state.movingDraftIndex;
        state.movingDraftIndex = null;
        repositionDraftStation(index, [event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      const pos = [event.lngLat.lng, event.lngLat.lat];
      if (draftIndexAt(event.point, 14) >= 0) return;
      const segment = segmentAt(event.point);
      if (segment >= 0 && event.originalEvent?.shiftKey) return addWaypoint(segment, pos);
      if (segment >= 0) return insertDraftStation(segment, pos);
      return addDraftStation(pos);
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
  const SNAP_KM = 0.15;
  let draftPressTimer = null;
  let draftPressConsumed = false;
  function circleRing(pos, kmRadius) {
    const coords = [];
    for (let i = 0; i <= 48; i++) {
      const bearing = i / 48 * Math.PI * 2;
      const lat = pos[1] + (kmRadius / 111.2) * Math.cos(bearing);
      const lon = pos[0] + (kmRadius / (111.2 * Math.cos(pos[1] * Math.PI / 180))) * Math.sin(bearing);
      coords.push([lon, lat]);
    }
    return coords;
  }
  function projectSegment(pos, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    if (!len) return a.slice();
    const t = Math.max(0, Math.min(1, ((pos[0] - a[0]) * dx + (pos[1] - a[1]) * dy) / len));
    return [a[0] + dx * t, a[1] + dy * t];
  }
  function segmentCount() {
    if (state.draft.length < 2) return 0;
    return state.draft.length - (state.draftRing && state.draft.length >= 3 ? 0 : 1);
  }
  function ensureWaypoints() {
    const count = segmentCount();
    if (!Array.isArray(state.draftWaypoints)) state.draftWaypoints = [];
    while (state.draftWaypoints.length < count) state.draftWaypoints.push([]);
    if (state.draftWaypoints.length > count) state.draftWaypoints.length = count;
  }
  function segmentEnd(index) {
    return index + 1 < state.draft.length ? index + 1 : 0;
  }
  function segmentChain(index) {
    return [state.draft[index].pos, ...(state.draftWaypoints[index] || []), state.draft[segmentEnd(index)].pos];
  }
  function closestLeg(pos, chain) {
    let best = Infinity, index = 0, point = chain[0];
    for (let i = 0; i < chain.length - 1; i++) {
      const hit = projectSegment(pos, chain[i], chain[i + 1]);
      const distance = sim.km(pos, hit);
      if (distance < best) { best = distance; index = i; point = hit; }
    }
    return { index, point };
  }
  function draftCoordinates() {
    const points = [];
    state.draft.forEach((station, index) => {
      points.push(station.pos);
      if (index < segmentCount()) (state.draftWaypoints[index] || []).forEach(point => points.push(point));
    });
    if (state.draftRing && state.draft.length >= 3 && points.length) points.push(state.draft[0].pos);
    return points;
  }
  function stationFrom(pos) {
    const nearby = nearestStop(pos, SNAP_KM);
    const finalPos = nearby ? nearby.pos.slice() : pos.slice();
    if (state.draft.some(station => (station.stopId && nearby && station.stopId === nearby.id) || sim.km(station.pos, finalPos) < 0.12)) {
      toast(t('toast.apart'));
      return null;
    }
    return {
      name: nearby ? nearby.name : t('draft.stationNumber', { n: state.draft.length + 1 }),
      pos: finalPos,
      stopId: nearby ? nearby.id : null,
      schematic: !nearby,
      coordinateNote: nearby ? t('draft.snapped') : t('draft.placed'),
    };
  }
  function segmentAt(point) {
    ensureWaypoints();
    let nearest = -1, distance = 14;
    for (let index = 0; index < segmentCount(); index++) {
      const unprojected = map.unproject(point);
      const hit = closestLeg([unprojected.lng, unprojected.lat], segmentChain(index));
      const pixel = map.project(hit.point);
      const gap = Math.hypot(pixel.x - point.x, pixel.y - point.y);
      if (gap < distance) { nearest = index; distance = gap; }
    }
    return nearest;
  }
  function addDraftStation(pos) {
    const station = stationFrom(pos);
    if (!station) return;
    state.draft.push(station);
    ensureWaypoints();
    renderInspector(); renderDraft(); toast(t(state.draft.length === 1 ? 'toast.draftCount' : 'toast.draftCountPlural', { count: state.draft.length }));
  }
  function insertDraftStation(segmentIndex, pos) {
    const station = stationFrom(pos);
    if (!station) return;
    const chain = segmentChain(segmentIndex);
    const leg = closestLeg(pos, chain);
    const hops = state.draftWaypoints[segmentIndex] || [];
    const before = hops.filter((_, index) => index + 1 <= leg.index);
    const after = hops.filter((_, index) => index + 1 > leg.index);
    if (!station.stopId) station.pos = leg.point;
    state.draft.splice(segmentIndex + 1, 0, station);
    state.draftWaypoints.splice(segmentIndex, 1, before, after);
    ensureWaypoints();
    renderInspector(); renderDraft(); toast(t('toast.inserted', { name: station.name }));
  }
  function addWaypoint(segmentIndex, pos) {
    const chain = segmentChain(segmentIndex);
    const leg = closestLeg(pos, chain);
    const hops = (state.draftWaypoints[segmentIndex] || []).slice();
    hops.splice(leg.index, 0, leg.point);
    state.draftWaypoints[segmentIndex] = hops;
    renderInspector(); renderDraft(); toast(t('toast.waypoint'));
  }
  function addExistingStop(pos) {
    const nearby = nearestStop(pos, .55);
    if (!nearby) return toast(t('toast.noStop'));
    const route = routeById(state.selected);
    if (!route || route.stopIds.includes(nearby.id)) return toast(t('toast.already'));
    const ids = route.stopIds.slice(); let index = ids.length - 1, best = Infinity;
    for (let i = 1; i < ids.length; i++) {
      const a = stop(ids[i - 1]), b = stop(ids[i]); if (!a || !b) continue;
      const score = sim.km(a.pos, nearby.pos) + sim.km(nearby.pos, b.pos) - sim.km(a.pos, b.pos);
      if (score < best) { best = score; index = i; }
    }
    ids.splice(index, 0, nearby.id); setRouteStops(route, ids);
    state.tool = 'inspect'; setMobileView('line'); map.getCanvas().style.cursor = ''; toast(t('toast.added', { name: nearby.name }));
  }
  function repositionDraftStation(index, pos) {
    const current = state.draft[index];
    if (!current) return;
    const nearby = nearestStop(pos, SNAP_KM);
    const finalPos = nearby ? nearby.pos.slice() : pos.slice();
    if (state.draft.some((s, i) => i !== index && ((s.stopId && nearby && s.stopId === nearby.id) || sim.km(s.pos, finalPos) < .12))) {
      renderDraft();
      return toast(t('toast.apart'));
    }
    state.draft[index] = {
      ...current,
      pos: finalPos,
      stopId: nearby ? nearby.id : null,
      schematic: !nearby,
      coordinateNote: nearby ? t('draft.snappedMoved') : t('draft.adjusted'),
    };
    renderInspector(); renderDraft(); toast(t('toast.moved', { name: current.name }));
  }
  function onDraftPointerDown(event) {
    if (state.tool !== 'metro' || rulerActive || event.button > 0) return;
    const rect = map.getCanvasContainer().getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const index = draftIndexAt(point, 22);
    if (index < 0) return;
    if (state.draftMove) {
      event.preventDefault();
      event.stopPropagation();
      draftPressConsumed = true;
      state.movingDraftIndex = index;
      map.getCanvas().style.cursor = 'grabbing';
      toast(t('toast.move', { name: state.draft[index].name }));
      return;
    }
    clearTimeout(draftPressTimer);
    draftPressTimer = setTimeout(() => {
      draftPressConsumed = true;
      state.movingDraftIndex = index;
      map.getCanvas().style.cursor = 'grabbing';
      toast(t('toast.move', { name: state.draft[index].name }));
    }, 480);
  }
  function cancelDraftPress() {
    clearTimeout(draftPressTimer);
    draftPressTimer = null;
  }
  function draftCatchment() {
    ensureWaypoints();
    const radiusKm = state.draftMode === 'rail' || state.draftMode === 'metro' ? 1.2 : 0.8;
    const cells = densityCells.length ? densityCells : (population?.cells || []);
    let residents = 0;
    let newlyRapid = 0;
    const covered = new Set();
    for (const cell of cells) {
      const pop = +cell.population || 0;
      if (!(pop > 0)) continue;
      const pos = [+cell.lon, +cell.lat];
      let near = false;
      for (const station of state.draft) {
        if (sim.km(pos, station.pos) <= radiusKm) { near = true; break; }
      }
      if (!near) continue;
      residents += pop;
      const id = cell.id || `${cell.lon}:${cell.lat}`;
      covered.add(id);
    }
    const rapid = accessGrid().rapidStops || [];
    for (const cell of cells) {
      const pop = +cell.population || 0;
      if (!(pop > 0)) continue;
      const pos = [+cell.lon, +cell.lat];
      const id = cell.id || `${cell.lon}:${cell.lat}`;
      if (!covered.has(id)) continue;
      const already = rapid.some(station => sim.km(pos, station.pos) <= 0.8);
      if (!already) newlyRapid += pop;
    }
    const coords = draftCoordinates();
    let kmTotal = 0;
    for (let i = 1; i < coords.length; i++) kmTotal += sim.km(coords[i - 1], coords[i]);
    const dwell = (modes[state.draftMode]?.dwell || 0.55) * Math.max(0, state.draft.length - (state.draftRing ? 0 : 1));
    const cruise = cruiseSpeed[state.draftMode] || 30;
    const minutes = kmTotal / cruise * 60 + dwell;
    const hint = (modes[state.draftMode]?.stopSpacingHint || 400) * 0.5 / 1000;
    let tooClose = false;
    for (let i = 1; i < state.draft.length; i++) {
      if (sim.km(state.draft[i - 1].pos, state.draft[i].pos) < hint) { tooClose = true; break; }
    }
    return { residents: Math.round(residents), newlyRapid: Math.round(newlyRapid), km: kmTotal, minutes, tooClose };
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
    $('ruler-hint').textContent = rulerActive ? t('ruler.active') : t('ruler.done');
    $('ruler-finish').hidden = !rulerActive;
    setSourceData('ruler-line', featureCollection(display.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: display } }] : []));
    setSourceData('ruler-points', featureCollection(rulerPoints.map((pos, index) => pointFeature({ id: `ruler:${index}`, name: '', pos }))));
  }
  function startRuler(pos) { rulerPoints = [pos]; rulerHover = null; rulerActive = true; renderRuler(); toast(t('ruler.started')); }
  function addRulerPoint(pos) {
    if (rulerPoints.length && sim.km(rulerPoints[rulerPoints.length - 1], pos) < .01) return;
    rulerPoints.push(pos); rulerHover = null; rulerActive = true; renderRuler(); toast(t('toast.rulerDistance', { distance: formatRulerDistance(rulerDistance(rulerPoints)) }));
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
    const cityName = municipality?.properties?.name || cell?.city || t('context.fallback');
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
    const walkEstimate = nearby ? Math.max(1, Math.round(walkMinutes(distance / 1000))) : 0;
    const rapidMinutes = rapidStop ? Math.max(1, Math.round(walkMinutes(rapidKm))) : 0;
    const demandZone = cell ? zoneByCellId.get(cell.id) : null;
    menu.innerHTML = `<div class="map-context-heading" role="presentation"><span class="map-context-eyebrow">${escape(t('context.eyebrow'))}</span><strong>${escape(cityName)}</strong><small>${pos[1].toFixed(5)}° N · ${pos[0].toFixed(5)}° E</small></div>
      <div class="map-context-facts" role="presentation">
        <div><span>${escape(t('context.grid', { year: population?.source?.year || '2021' }))}</span><b>${cell ? escape(t('context.density', { density: format(+cell.density) })) : escape(t('context.noCell'))}</b><small>${cell ? escape(t('context.residents', { count: format(+cell.population || 0) })) : escape(t('context.outside'))}</small></div>
        ${isDebug && demandZone ? `<div><span>${escape(t('context.zone'))}</span><b>${escape(demandZone.id)}</b><small>${escape(t('context.zoneResidents', { count: format(demandZone.residents) }))}</small></div>` : ''}
        <div><span>${escape(t('context.access'))}</span><b>${rapidStop ? `${format(rapidMinutes)} min` : escape(t('context.noService'))}</b><small>${rapidStop ? escape(t('context.straight', { name: rapidStop.name, minutes: format(rapidMinutes) })) : escape(t('context.enable'))}</small></div>
        <div><span>${escape(t('context.nearest'))}</span><b>${nearby ? escape(nearby.name) : escape(t('context.none'))}</b><small>${nearby ? escape(t('context.walk', { distance: format(distance), minutes: format(walkEstimate) })) : escape(t('context.zoom'))}</small></div>
      </div>
      <div class="map-context-actions" role="presentation">
        ${draftIndex >= 0 ? `<button type="button" role="menuitem" data-context-action="move-stop">${escape(t('context.move', { name: state.draft[draftIndex].name }))}</button><button type="button" role="menuitem" data-context-action="remove-stop" class="map-context-danger">${escape(t('context.remove', { name: state.draft[draftIndex].name }))}</button>` : ''}
        ${route ? `<button type="button" role="menuitem" data-context-action="route">${escape(t('context.inspectLine', { name: route.name }))}</button>` : ''}
        ${nearby && distance <= 200 ? `<button type="button" role="menuitem" data-context-action="inspect-stop">${escape(t('context.inspectStop', { name: nearby.name }))}</button>` : ''}
        ${canAddStop ? `<button type="button" role="menuitem" data-context-action="add-stop">${escape(t('context.add', { name: nearby.name }))}</button>` : ''}
        <button type="button" role="menuitem" data-context-action="travel">${escape(t('context.travelFrom'))}</button>
        <button type="button" role="menuitem" data-context-action="metro" class="map-context-primary">${escape(state.tool === 'metro' ? t('context.addStation') : t('context.startMetro'))}</button>
        <button type="button" role="menuitem" data-context-action="ruler">${escape(rulerPoints.length ? rulerActive ? t('context.addRuler') : t('context.extendRuler') : t('context.startRuler'))}</button>
        ${rulerActive ? `<button type="button" role="menuitem" data-context-action="ruler-finish">${escape(t('context.finishRuler'))}</button>` : ''}
        ${rulerPoints.length ? `<button type="button" role="menuitem" data-context-action="ruler-clear">${escape(t('context.clearRuler'))}</button>` : ''}
        <div class="map-context-action-row" role="presentation"><button type="button" role="menuitem" data-context-action="zoom">${escape(t('context.center'))}</button><button type="button" role="menuitem" data-context-action="copy">${escape(t('context.copy'))}</button></div>
        <button type="button" role="menuitem" data-context-action="data" class="map-context-secondary">${escape(t('context.data'))}</button>
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
      if (!copied) throw new Error(t('toast.copyFail'));
      toast(t('toast.copied'));
    } catch (_) { toast(t('toast.copyFail')); }
  }
  function nearestStop(pos, maxKm) {
    let best = null, distance = maxKm;
    for (const s of network.stops) { const d = sim.km(pos, s.pos); if (d < distance) { best = s; distance = d; } }
    return best;
  }
  function routeGeometry(ids, ring = false, waypoints = []) {
    const points = [];
    ids.forEach((id, index) => {
      const station = stop(id);
      if (!station) return;
      points.push(station.pos);
      if (index < ids.length - 1 || ring) (waypoints[index] || []).forEach(point => points.push(point));
    });
    if (ring && points.length) points.push(points[0].slice());
    return [points];
  }
  function writeRoute(route, fields) {
    if (route.source === 'player') {
      const i = state.customRoutes.findIndex(item => item.id === route.id);
      if (i >= 0) state.customRoutes[i] = { ...state.customRoutes[i], ...fields };
    } else state.overrides[route.id] = { ...(state.overrides[route.id] || {}), ...fields };
  }
  function lineTargets(route, field) {
    const lineWide = field === 'color' || ((field === 'headway' || field === 'active') && !state.lineIntervalOnly);
    return lineWide ? (lineFor(route.id)?.patterns || [route]) : [route];
  }
  function setRouteStops(route, ids) {
    if (ids.length < 2) return toast(t('toast.needTwo'));
    const challenge = activeChallenge();
    if (challenge && route.source !== 'player' && !challengeAllowsPublishedEdit(challenge)) {
      return toast(t('toast.challengePublished'));
    }
    remember();
    const ring = route.ring === true && ids.length >= 3;
    const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
    writeRoute(route, { ring, stopIds: ids, waypoints, geometry: routeGeometry(ids, ring, waypoints), edited: true });
    changed();
  }
  function setRouteField(route, field, value) {
    const challenge = activeChallenge();
    if (challenge && route.source !== 'player' && !challengeAllowsPublishedEdit(challenge)) {
      return toast(t('toast.challengePublished'));
    }
    remember();
    for (const item of lineTargets(route, field)) writeRoute(item, { [field]: value });
    changed();
  }
  function revertLine(route) {
    const challenge = activeChallenge();
    if (challenge && route.source !== 'player' && !challengeAllowsPublishedEdit(challenge)) {
      return toast(t('toast.challengePublished'));
    }
    remember();
    for (const item of lineFor(route.id)?.patterns || [route]) delete state.overrides[item.id];
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
  function focusFlow(routeId, fromId, toId) {
    selectRoute(routeId);
    const from = stop(fromId);
    const to = stop(toId);
    if (!from || !to) return;
    const bounds = new maplibregl.LngLatBounds(from.pos, to.pos);
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 15, duration: 650 });
  }
  function selectRoute(id, options = {}) {
    const nextLine = lineFor(id);
    if (nextLine?.key !== lineFor(state.selected)?.key) state.lineIntervalOnly = false;
    state.selected = id; state.selectedStop = null; state.tool = 'inspect'; state.draft = []; state.movingDraftIndex = null; setMobileView('line'); if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false); setPanel('inspector', true); renderList(); renderInspector(); renderSelection(); introSync();
    if (options.fit === false) return;
    const highlighted = nextLine?.patterns || [routeById(id)];
    const points = highlighted.flatMap(route => (route?.geometry || []).flat());
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds(); points.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 13.7, duration: 650 });
    }
  }
  function createMetro() {
    if (state.draft.length < (state.draftRing ? 3 : 2)) return toast(state.draftRing ? t('toast.ring') : t('toast.two'));
    const challenge = activeChallenge();
    if (!state.editingRouteId && challenge && !challengeAllowsNewLines(challenge)) return toast(t('toast.challengeLines'));
    if (!state.editingRouteId && challenge?.constraints?.maxNewLines != null && countPlayerLines(state) >= challenge.constraints.maxNewLines) {
      return toast(t('toast.challengeLines'));
    }
    remember();
    ensureWaypoints();
    const editing = state.editingRouteId;
    const id = editing || `${state.draftMode}:${Date.now().toString(36)}`;
    if (editing) {
      state.customStops = state.customStops.filter(station => !station.id.startsWith(id + ':'));
      state.customRoutes = state.customRoutes.filter(route => route.id !== id);
    }
    const stopIds = [];
    const owned = [];
    state.draft.forEach((station, index) => {
      if (station.stopId && stop(station.stopId)) {
        stopIds.push(station.stopId);
        return;
      }
      const stopId = `${id}:${index}`;
      owned.push({
        id: stopId,
        name: station.name,
        pos: station.pos.slice(),
        city: 'Player',
        schematic: !!station.schematic,
        coordinateNote: station.coordinateNote || '',
      });
      stopIds.push(stopId);
    });
    state.customStops.push(...owned);
    const template = state.draftTemplate;
    const waypoints = state.draftWaypoints.map(segment => segment.map(point => point.slice()));
    const shaped = waypoints.some(segment => segment.length);
    state.customRoutes.push({
      id,
      source: 'player',
      name: state.draftName.trim() || nextDraftName(state.draftMode),
      longName: localize(template?.title) || t('draft.playerLine', { mode: modeLabel(state.draftMode).toLowerCase() }),
      mode: state.draftMode,
      color: state.draftColor,
      vehicle: state.draftVehicle || modes[state.draftMode].vehicleOptions[0],
      alignment: state.draftAlignment || modes[state.draftMode].alignmentOptions[0],
      stopIds,
      waypoints: shaped ? waypoints : undefined,
      geometry: routeGeometry(stopIds, state.draftRing, shaped ? waypoints : []),
      ring: state.draftRing,
      headway: Number(state.draftHeadway) || modes[state.draftMode].defaultHeadway || 8,
      active: true,
      edited: true,
      templateId: template?.id || null,
      templateSourceUrl: template?.sourceUrl || null,
      templateSourceTitle: template?.sourceTitle || null,
      templateDescription: template?.description || null,
      templateConfidence: template?.confidence || null,
      templateStatus: template?.status || null,
      schematic: !!template,
    });
    state.draft = [];
    state.draftWaypoints = [];
    state.draftRing = false;
    state.draftMove = false;
    state.movingDraftIndex = null;
    state.editingRouteId = null;
    state.tool = 'inspect';
    state.selected = id;
    state.draftName = nextDraftName(state.draftMode);
    state.draftMode = 'metro';
    state.draftVehicle = 'metro6';
    state.draftAlignment = 'tunnel';
    state.draftTemplate = null;
    state.draftColor = colors.metro;
    setMobileView('line');
    map.getCanvas().style.cursor = '';
    changed();
    toast(editing ? t('toast.savedLine') : t('toast.opened'));
  }
  function editPlayerAlignment(route) {
    if (!route || route.source !== 'player') return;
    state.tool = 'metro';
    state.selected = null;
    state.selectedStop = null;
    state.editingRouteId = route.id;
    state.draftMode = route.mode;
    state.draftVehicle = route.vehicle || modes[route.mode].vehicleOptions[0];
    state.draftAlignment = route.alignment || modes[route.mode].alignmentOptions[0];
    state.draftName = route.name;
    state.draftColor = routeColor(route);
    state.draftHeadway = route.headway;
    state.draftRing = !!route.ring;
    state.draftMove = false;
    state.movingDraftIndex = null;
    state.draftTemplate = null;
    state.draft = route.stopIds.map(id => {
      const station = stop(id);
      const published = network.stops.some(item => item.id === id);
      return {
        name: station?.name || id,
        pos: station?.pos.slice() || [0, 0],
        stopId: published ? id : null,
        schematic: !!station?.schematic,
        coordinateNote: station?.coordinateNote || '',
      };
    }).filter(station => Number.isFinite(station.pos[0]));
    state.draftWaypoints = Array.isArray(route.waypoints)
      ? route.waypoints.map(segment => (segment || []).map(point => point.slice()))
      : [];
    ensureWaypoints();
    setMobileView('line');
    setPanel('inspector', true);
    map.getCanvas().style.cursor = 'crosshair';
    renderList();
    renderInspector();
    renderDraft();
    toast(t('toast.editAlignment'));
  }
  function activeChallenge() {
    return challengeCatalog.find(item => item.id === (state.challenge || challengeBook.active)) || null;
  }
  function refreshBudget() {
    const challenge = activeChallenge();
    const cap = challenge?.constraints?.budgetPLN
      ?? region.budget?.capitalPLN
      ?? capitalCosts.defaultBudgetPLN;
    state.budgetSummary = summarizeBudget({
      customRoutes: state.customRoutes,
      overrides: state.overrides,
      publishedRoutes: network.routes,
      stopLookup: stop,
      km: sim.km,
      resolveService: (route, daypart) => sim.resolveService(route, daypart),
      daypart: state.daypart,
      stats: state.stats,
      baseline: state.baseline,
      budgetCap: cap,
      region,
    });
    const wrap = $('pulse-budget-wrap');
    const pulse = $('pulse-budget');
    if (wrap) wrap.hidden = !state.budgetMode;
    if (pulse && state.budgetMode && state.budgetSummary) {
      pulse.textContent = `${compactMillions(state.budgetSummary.capital)} / ${compactMillions(state.budgetSummary.budgetCap)}`;
      pulse.classList.toggle('warning', state.budgetSummary.overBudget);
      pulse.title = t('results.budgetPulseTitle', {
        spent: format(Math.round(state.budgetSummary.capital)),
        budget: format(Math.round(state.budgetSummary.budgetCap)),
      });
    }
  }
  function enterLineTool(mode = 'metro') {
    const challenge = activeChallenge();
    if (challenge && !challengeAllowsMode(challenge, mode)) return toast(t('toast.challengeMode'));
    if (challenge && !challengeAllowsNewLines(challenge) && !state.editingRouteId) return toast(t('toast.challengeLines'));
    if (challenge?.constraints?.maxNewLines != null && countPlayerLines(state) >= challenge.constraints.maxNewLines && !state.editingRouteId) {
      return toast(t('toast.challengeLines'));
    }
    const spec = modes[mode] || modes.metro;
    state.tool = 'metro';
    state.selected = null;
    state.selectedStop = null;
    state.draft = [];
    state.draftWaypoints = [];
    state.draftRing = false;
    state.draftMove = false;
    state.movingDraftIndex = null;
    state.editingRouteId = null;
    state.draftMode = mode;
    state.draftVehicle = spec.vehicleOptions[0];
    state.draftAlignment = spec.alignmentOptions[0];
    state.draftTemplate = null;
    state.draftColor = suggestLineColor() || colors[mode];
    state.draftName = nextDraftName(mode);
    state.draftHeadway = spec.defaultHeadway;
    setMobileView('line');
    setPanel('inspector', true);
    map.getCanvas().style.cursor = 'crosshair';
    renderList();
    renderInspector();
    renderSelection();
    renderDraft();
    toast(t('toast.place'));
  }
  function syncChallengeTools() {
    const challenge = activeChallenge();
    const canDraw = !challenge || challengeAllowsNewLines(challenge);
    const draw = $('metro-tool');
    if (draw) draw.hidden = !canDraw;
    const templateSection = $('template-section');
    if (templateSection) templateSection.hidden = !templates.length || (challenge && !challengeAllowsNewLines(challenge));
  }
  function renderChallenges() {
    syncChallengeTools();
    const section = $('challenge-section');
    const host = $('challenge-list');
    const progress = $('challenge-progress');
    if (!section || !host) return;
    section.hidden = !challengeCatalog.length;
    $('challenge-count').textContent = challengeCatalog.length ? `(${challengeCatalog.length})` : '';
    host.innerHTML = challengeCatalog.map(item => {
      const earned = challengeBook.stars?.[item.id] || 0;
      const active = (state.challenge || challengeBook.active) === item.id;
      return `<article class="challenge-card${active ? ' is-active' : ''}"><div class="section-title"><h3>${escape(localize(item.title))}</h3><span class="value">${'★'.repeat(earned)}${'☆'.repeat(Math.max(0, (item.stars?.length || 0) - earned))}</span></div><p>${escape(localize(item.brief))}</p><button type="button" data-challenge-id="${escape(item.id)}">${escape(active ? t('network.challengeActive') : t('network.challengeStart'))}</button></article>`;
    }).join('');
    host.querySelectorAll('[data-challenge-id]').forEach(button => {
      button.onclick = () => startChallenge(button.dataset.challengeId);
    });
    const challenge = activeChallenge();
    if (!challenge || !progress) { if (progress) progress.hidden = true; return; }
    const verdict = evaluateChallenge(challenge, {
      stats: state.stats,
      baseline: state.baseline,
      budget: state.budgetSummary || null,
      odMinutes: state.challengeOdMinutes ?? null,
    });
    progress.hidden = false;
    const next = challengeCatalog.find(item => item.id !== challenge.id && !(challengeBook.stars?.[item.id] >= (item.stars?.length || 0)));
    const doneActions = verdict.complete
      ? `<p class="challenge-done">${escape(t('network.challengeDone'))}</p><div class="toolbar"><button type="button" data-challenge-share>${escape(t('network.challengeShare'))}</button>${next ? `<button type="button" class="primary" data-challenge-next="${escape(next.id)}">${escape(t('network.challengeNext'))}</button>` : ''}</div>`
      : '';
    progress.innerHTML = `<div class="section-title"><h3>${escape(localize(challenge.title))}</h3><span class="value">${verdict.stars}★</span></div>${verdict.results.map(item => {
      const valueNote = item.value != null && Number.isFinite(item.value)
        ? (item.objective.type === 'odTime' ? ` · ${fmtDecimal(item.value, 1)} min` : '')
        : '';
      return `<p class="${item.ok ? 'positive' : ''}">${item.ok ? '✓' : '·'} ${escape(localize(item.objective.label) || item.objective.type)}${escape(valueNote)}</p>`;
    }).join('')}${verdict.overBudget ? `<p class="model-notice">${escape(t('network.challengeOverBudget'))}</p>` : ''}${doneActions}`;
    progress.querySelector('[data-challenge-share]')?.addEventListener('click', () => shareScenario());
    progress.querySelector('[data-challenge-next]')?.addEventListener('click', event => startChallenge(event.currentTarget.dataset.challengeNext));
    if (verdict.stars > (challengeBook.stars[challenge.id] || 0)) {
      challengeBook.stars[challenge.id] = verdict.stars;
      saveChallengeBook(region.id, challengeBook);
    }
  }
  function startChallenge(id) {
    const challenge = challengeCatalog.find(item => item.id === id);
    if (!challenge) return;
    remember();
    Object.assign(state, empty());
    state.challenge = id;
    state.daypart = 'peak';
    challengeBook.active = id;
    saveChallengeBook(region.id, challengeBook);
    if (typeof state.budgetMode !== 'undefined') state.budgetMode = true;
    else state.budgetMode = true;
    rebuildRouteCache();
    persist();
    renderList();
    renderInspector();
    renderMap();
    renderChallenges();
    scheduleStats();
    toast(localize(challenge.title));
  }
  function renderTemplates() {
    const host = $('template-list');
    if (!host) return;
    $('template-section').hidden = !templates.length;
    $('template-count').textContent = `(${templates.length})`;
    host.innerHTML = templates.map(item => {
      const mode = ['metro', 'tram', 'rail'].includes(item.mode) ? item.mode : 'rail';
      const count = Array.isArray(item.stations) ? item.stations.length : 0;
      return `<article class="template-card"><div class="section-title"><span class="chip mode-${escape(mode)}">${escape(modeLabel(mode))}</span><span class="value">${escape(localize(item.status) || t('draft.status'))}</span></div><h3>${escape(localize(item.title) || t('draft.fallback'))}</h3><p>${escape(localize(item.description) || t('draft.fallbackBody'))}</p><p class="fine-print">${escape(t('network.anchors', { count }))} · ${escape(localize(item.confidence) || t('draft.confidence'))}</p><div class="toolbar"><a href="${escape(safeUrl(item.sourceUrl || '#'))}" target="_blank" rel="noopener">${escape(t('network.readSource'))}</a><button class="primary" data-template-id="${escape(item.id)}">${escape(t('network.loadDraft'))}</button></div></article>`;
    }).join('') || `<p class="empty-state">${escape(t('network.noConcepts'))}</p>`;
  }
  function loadTemplate(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template || !Array.isArray(template.stations) || template.stations.length < 2) return toast(t('toast.incomplete'));
    const mode = ['tram', 'rail', 'metro', 'bus'].includes(template.mode) ? template.mode : 'rail';
    const challenge = activeChallenge();
    if (challenge && !challengeAllowsNewLines(challenge)) return toast(t('toast.challengeLines'));
    if (challenge && !challengeAllowsMode(challenge, mode)) return toast(t('toast.challengeMode'));
    const spec = modes[mode] || modes.rail;
    state.tool = 'metro'; state.selected = null; state.selectedStop = null; state.draftRing = false; state.draftMove = false; state.movingDraftIndex = null; state.editingRouteId = null; state.draftTemplate = template;
    state.draftMode = mode; state.draftVehicle = spec.vehicleOptions[0]; state.draftAlignment = spec.alignmentOptions[0];
    state.draftColor = suggestLineColor(template.stations.map(s => [Number(s.lon), Number(s.lat)]));
    state.draftName = template.defaultName || nextDraftName(mode);
    state.draftHeadway = Number(template.headway) || spec.defaultHeadway;
    state.draftWaypoints = [];
    state.draft = template.stations.map((station, i) => {
      const pos = [Number(station.lon), Number(station.lat)];
      const nearby = nearestStop(pos, SNAP_KM);
      return {
        name: station.name || nearby?.name || t('draft.stationNumber', { n: i + 1 }),
        pos: nearby ? nearby.pos.slice() : pos,
        stopId: nearby ? nearby.id : null,
        schematic: nearby ? false : station.schematic !== false,
        coordinateNote: nearby ? t('draft.snapped') : (localize(station.coordinateNote) || '')
      };
    }).filter(s => Number.isFinite(s.pos[0]) && Number.isFinite(s.pos[1]));
    if (state.draft.length < 2) { state.draft = []; state.draftTemplate = null; state.tool = 'inspect'; return toast(t('toast.noCoords')); }
    setMobileView('line');
    if (innerWidth <= 900 && innerWidth > 600) setPanel('network', false);
    setPanel('inspector', true); map.getCanvas().style.cursor = 'crosshair';
    renderList(); renderInspector(); renderDraft();
    const bounds = new maplibregl.LngLatBounds(); state.draft.forEach(s => bounds.extend(s.pos));
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 13.5, duration: 650 });
    toast(t('toast.loaded', { mode: modeLabel(mode) }));
  }
  const ctx = {};
  function renderList() { renderRouteList(ctx); }
  function renderInspector() {
    if (renderDraftInspector(ctx)) return;
    if (renderStopInspector(ctx)) return;
    renderLineInspector(ctx);
  }
  function renderCompare() {
    const select = $('compare-with');
    if (!select) return;
    const book = readBook();
    const options = [`<option value="">${escape(t('results.published'))}</option>`, ...book.slots.filter(slot => slot.id !== book.active).map(slot => `<option value="${escape(slot.id)}"${slot.id === state.compareSlotId ? ' selected' : ''}>${escape(slot.name)}</option>`)];
    select.innerHTML = options.join('');
    select.onchange = () => {
      state.compareSlotId = select.value || null;
      state.compareName = select.selectedOptions[0]?.textContent || '';
      if (!state.compareSlotId) state.compareName = '';
      scheduleStats();
    };
  }
  function renderStats() {
    refreshBudget();
    const challenge = activeChallenge();
    state.challengeOdMinutes = challenge
      ? odMinutesForChallenge(challenge, sim, network, state, state.daypart)
      : null;
    renderResults(ctx);
    renderCompare();
    renderChallenges();
    rebuildFlowLayers();
    if (state.activeLayer === 'winners' || state.activeLayer === 'travel') rebuildInsightGrid();
  }
  function enterMetroTool() { enterLineTool('metro'); }

  let statsPool = null, statsRevision = 0, workerUnavailable = false, statsBusy = false, pendingStats = null;
  let sliceArrivals = [], sliceProgress = [], lastScenario = null, refineState = null;
  function mixFlows(prev, next, iteration) {
    const out = new Float32Array(prev.length);
    const weight = 1 / iteration;
    for (let i = 0; i < out.length; i++) out[i] = (1 - weight) * prev[i] + weight * next[i];
    return out;
  }
  function crowdScales(daily, layout) {
    const scale = new Float32Array(daily.length);
    scale.fill(1);
    for (const pattern of layout) {
      const hourly = (60 / pattern.headway) * (pattern.capacity || capacity[pattern.mode] || 1);
      for (let s = 0; s < pattern.km.length; s++) {
        const vc = hourly > 0 ? daily[pattern.offset + s] * choiceParams.peakHourShare / hourly : 0;
        scale[pattern.offset + s] = crowdMultiplier(vc);
      }
    }
    return scale;
  }
  function postRefine() {
    if (workerUnavailable || !refineState || refineState.revision !== statsRevision || refineState.iteration >= 3) {
      refineState = null;
      return;
    }
    const job = { ...refineState.scenario, segmentScale: crowdScales(refineState.daily, state.stats.flows.layout), refine: true };
    if (statsBusy) return;
    postSlices(job);
  }
  function beginRefine(scenario, stats) {
    if (!scenario || !stats?.flows?.layout || !stats.flows.segmentDaily) return;
    refineState = {
      revision: scenario.revision,
      scenario,
      iteration: 1,
      daily: stats.flows.segmentDaily.slice(),
      board: stats.flows.stopBoardings.slice(),
      xfer: stats.flows.stopTransfers.slice(),
      riders: stats.flows.patternRiders.slice(),
      started: performance.now(),
    };
    postRefine();
  }
  function scheduleStats() {
    statsRevision++;
    clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recomputeStats, 35);
  }
  function showProgress(value, visible) {
    for (const bar of document.querySelectorAll('.sim-progress')) {
      bar.hidden = !visible;
      if (visible) bar.value = value;
    }
  }
  function shippedPeak() {
    const file = window.TRANSIT_BASELINE;
    if (!file || file.modelVersion !== modelVersion || file.networkVersion !== network.version || file.daypart !== 'peak') return null;
    return file.stats;
  }
  function poolCount() {
    const memory = navigator.deviceMemory || 8;
    const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (phone || memory <= 4) return 1;
    return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  }
  function originSlices(count) {
    const zones = sim.zones.length;
    const slices = [];
    for (let index = 0; index < count; index++) {
      const start = Math.floor(index * zones / count);
      const end = Math.floor((index + 1) * zones / count);
      if (end > start) slices.push([start, end]);
    }
    return slices;
  }
  function applyWorkerResult(data) {
    statsBusy = false;
    showProgress(0, false);
    if (data.revision === statsRevision) {
      state.stats = data.stats;
      const book = readBook();
      if (data.compareId && data.baseline) {
        const slot = book.slots.find(item => item.id === data.compareId);
        if (slot) { slot.summary = summaryFrom(data.baseline); slot.modelVersion = modelVersion; writeBook(book); }
        state.baseline = data.baseline;
      } else if (state.compareSlotId) {
        const slot = book.slots.find(item => item.id === state.compareSlotId);
        state.baseline = slot?.summary?.stats && slot.summary.modelVersion === modelVersion && slot.summary.networkVersion === network.version ? slot.summary.stats : data.baseline;
      } else {
        const slot = book.slots.find(item => item.id === book.active);
        if (slot && !state.sharePreview) { slot.summary = summaryFrom(data.stats); slot.modelVersion = modelVersion; writeBook(book); }
        state.baseline = data.baseline;
      }
      renderStats();
    }
    if (pendingStats) {
      refineState = null;
      const next = pendingStats;
      pendingStats = null;
      postSlices(next);
      return;
    }
    if (data.revision === statsRevision && data.stats?.flows && !data.refine) beginRefine(lastScenario, data.stats);
  }
  function onPoolMessage(data) {
    if (data.job === 'travelTime') {
      applyTravelResult(data.travel, data.travelBaseline, data.revision);
      return;
    }
    if (typeof data.progress === 'number') {
      if (data.revision !== statsRevision) return;
      sliceProgress[data.workerIndex] = data.progress;
      const value = sliceProgress.reduce((sum, part) => sum + (part || 0), 0) / Math.max(1, sliceProgress.length);
      showProgress(value, true);
      return;
    }
    if (data.revision !== statsRevision || !data.partial) return;
    sliceArrivals[data.workerIndex] = data;
    if (sliceArrivals.some(item => !item)) return;
    if (sliceArrivals[0].refine && refineState && data.revision === refineState.revision) {
      statsBusy = false;
      showProgress(0, false);
      const assigned = sim.combinePartials(sliceArrivals.map(item => item.stats));
      refineState.iteration += 1;
      refineState.daily = mixFlows(refineState.daily, assigned.flows.segmentDaily, refineState.iteration);
      refineState.board = mixFlows(refineState.board, assigned.flows.stopBoardings, refineState.iteration);
      refineState.xfer = mixFlows(refineState.xfer, assigned.flows.stopTransfers, refineState.iteration);
      refineState.riders = mixFlows(refineState.riders, assigned.flows.patternRiders, refineState.iteration);
      const merged = { ...assigned, flows: { ...assigned.flows, patternRiders: refineState.riders, layout: state.stats.flows.layout, stopIds: state.stats.flows.stopIds } };
      state.stats = sim.presentFlows(merged, refineState.daily, refineState.board, refineState.xfer);
      state.stats.flows.refining = refineState.iteration < 3;
      state.stats.flows.refined = refineState.iteration >= 3;
      if (state.stats.flows.refined) state.stats.flows.refineMs = Math.round(performance.now() - refineState.started);
      renderStats();
      renderInspector();
      if (pendingStats) {
        refineState = null;
        const next = pendingStats;
        pendingStats = null;
        postSlices(next);
        return;
      }
      if (refineState.iteration >= 3) refineState = null;
      else postRefine();
      return;
    }
    const stats = sim.combinePartials(sliceArrivals.map(item => item.stats));
    const compared = sliceArrivals[0].compare ? sim.combinePartials(sliceArrivals.map(item => item.compare)) : null;
    const published = sliceArrivals[0].baseline ? sim.combinePartials(sliceArrivals.map(item => item.baseline)) : shippedPeak();
    applyWorkerResult({ revision: data.revision, stats, baseline: compared || published, compareId: sliceArrivals[0].compareId });
  }
  function ensurePool() {
    const count = poolCount();
    if (statsPool?.length === count) return statsPool;
    statsPool?.forEach(worker => worker.terminate());
    statsPool = Array.from({ length: count }, () => {
      const worker = new Worker(new URL(`./sim/worker.js?v=${loaded.cacheVersion}-builder`, import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => onPoolMessage(data);
      worker.onerror = () => {
        statsPool?.forEach(item => item.terminate());
        statsPool = null;
        workerUnavailable = true;
        statsBusy = false;
        pendingStats = null;
        showProgress(0, false);
        recomputeStats();
      };
      return worker;
    });
    return statsPool;
  }
  function postSlices(scenario) {
    const workers = ensurePool();
    const slices = originSlices(workers.length);
    sliceArrivals = Array(slices.length).fill(null);
    sliceProgress = Array(slices.length).fill(0);
    showProgress(0, true);
    statsBusy = true;
    slices.forEach(([originStart, originEnd], index) => {
      workers[index].postMessage({ ...scenario, originStart, originEnd, workerIndex: index });
    });
  }
  function recomputeStats() {
    const revision = ++statsRevision;
    const comparison = state.compareSlotId ? readBook().slots.find(slot => slot.id === state.compareSlotId) : null;
    const cachedCompare = comparison?.summary?.stats && comparison.summary.modelVersion === modelVersion && comparison.summary.networkVersion === network.version ? comparison.summary.stats : null;
    const untouched = !state.customRoutes.length && !state.customStops.length && !Object.keys(state.overrides).length;
    const shipped = shippedPeak();
    const scenario = {
      revision,
      customRoutes: state.customRoutes,
      customStops: state.customStops,
      overrides: state.overrides,
      daypart: state.daypart,
      networkUrl: window.TRANSIT_URLS.network,
      populationUrl: window.TRANSIT_URLS.population,
      tripRate: region.demand?.tripRate,
      compareId: cachedCompare ? null : (state.compareSlotId || null),
      compare: cachedCompare || !comparison ? null : comparison.scenario,
      skipBaseline: state.daypart === 'peak' && !!shipped,
    };
    lastScenario = scenario;
    refineState = null;
    if (shipped && state.daypart === 'peak' && untouched && !comparison) {
      applyWorkerResult({ revision, stats: { ...shipped }, baseline: shipped, compareId: null });
    }
    if (!workerUnavailable) {
      try {
        if (statsBusy) pendingStats = scenario;
        else postSlices(scenario);
        return;
      } catch (_) {
        statsPool?.forEach(worker => worker.terminate());
        statsPool = null;
        workerUnavailable = true;
      }
    }
    setTimeout(() => {
      if (revision !== statsRevision) return;
      const compareStats = scenario.compare ? sim.calculate(network, scenario.compare.customRoutes || [], scenario.compare.customStops || [], scenario.compare.overrides || {}, state.daypart) : null;
      state.baseline = compareStats || shipped || sim.calculate(network, [], [], {}, state.daypart);
      state.stats = sim.calculate(network, scenario.customRoutes, scenario.customStops, scenario.overrides, state.daypart);
      showProgress(0, false);
      renderStats();
      beginRefine(scenario, state.stats);
    }, 15);
  }

  function openData() {
    const source = population?.source || {};
    const populationCredit = maskCells.length ? `<p><b>${escape(t('data.populationLabel'))}</b> — <a href="${escape(safeUrl(source.url || window.TRANSIT_URLS.population))}" target="_blank" rel="noopener">${escape(source.shortName || t('data.gridFallback'))}</a>; ${escape(source.attribution || '')} ${escape(t('data.population', { count: region.municipalities.length }))}</p>` : '';
    const feedNotes = network.sources.map(item => `<p><b>${escape(item.name)}</b> — <a href="${escape(safeUrl(item.url || '#'))}" target="_blank" rel="noopener">${escape(item.license || 'Source')}</a>${item.date ? `, ${escape(item.date)}` : ''}.${item.note ? ` ${escape(item.note)}` : ''}</p>`).join('');
    const tripRate = region.demand?.tripRate || 0.6;
    const demandExplanation = state.stats?.demandPopulation ? t('data.demand', { residents: format(state.stats.demandPopulation), zones: sim.zones.length, rate: tripRate, trips: format(state.stats.demandTrips) }) : t('data.noPopulation');
    const regionName = localize(region.name) || region.name?.en || '';
    modal(`<span class="chip">${escape(t('data.chip'))}</span><h2>${escape(t('data.title'))}</h2><p>${escape(t('data.area', { count: region.municipalities.length, name: regionName }))}</p>
      <div class="modal-sources">${feedNotes}${populationCredit}<p>${escape(t('data.access'))}</p><p>${escape(t('data.concepts'))}</p><p><b>${escape(t('data.basemap'))}</b> — <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>, <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>.</p></div>
      <h3>${escape(t('data.how'))}</h3><p>${escape(demandExplanation)} ${escape(t('data.method'))}</p><p>${escape(t('data.satisfaction'))}</p><p>${escape(t('data.shapes'))}</p>
      <h3>${escape(t('data.costsTitle'))}</h3><p>${escape(t('data.costs'))}</p>
      <p><a href="${escape(window.TRANSIT_URLS.network)}" target="_blank">${escape(t('data.openNetwork'))}</a> · <a href="${escape(window.TRANSIT_URLS.population)}" target="_blank">${escape(t('data.openPopulation'))}</a></p>`);
  }
  function openGuide() {
    const regionName = localize(region.shortName) || region.shortName?.en || '';
    modal(`<span class="chip">${escape(t('guide.chip'))}</span><h2>${escape(t('guide.title', { name: regionName }))}</h2><ol>${t('guide.body')}</ol><p>${escape(t('guide.map'))}</p>`);
  }
  function ensureSlot(scenario) {
    const book = readBook();
    let renamed = false;
    for (const slot of book.slots) if (slot.name === 'slots.autosave') { slot.name = t('slots.autosave'); renamed = true; }
    if (renamed) writeBook(book);
    if (!book.slots.length) {
      const slot = createSlot(book, scenario, null, t('slots.autosave'));
      if (slot) { slot.modelVersion = modelVersion; slot.networkVersion = network.version; writeBook(book); }
      return;
    }
    if (!book.active) { book.active = book.slots[0].id; writeBook(book); }
    if (!state.sharePreview) {
      const slot = book.slots.find(item => item.id === book.active);
      if (slot?.scenario) Object.assign(state, normalizeScenario(slot.scenario));
    }
  }
  function showShareBanner() {
    const banner = $('share-banner');
    banner.hidden = false;
    banner.innerHTML = `<span>${escape(t('share.banner', { name: state.sharePreview?.name || t('share.untitled') }))}</span><button type="button" id="share-keep">${escape(t('share.keep'))}</button><button type="button" id="share-close">${escape(t('share.close'))}</button>`;
    $('share-keep').onclick = keepShare;
    $('share-close').onclick = closeShare;
  }
  async function openSharedLink() {
    const payload = new URLSearchParams(location.hash.replace(/^#/, '')).get('s');
    if (!payload) return;
    try {
      const expanded = expand(await decompressJson(base64UrlToBytes(payload)), network);
      if (expanded.region && expanded.region !== region.id) {
        const url = new URL(location.href);
        url.searchParams.set('region', expanded.region);
        location.replace(url.toString());
        return;
      }
      if (expanded.networkVersion && ![network.version, ...LEGACY_VERSIONS].includes(expanded.networkVersion)) toast(t('scenario.version'));
      const warnings = [];
      Object.assign(state, normalizeScenario(expanded.scenario, warning => warnings.push(warning)));
      state.challenge = expanded.challenge || null;
      state.sharePreview = { name: expanded.name || t('share.untitled') };
      showShareBanner();
      if (warnings.length) toast(warnings.join(' '));
    } catch (_) { toast(t('toast.importFail')); }
  }
  function clearShareHash() {
    const url = new URL(location.href);
    url.hash = '';
    history.replaceState(null, '', url);
    $('share-banner').hidden = true;
  }
  function closeShare() {
    state.sharePreview = null;
    clearShareHash();
    const slot = readBook().slots.find(item => item.id === readBook().active);
    Object.assign(state, slot?.scenario ? normalizeScenario(slot.scenario) : empty());
    state.selected = null; state.selectedStop = null; changed();
  }
  function keepShare() {
    const book = readBook();
    const created = createSlot(book, currentScenario(), summaryFrom(state.stats), state.sharePreview?.name || t('slots.shared'));
    if (!created) return toast(t('toast.slotLimit', { max: slotLimit }));
    state.sharePreview = null;
    clearShareHash();
    writeBook(book);
    persist();
    toast(t('toast.slotKept'));
  }
  async function copyText(value) {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(value); copied = true; } catch (_) {}
    }
    if (!copied) {
      const field = document.createElement('textarea');
      field.value = value; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field);
      field.select(); copied = document.execCommand('copy'); field.remove();
    }
    if (!copied) throw new Error(t('toast.copyFail'));
  }
  async function shareScenario() {
    const book = readBook();
    const slot = book.slots.find(item => item.id === book.active);
    const payload = bytesToBase64Url(await compressJson(minify(currentScenario(), network, { region: region.id, networkVersion: network.version, name: slot?.name || t('share.untitled'), challenge: state.challenge })));
    const url = shareUrl(payload, region.id);
    const notice = url.length > 8000 ? t('toast.linkLong', { count: format(url.length) }) : t('toast.linkCopied', { count: format(url.length) });
    try { await copyText(url); toast(notice); }
    catch (_) {
      modal(`<span class="chip">${escape(t('top.share'))}</span><h2>${escape(notice)}</h2><input id="share-link" readonly value="${escape(url)}">`);
      $('share-link').focus();
      $('share-link').select();
    }
  }
  function applySlot(scenario) {
    Object.assign(state, normalizeScenario(scenario));
    state.selected = null; state.selectedStop = null; state.tool = 'inspect'; state.draft = [];
    changed();
  }
  function openSlots() {
    const book = readBook();
    const bytes = JSON.stringify(book).length;
    const rows = book.slots.map(slot => `<div class="slot-row"><button type="button" data-slot-open="${escape(slot.id)}" ${slot.id === book.active ? 'aria-current="true"' : ''}>${escape(slot.name)}</button><small>${escape(slot.summary ? t('slots.summary', { trips: format(slot.summary.passengers), cost: format(slot.summary.cost) }) : t('slots.noSummary'))}</small><button type="button" data-slot-rename="${escape(slot.id)}">${escape(t('slots.rename'))}</button><button type="button" data-slot-copy="${escape(slot.id)}">${escape(t('slots.duplicate'))}</button><button type="button" data-slot-delete="${escape(slot.id)}">${escape(t('slots.delete'))}</button></div>`).join('');
    modal(`<span class="chip">${escape(t('slots.chip'))}</span><h2>${escape(t('slots.title'))}</h2><p class="fine-print">${escape(t('slots.usage', { count: book.slots.length, max: slotLimit, size: format(Math.ceil(bytes / 1024)) }))}</p><div class="slot-list">${rows || `<p class="empty-state">${escape(t('slots.empty'))}</p>`}</div><div class="toolbar"><button id="slot-create" class="primary" type="button">${escape(t('slots.create'))}</button></div>`);
    $('slot-create').onclick = () => {
      const name = window.prompt(t('slots.namePrompt'), t('slots.newName'));
      if (!name) return;
      const fresh = readBook();
      if (!createSlot(fresh, currentScenario(), summaryFrom(state.stats), name.trim())) return toast(t('toast.slotLimit', { max: slotLimit }));
      writeBook(fresh);
      closeModal();
      toast(t('toast.slotCreated'));
    };
  }
  function onSlotAction(event) {
    const open = event.target.closest('[data-slot-open]')?.dataset.slotOpen;
    const copy = event.target.closest('[data-slot-copy]')?.dataset.slotCopy;
    const remove = event.target.closest('[data-slot-delete]')?.dataset.slotDelete;
    const rename = event.target.closest('[data-slot-rename]')?.dataset.slotRename;
    if (!open && !copy && !remove && !rename) return false;
    const fresh = readBook();
    const previous = fresh.active;
    if (open && open !== fresh.active) {
      const next = activateSlot(fresh, open, { scenario: currentScenario(), summary: summaryFrom(state.stats) });
      if (!next) return true;
      writeBook(fresh);
      closeModal();
      applySlot(next.scenario);
      return true;
    }
    if (copy) {
      if (!duplicateSlot(fresh, copy)) toast(t('toast.slotLimit', { max: slotLimit }));
      else { writeBook(fresh); closeModal(); openSlots(); }
      return true;
    }
    if (rename) {
      const slot = fresh.slots.find(item => item.id === rename);
      const name = window.prompt(t('slots.namePrompt'), slot?.name || '');
      if (!name) return true;
      renameSlot(fresh, rename, name.trim());
      writeBook(fresh);
      closeModal();
      openSlots();
      return true;
    }
    if (remove) {
      const active = deleteSlot(fresh, remove);
      writeBook(fresh);
      closeModal();
      if (remove === previous) {
        const slot = fresh.slots.find(item => item.id === active);
        if (slot) applySlot(slot.scenario);
        else { Object.assign(state, empty()); changed(); }
      }
    }
    return true;
  }
  function exportScenario() {
    const payload = { app: 'Transit Lab', region: region.id, networkVersion: network.version, savedAt: new Date().toISOString(), ...JSON.parse(snapshot()), daypart: state.daypart };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `transit-lab-${region.id}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast(t('toast.exported'));
  }

  $('route-list').onclick = e => {
    const card = e.target.closest('[data-route]');
    if (!card) return;
    const line = lineFor(card.dataset.route);
    if (line?.patterns.some(pattern => pattern.id === state.selected)) clearSelection();
    else selectRoute(card.dataset.route);
  };
  $('template-list').onclick = e => { const button = e.target.closest('[data-template-id]'); if (button) loadTemplate(button.dataset.templateId); };
  $('network-rail').onclick = () => setPanel('network', !state.networkOpen);
  document.querySelector('.panel-tabs').onclick = e => {
    const tab = e.target.closest('[data-panel-tab]')?.dataset.panelTab;
    if (tab) { setPanelTab(tab); introSync(); }
  };
  $('planning-layer').onchange = e => {
    closeContextMenu();
    state.activeLayer = e.target.value;
    if (state.activeLayer === 'winners' || state.activeLayer === 'travel') rebuildInsightGrid();
    renderPopulationControl();
  };
  $('flows-toggle')?.addEventListener('change', e => {
    state.flowsVisible = e.target.checked;
    rebuildFlowLayers();
    applyMapModeVisibility();
    renderPopulationControl();
  });
  $('flows-crowd-toggle')?.addEventListener('change', e => {
    state.flowsCrowding = e.target.checked;
    applyFlowLayerVisibility();
  });
  $('layer-compare-toggle')?.addEventListener('change', e => {
    state.layerCompare = e.target.checked;
    insightGridKey = null;
    rebuildInsightGrid();
    renderPopulationControl();
  });
  $('map-context-menu').oncontextmenu = e => e.preventDefault();
  $('map-context-menu').onclick = e => {
    const action = e.target.closest('[data-context-action]')?.dataset.contextAction;
    if (!action || !contextLocation) return;
    const { pos, nearby, route, draftIndex } = contextLocation;
    closeContextMenu();
    if (action === 'route' && route) { finishRuler(); selectRoute(route.id); }
    else if (action === 'inspect-stop' && nearby) { finishRuler(); inspectStop(nearby.id); }
    else if (action === 'add-stop' && nearby) { finishRuler(); addExistingStop(nearby.pos); }
    else if (action === 'travel') {
      finishRuler();
      const cell = maskCells.find(item => pointInGeometry(pos, item.geometry));
      const city = cityBoundaries.features.find(item => pointInGeometry(pos, item.geometry))?.properties?.name;
      requestTravelFrom(pos, nearby?.name || city || cell?.city || t('context.fallback'));
    }
    else if (action === 'move-stop' && draftIndex >= 0) { finishRuler(); state.movingDraftIndex = draftIndex; renderInspector(); toast(t('toast.move', { name: state.draft[draftIndex].name })); }
    else if (action === 'remove-stop' && draftIndex >= 0) { finishRuler(); const [removed] = state.draft.splice(draftIndex, 1); state.movingDraftIndex = null; renderInspector(); renderDraft(); toast(t('toast.removed', { name: removed.name })); }
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
    if (target.dataset.travelFrom) {
      const station = stop(target.dataset.travelFrom);
      if (station) requestTravelFrom(station.pos, station.name);
      return;
    }
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
  $('undo-button').onclick = () => { if (!state.history.length) return; const daypart = state.daypart; Object.assign(state, normalizeScenario(parseScenario(state.history.pop()))); state.daypart = daypart; rebuildRouteCache(); persist(); renderList(); renderInspector(); renderMap(); scheduleStats(); toast(t('toast.undone')); };
  $('export-button').onclick = exportScenario;
  $('import-button').onclick = () => $('import-file').click();
  $('import-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > MAX_SCENARIO_BYTES) throw new Error(t('scenario.size'));
      const data = parseScenario(await file.text());
      if (data.region && data.region !== region.id) throw new Error(t('scenario.region', { other: data.region, name: localize(region.name) || region.name?.en || region.id }));
      if (![network.version, ...LEGACY_VERSIONS].includes(data.networkVersion)) throw new Error(t('scenario.version'));
      const warnings = [];
      const scenario = normalizeScenario(data, warning => warnings.push(warning));
      remember(); Object.assign(state, scenario); state.selected = null; state.selectedStop = null; state.tool = 'inspect'; changed(); toast(warnings.length ? warnings.join(' ') : data.networkVersion !== network.version ? t('toast.importedOld') : t('toast.imported'));
    } catch (err) { toast(err.message || t('toast.importFail')); }
    e.target.value = '';
  };
  $('reset-button').onclick = async () => {
    if (!await confirmDialog(t('confirm.reset'))) return;
    remember(); Object.assign(state, empty()); state.selected = null; state.selectedStop = null; state.tool = 'inspect'; state.draft = []; state.draftRing = false; changed(); toast(t('toast.restored'));
  };
  $('guide-button').onclick = openGuide; $('about-button').onclick = openData; $('model-link').onclick = openData;
  $('mobile-menu-button').onclick = () => {
    modal(`<span class="chip">${escape(t('menu.chip'))}</span><h2>${escape(t('menu.title'))}</h2><div class="mobile-menu-actions"><button data-mobile-action="guide-button">${escape(t('menu.guide'))}</button><button data-mobile-action="fullscreen-button">${escape(t('menu.fullscreen'))}</button><button data-mobile-action="settings-button">${escape(t('menu.settings'))}</button><button data-mobile-action="share-button">${escape(t('menu.share'))}</button><button data-mobile-action="slots-button">${escape(t('menu.slots'))}</button><button data-mobile-action="export-button">${escape(t('menu.export'))}</button><button data-mobile-action="import-button">${escape(t('menu.import'))}</button><button data-mobile-action="reset-button">${escape(t('menu.reset'))}</button><button data-mobile-action="about-button">${escape(t('menu.about'))}</button></div>`);
  };
  $('modal-content').onclick = e => {
    if (onSlotAction(e)) return;
    const button = e.target.closest('[data-mobile-action]');
    if (button) { const id = button.dataset.mobileAction; closeModal(); if (id === 'settings-button') openSettings(); else if (id === 'fullscreen-button') toggleFullscreen(); else $(id).click(); }
  };
  $('share-button').onclick = () => { shareScenario(); };
  $('slots-button').onclick = openSlots;
  $('modal-close').onclick = closeModal; $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
  document.onkeydown = async e => {
    if (e.key === 'Escape') {
      if ($('layers-menu').open) { $('layers-menu').open = false; $('layers-menu').querySelector('summary').focus(); return; }
      if (!$('map-context-menu').hidden) { closeContextMenu(); map.getCanvas().focus(); return; }
      if (!$('modal').hidden) { closeModal(); return; }
      if (rulerActive) { finishRuler(); return; }
      if (state.movingDraftIndex !== null) { state.movingDraftIndex = null; renderInspector(); toast(t('toast.moveCancel')); return; }
      if (state.selected || state.selectedStop) { clearSelection(); return; }
      if (state.tool !== 'inspect') {
        if (state.draft.length && !await confirmDialog(t('confirm.discard'))) return;
        state.tool = 'inspect'; state.draft = []; state.draftWaypoints = []; state.draftRing = false; state.draftMove = false; state.movingDraftIndex = null; state.editingRouteId = null; state.draftTemplate = null; state.draftMode = 'metro'; state.draftColor = colors.metro;
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
    if (!editing && state.tool === 'metro' && e.key === 'Backspace') {
      e.preventDefault();
      if (!state.draft.length) return;
      state.draft.pop();
      ensureWaypoints();
      renderInspector();
      renderDraft();
      return;
    }
    if (!editing && state.tool === 'metro' && e.key === 'Enter') {
      e.preventDefault();
      createMetro();
      return;
    }
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
  $('sim-clock').title = t('bottom.clockTitle');
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
    $('play-button').textContent = state.playing ? `Ⅱ ${t('bottom.pause')}` : `▶ ${t('bottom.play')}`;
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
      const tripMinutes = Math.max(4, length / (cruiseSpeed[r.mode] || 22) * 60);
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
  Object.assign(ctx, {
    $, state, allRoutes, lines, lineFor, routeColor, safeUrl, suggestLineColor, renderDraft, createMetro, editPlayerAlignment,
    colors, stop, network, sim, region, routeById, setRouteField, setRouteStops, revertLine, selectRoute, focusFlow, remember,
    changed, toast, map, enterMetroTool, enterLineTool, openData, format, compactMillions, maybeStartIntro, renderList,
    renderInspector, setMobileView, routeGeometry, draftCatchment, confirmDialog, nextDraftName, refreshBudget, activeChallenge,
    challengeAllowsMode, challengeAllowsNewLines, challengeAllowsPublishedEdit,
  });
  renderTemplates(); renderChallenges(); renderList(); renderInspector();
  document.addEventListener('pointerdown', e => {
    if (intro.active && intro.index === 0) return;
    if (!$('layers-menu').contains(e.target)) $('layers-menu').open = false;
  });
  const intro = { index: 0, active: false, started: false };
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
    $('intro-kicker').textContent = t('intro.kicker', { step: intro.index + 1 });
    $('intro-title').textContent = t(`intro.steps.${intro.index}.title`);
    $('intro-body').textContent = t(`intro.steps.${intro.index}.body`);
    $('intro-skip').textContent = t('intro.skip');
    $('intro-close').textContent = t('intro.close');
    $('intro-skip-step').textContent = t('intro.skipStep');
    $('intro-skip-step').hidden = intro.index !== 3;
    document.body.dataset.introStep = String(intro.index);
    if (intro.index === 0) $('layers-menu').open = true;
    if (intro.index === 1 && state.panelTab !== 'network') setPanelTab('network');
    if (intro.index === 2) setPanel('inspector', true);
    document.querySelectorAll('.intro-target').forEach(element => element.classList.remove('intro-target'));
    const target = introTarget();
    if (!target && intro.index === 1) { finishIntro(); toast(t('intro.missing')); return; }
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
  onLocale(() => {
    applyDom();
    paintRegion(region);
    renderFullscreen();
    renderPopulationControl();
    renderTemplates();
    renderList();
    renderInspector();
    if (state.stats) renderStats();
    if (intro.active) showIntro();
    $('play-button').textContent = state.playing ? `Ⅱ ${t('bottom.pause')}` : `▶ ${t('bottom.play')}`;
  });
  scheduleStats();
}

startApp();

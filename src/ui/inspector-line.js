import { html, raw } from '../html.js';
import { modeLabel } from '../modes.js';

export function renderLineInspector(ctx) {
  const { $, state, routeById, routeColor, safeUrl, network, region, sim, stop, suggestLineColor, setRouteField, setRouteStops, remember, changed, toast, map, enterMetroTool, openData } = ctx;
  const el = $('inspector-content');
  const selected = routeById(state.selected);
  $('inspector-peek-label').textContent = selected ? (selected.name?.slice(0, 3) || '↗') : '＋';
  $('inspector-peek-kind').textContent = 'line';
  if (!selected) {
    el.innerHTML = html`<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2></div><div class="inspector-hero"><span class="hero-mark">↗</span><h2>Make the network yours.</h2><p>Select any route on the map or in the list to adjust service. Or draw a metro line through the real city.</p><button class="primary" id="hero-metro">+ Draw metro line</button></div></div><div class="section"><div class="section-title"><h3>Source snapshot</h3></div><p class="source-note">${raw(network.sources.map(item => html`${item.name}: ${item.date || ''}`).join('<br>'))}<br>OpenStreetMap basemap</p><button id="inspector-data">View data and method ↗</button></div>`;
    $('hero-metro').onclick = enterMetroTool;
    $('inspector-data').onclick = openData;
    return;
  }
  const route = selected;
  const templateNote = route.templateId ? html`<p class="model-notice"><b>${route.templateStatus || 'Based on a historical proposal'}</b> · ${route.templateConfidence || 'Conceptual alignment'}<br>${route.templateDescription || 'This line began from a sourced regional concept.'}${raw(route.templateSourceUrl ? html`<br><a href="${safeUrl(route.templateSourceUrl)}" target="_blank" rel="noopener">${route.templateSourceTitle || 'Read proposal source'} ↗</a>` : '')}<br>Stations tagged schematic are approximate map anchors; line segments are direct and do not represent an engineered alignment.</p>` : '';
  const periodService = sim.resolveService(route, state.daypart);
  const intervalHelp = route.ring ? 'Continuous one direction service, returning from the last stop to the first.' : route.source === 'player' ? 'Service runs in both directions; return trips and cost are modeled. The interval stays the same in every period.' : !periodService.runs ? 'This pattern has no trips in the selected period.' : 'Interval for the selected period. Changing it replaces the interval in every period.';
  const sourceLine = route.source === 'pkm'
    ? `PKM Jaworzno timetable · ${route.stopIds.length} stops`
    : route.source === 'player'
      ? `Your ${modeLabel(route.mode).toLowerCase()} line`
      : `${region.feedLabels?.[route.source] || route.source} · ${route.stopIds.length} stops`;
  const pkmNote = route.source === 'pkm' ? html`<p class="model-notice">Main timetable sequence; branches are simplified.${route.unmappedStops?.length ? ` ${route.unmappedStops.length} stops without published map coordinates are omitted: ${[...new Set(route.unmappedStops)].join(', ')}.` : ''}</p>` : '';
  const stops = route.stopIds.map((id, index) => {
    const station = stop(id);
    return html`<div class="stop-row"><span class="stop-index">${index + 1}</span><button class="stop-name-button" type="button" data-inspect-stop="${id}" title="Inspect all service at this stop">${station?.name || id}${raw(station?.schematic ? '<small class="source-note">Schematic location</small>' : '')}</button><div class="stop-actions"><button data-stop-up="${index}" ${raw(index === 0 ? 'disabled' : '')} title="Move earlier">↑</button><button data-stop-down="${index}" ${raw(index === route.stopIds.length - 1 ? 'disabled' : '')} title="Move later">↓</button><button data-stop-remove="${index}" ${raw(route.stopIds.length <= 2 ? 'disabled' : '')} title="Remove stop">×</button></div></div>`;
  }).join('');
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>LINE INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close line inspector">×</button><span class="chip mode-${route.mode}">${modeLabel(route.mode)}</span></div><div class="inspector-line-title"><span class="line-badge" style="background:${routeColor(route)}">${route.name}</span><div><h2>${route.longName || route.name}</h2><small>${sourceLine}</small></div></div>${raw(templateNote)}${raw(pkmNote)}${raw(route.edited ? '<p class="model-notice">Stop edits use direct geometry between stops; street or track alignment is not recalculated.</p>' : '')}<div class="form-stack"><label>Service interval · minutes<input id="route-headway" type="number" min="3" max="120" value="${periodService.headway}"><small>${intervalHelp}</small></label><div class="form-row"><label>Line color<input id="route-color" type="color" value="${routeColor(route)}"></label><button type="button" id="suggest-route-color">Suggest color</button></div>${raw(route.source === 'player' ? html`<label class="toggle-row"><input id="route-ring" type="checkbox" ${raw(route.ring ? 'checked' : '')} ${raw(route.stopIds.length < 3 ? 'disabled' : '')}> Ring line · one continuous direction</label>` : '')}<label class="toggle-row"><input id="route-active" type="checkbox" ${raw(route.active === false ? '' : 'checked')}> Line in service</label></div><div class="toolbar"><button id="add-stop-button">+ Add existing stop</button>${raw(route.ring ? '<button id="reverse-ring-button" type="button">Reverse ring direction</button>' : '')}${raw(route.source === 'player' ? html`<button id="delete-route-button" class="danger">Delete ${modeLabel(route.mode).toLowerCase()} line</button>` : '<button id="revert-route-button">Revert line</button>')}</div></div><div class="section"><div class="section-title"><h3>Stop sequence</h3><span class="value">${route.stopIds.length}</span></div><div class="stop-list">${raw(stops)}</div></div>`;
  $('route-color').onchange = event => setRouteField(route, 'color', event.target.value);
  $('suggest-route-color').onclick = () => setRouteField(route, 'color', suggestLineColor(route.stopIds.map(stop).filter(Boolean).map(station => station.pos)));
  $('route-headway').onchange = event => setRouteField(route, 'headway', Math.max(3, Math.min(120, Number(event.target.value) || route.headway)));
  el.querySelectorAll('[data-stop-up], [data-stop-down], [data-stop-remove]').forEach(button => {
    const index = Number(button.dataset.stopUp ?? button.dataset.stopDown ?? button.dataset.stopRemove);
    const stopName = stop(route.stopIds[index])?.name || 'stop';
    const label = button.hasAttribute('data-stop-up') ? `Move ${stopName} earlier` : button.hasAttribute('data-stop-down') ? `Move ${stopName} later` : `Remove ${stopName}`;
    button.setAttribute('aria-label', label);
  });
  const ringToggle = $('route-ring');
  if (ringToggle) ringToggle.onchange = event => {
    remember();
    const index = state.customRoutes.findIndex(item => item.id === route.id);
    state.customRoutes[index] = { ...state.customRoutes[index], ring: event.target.checked, geometry: ctx.routeGeometry(route.stopIds, event.target.checked), edited: true };
    changed();
  };
  $('route-active').onchange = event => setRouteField(route, 'active', event.target.checked);
  const reverseRing = $('reverse-ring-button');
  if (reverseRing) reverseRing.onclick = () => setRouteStops(route, [route.stopIds[0], ...route.stopIds.slice(1).reverse()]);
  $('add-stop-button').onclick = () => { state.tool = 'add-stop'; ctx.setMobileView('map'); map.getCanvas().style.cursor = 'crosshair'; toast('Click an existing stop on the map to insert it into this line.'); };
  const revert = $('revert-route-button');
  if (revert) revert.onclick = () => { remember(); delete state.overrides[route.id]; changed(); toast('Line restored from source snapshot.'); };
  const del = $('delete-route-button');
  if (del) del.onclick = () => { remember(); state.customRoutes = state.customRoutes.filter(item => item.id !== route.id); state.customStops = state.customStops.filter(station => !station.id.startsWith(route.id + ':')); state.selected = null; changed(); toast(`${modeLabel(route.mode)} line deleted.`); };
}

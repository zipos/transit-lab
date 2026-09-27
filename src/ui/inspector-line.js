import { html, raw } from '../html.js';
import { t, localize } from '../i18n/index.js';

export function renderLineInspector(ctx) {
  const { $, state, routeById, routeColor, safeUrl, network, region, sim, stop, suggestLineColor, setRouteField, setRouteStops, remember, changed, toast, map, enterMetroTool, openData } = ctx;
  const el = $('inspector-content');
  const selected = routeById(state.selected);
  $('inspector-peek-label').textContent = selected ? (selected.name?.slice(0, 3) || '↗') : '＋';
  $('inspector-peek-kind').textContent = t('line.kind');
  if (!selected) {
    el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('line.chip')}</h2></div><div class="inspector-hero"><span class="hero-mark">↗</span><h2>${t('line.hero')}</h2><p>${t('line.heroBody')}</p><button class="primary" id="hero-metro">${t('line.draw')}</button></div></div><div class="section"><div class="section-title"><h3>${t('line.source')}</h3></div><p class="source-note">${raw(network.sources.map(item => html`${item.name}: ${item.date || ''}`).join('<br>'))}<br>${t('line.basemap')}</p><button id="inspector-data">${t('line.data')}</button></div>`;
    $('hero-metro').onclick = enterMetroTool;
    $('inspector-data').onclick = openData;
    return;
  }
  const route = selected;
  const templateNote = route.templateId ? html`<p class="model-notice"><b>${localize(route.templateStatus) || t('line.templateFallback')}</b> · ${localize(route.templateConfidence) || t('draft.confidence')}<br>${localize(route.templateDescription) || t('line.templateBody')}${raw(route.templateSourceUrl ? html`<br><a href="${safeUrl(route.templateSourceUrl)}" target="_blank" rel="noopener">${route.templateSourceTitle || t('line.read')} ↗</a>` : '')}<br>${t('line.schematicNote')}</p>` : '';
  const periodService = sim.resolveService(route, state.daypart);
  const intervalHelp = route.ring ? t('line.ringHelp') : route.source === 'player' ? t('line.playerHelp') : !periodService.runs ? t('line.offHelp') : t('line.editHelp');
  const sourceLine = route.source === 'pkm'
    ? t('line.pkm', { count: route.stopIds.length })
    : route.source === 'player'
      ? t('line.yours', { mode: t('mode.' + route.mode).toLowerCase() })
      : `${region.feedLabels?.[route.source] || route.source} · ${t('line.stops', { count: route.stopIds.length })}`;
  const pkmNote = route.source === 'pkm' ? html`<p class="model-notice">${t('line.pkmBody')}${route.unmappedStops?.length ? t('line.unmapped', { count: route.unmappedStops.length, names: [...new Set(route.unmappedStops)].join(', ') }) : ''}</p>` : '';
  const stops = route.stopIds.map((id, index) => {
    const station = stop(id);
    return html`<div class="stop-row"><span class="stop-index">${index + 1}</span><button class="stop-name-button" type="button" data-inspect-stop="${id}" title="${t('line.inspectStop')}">${station?.name || id}${raw(station?.schematic ? html`<small class="source-note">${t('line.schematic')}</small>` : '')}</button><div class="stop-actions"><button data-stop-up="${index}" ${raw(index === 0 ? 'disabled' : '')} title="${t('line.earlier')}">↑</button><button data-stop-down="${index}" ${raw(index === route.stopIds.length - 1 ? 'disabled' : '')} title="${t('line.later')}">↓</button><button data-stop-remove="${index}" ${raw(route.stopIds.length <= 2 ? 'disabled' : '')} title="${t('line.remove')}">×</button></div></div>`;
  }).join('');
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('line.chip')}</h2><button class="selection-close" type="button" data-clear-selection aria-label="${t('line.close')}">×</button><span class="chip mode-${route.mode}">${t('mode.' + route.mode)}</span></div><div class="inspector-line-title"><span class="line-badge" style="background:${routeColor(route)}">${route.name}</span><div><h2>${localize(route.longName) || route.name}</h2><small>${sourceLine}</small></div></div>${raw(templateNote)}${raw(pkmNote)}${raw(route.edited ? html`<p class="model-notice">${t('line.edited')}</p>` : '')}<div class="form-stack"><label>${t('line.interval')}<input id="route-headway" type="number" min="3" max="120" value="${periodService.headway}"><small>${intervalHelp}</small></label><div class="form-row"><label>${t('line.color')}<input id="route-color" type="color" value="${routeColor(route)}"></label><button type="button" id="suggest-route-color">${t('line.suggest')}</button></div>${raw(route.source === 'player' ? html`<label class="toggle-row"><input id="route-ring" type="checkbox" ${raw(route.ring ? 'checked' : '')} ${raw(route.stopIds.length < 3 ? 'disabled' : '')}> ${t('line.ring')}</label>` : '')}<label class="toggle-row"><input id="route-active" type="checkbox" ${raw(route.active === false ? '' : 'checked')}> ${t('line.active')}</label></div><div class="toolbar"><button id="add-stop-button">${t('line.add')}</button>${raw(route.ring ? html`<button id="reverse-ring-button" type="button">${t('line.reverse')}</button>` : '')}${raw(route.source === 'player' ? html`<button id="delete-route-button" class="danger">${t('line.delete', { mode: t('mode.' + route.mode).toLowerCase() })}</button>` : html`<button id="revert-route-button">${t('line.revert')}</button>`)}</div></div><div class="section"><div class="section-title"><h3>${t('line.sequence')}</h3><span class="value">${route.stopIds.length}</span></div><div class="stop-list">${raw(stops)}</div></div>`;
  $('route-color').onchange = event => setRouteField(route, 'color', event.target.value);
  $('suggest-route-color').onclick = () => setRouteField(route, 'color', suggestLineColor(route.stopIds.map(stop).filter(Boolean).map(station => station.pos)));
  $('route-headway').onchange = event => setRouteField(route, 'headway', Math.max(3, Math.min(120, Number(event.target.value) || route.headway)));
  el.querySelectorAll('[data-stop-up], [data-stop-down], [data-stop-remove]').forEach(button => {
    const index = Number(button.dataset.stopUp ?? button.dataset.stopDown ?? button.dataset.stopRemove);
    const stopName = stop(route.stopIds[index])?.name || t('stop.fallback');
    const label = button.hasAttribute('data-stop-up') ? t('line.moveEarlier', { name: stopName }) : button.hasAttribute('data-stop-down') ? t('line.moveLater', { name: stopName }) : t('line.removeNamed', { name: stopName });
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
  $('add-stop-button').onclick = () => { state.tool = 'add-stop'; ctx.setMobileView('map'); map.getCanvas().style.cursor = 'crosshair'; toast(t('toast.insert')); };
  const revert = $('revert-route-button');
  if (revert) revert.onclick = () => { remember(); delete state.overrides[route.id]; changed(); toast(t('toast.lineRestored')); };
  const del = $('delete-route-button');
  if (del) del.onclick = () => { remember(); state.customRoutes = state.customRoutes.filter(item => item.id !== route.id); state.customStops = state.customStops.filter(station => !station.id.startsWith(route.id + ':')); state.selected = null; changed(); toast(t('toast.deleted', { mode: t('mode.' + route.mode) })); };
}

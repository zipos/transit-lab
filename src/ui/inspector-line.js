import { html, raw } from '../html.js';
import { t, localize, fmtDecimal } from '../i18n/index.js?v=2026-10-09-budget';
import { combinedHeadway } from '../lines.js?v=2026-09-28-share2';

function formatCombined(services) {
  const running = services.filter(service => service.runs && service.headway > 0);
  if (!running.length) return t('stop.off');
  if (running.length === 1) return t('stop.every', { minutes: running[0].headway });
  const minutes = String(fmtDecimal(combinedHeadway(running.map(service => service.headway)), 1)).replace(/[.,]0$/, '');
  return t('line.everyCombined', { minutes });
}

function mirrorPlan(line, route, stop) {
  const opposite = line.directions.find(([dir]) => dir !== String(route.direction ?? '0'));
  if (!opposite || !route.edited) return null;
  const target = opposite[1][0];
  const used = new Set();
  const mapped = [];
  for (const id of route.stopIds) {
    const area = stop(id)?.area;
    if (!area) return null;
    const match = target.stopIds.find(otherId => !used.has(otherId) && stop(otherId)?.area === area);
    if (!match) return null;
    used.add(match);
    mapped.push(match);
  }
  if (mapped.length < 2) return null;
  return { target, stopIds: mapped.reverse() };
}

export function renderLineInspector(ctx) {
  const {
    $, state, routeById, routeColor, safeUrl, network, region, sim, stop, suggestLineColor, setRouteField, setRouteStops,
    lineFor, selectRoute, revertLine, toast, map, enterMetroTool, openData, activeChallenge, challengeAllowsNewLines,
    challengeAllowsPublishedEdit,
  } = ctx;
  const challenge = typeof activeChallenge === 'function' ? activeChallenge() : null;
  const canDraw = !challenge || challengeAllowsNewLines?.(challenge);
  const el = $('inspector-content');
  const selected = routeById(state.selected);
  const line = selected ? lineFor(selected.id) : null;
  $('inspector-peek-label').textContent = selected ? (selected.name?.slice(0, 3) || '↗') : '＋';
  $('inspector-peek-kind').textContent = t('line.kind');
  if (!selected || !line) {
    el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('line.chip')}</h2></div><div class="inspector-hero"><span class="hero-mark">↗</span><h2>${t('line.hero')}</h2><p>${t('line.heroBody')}</p>${raw(canDraw ? html`<button class="primary" id="hero-metro">${t('line.draw')}</button>` : html`<p class="fine-print">${t('network.challengeNoNewLines')}</p>`)}</div></div><div class="section"><div class="section-title"><h3>${t('line.source')}</h3></div><p class="source-note">${raw(network.sources.map(item => html`${item.name}: ${item.date || ''}`).join('<br>'))}<br>${t('line.basemap')}</p><button id="inspector-data">${t('line.data')}</button></div>`;
    if (canDraw) $('hero-metro').onclick = enterMetroTool;
    $('inspector-data').onclick = openData;
    return;
  }
  const route = selected;
  const activeDir = String(route.direction ?? '0');
  const directionPatterns = line.directions.find(([dir]) => dir === activeDir)?.[1] || [route];
  const services = line.patterns.map(pattern => pattern.active === false ? { runs: false, headway: pattern.headway } : sim.resolveService(pattern, state.daypart));
  const periodService = sim.resolveService(route, state.daypart);
  const templateNote = route.templateId ? html`<p class="model-notice"><b>${localize(route.templateStatus) || t('line.templateFallback')}</b> · ${localize(route.templateConfidence) || t('draft.confidence')}<br>${localize(route.templateDescription) || t('line.templateBody')}${raw(route.templateSourceUrl ? html`<br><a href="${safeUrl(route.templateSourceUrl)}" target="_blank" rel="noopener">${route.templateSourceTitle || t('line.read')} ↗</a>` : '')}<br>${t('line.schematicNote')}</p>` : '';
  const sourceLine = route.source === 'pkm'
    ? t('line.pkm', { count: route.stopIds.length })
    : route.source === 'player'
      ? t('line.yours', { mode: t('mode.' + route.mode).toLowerCase() })
      : `${region.feedLabels?.[route.source] || route.source} · ${t('line.stops', { count: route.stopIds.length })}`;
  const tabs = line.directions.map(([dir, patterns]) => {
    const shown = dir === activeDir ? route : patterns[0];
    const destination = stop(shown.stopIds.at(-1))?.name || dir;
    return html`<button type="button" data-line-direction="${patterns[0].id}" aria-pressed="${dir === activeDir}">${t('line.directionTo', { name: destination })}</button>`;
  }).join('');
  const variantOptions = directionPatterns.length > 1 ? html`<label>${t('line.variant')}<select id="line-variant">${raw(directionPatterns.map(pattern => {
    const destination = stop(pattern.stopIds.at(-1))?.name || pattern.id;
    return `<option value="${pattern.id}" ${pattern.id === route.id ? 'selected' : ''}>${destination} · ${pattern.stopIds.length}</option>`;
  }).join(''))}</select></label>` : '';
  const flow = state.stats?.flows?.routes?.[route.id];
  const load = flow ? Math.round(flow.vc * 100) : 0;
  const tone = !flow ? '#9aa8b5' : flow.vc > 1 ? '#c4493a' : flow.vc > 0.8 ? '#d0892f' : '#2f9e78';
  const flowHtml = !state.stats?.flows
    ? html`<p class="fine-print">${t('line.flowPending')}</p>`
    : flow
      ? html`<div class="flow-card"><div class="load-bar" title="${t('line.peakLoad', { load })}"><span style="width:${Math.min(100, load)}%;background:${tone}"></span></div><p><b>${ctx.format(Math.round(flow.riders))}</b> ${t('line.riders')}</p><p class="fine-print">${t('line.busiest', { from: flow.fromName || '—', to: flow.toName || '—' })} · ${t('line.peakLoad', { load })}</p></div>`
      : '';
  if (state.budgetMode && typeof ctx.refreshBudget === 'function' && !state.budgetSummary) ctx.refreshBudget();
  const budgetLine = state.budgetMode && state.budgetSummary?.lines?.[route.id];
  const budgetHtml = budgetLine
    ? route.source === 'player'
      ? html`<p class="fine-print budget-line"><b>${ctx.compactMillions(budgetLine.capital)}</b> ${t('line.capital')} · <b>${ctx.compactMillions(Math.round(budgetLine.operating))}</b> ${t('line.operating')} · ${t('line.fleet', { count: budgetLine.fleet })}</p>`
      : html`<p class="fine-print budget-line"><b>${ctx.compactMillions(Math.round(budgetLine.operating))}</b> ${t('line.operating')} · ${t('line.fleet', { count: budgetLine.fleet })}${raw(budgetLine.fleetDelta ? html` · ${t('line.fleetDelta', { count: budgetLine.fleetDelta })}` : '')}</p>`
    : '';
  const mirror = mirrorPlan(line, route, stop);
  const stops = route.stopIds.map((id, index) => {
    const station = stop(id);
    return html`<div class="stop-row"><span class="stop-index">${index + 1}</span><button class="stop-name-button" type="button" data-inspect-stop="${id}" title="${t('line.inspectStop')}">${station?.name || id}${raw(station?.schematic ? html`<small class="source-note">${t('line.schematic')}</small>` : '')}</button><div class="stop-actions"><button data-stop-up="${index}" ${raw(index === 0 ? 'disabled' : '')} title="${t('line.earlier')}">↑</button><button data-stop-down="${index}" ${raw(index === route.stopIds.length - 1 ? 'disabled' : '')} title="${t('line.later')}">↓</button><button data-stop-remove="${index}" ${raw(route.stopIds.length <= 2 ? 'disabled' : '')} title="${t('line.remove')}">×</button></div></div>`;
  }).join('');
  const publishedLocked = route.source !== 'player' && challenge && challengeAllowsPublishedEdit && !challengeAllowsPublishedEdit(challenge);
  const editPublished = route.source !== 'player' && !publishedLocked;
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('line.chip')}</h2><button class="selection-close" type="button" data-clear-selection aria-label="${t('line.close')}">×</button><span class="chip mode-${route.mode}">${t('mode.' + route.mode)}</span></div><div class="inspector-line-title"><span class="line-badge" style="background:${routeColor(route)}">${line.name}</span><div><h2>${line.terminals}</h2><small>${formatCombined(services)} · ${sourceLine}</small></div></div>${raw(flowHtml)}${raw(budgetHtml)}<div class="toolbar line-directions">${raw(tabs)}</div>${raw(templateNote)}${raw(publishedLocked ? html`<p class="model-notice">${t('toast.challengePublished')}</p>` : '')}<div class="form-stack">${raw(variantOptions)}<label>${t('line.interval')}<input id="route-headway" type="number" min="3" max="120" value="${periodService.headway}" ${raw(publishedLocked ? 'disabled' : '')}><small>${state.lineIntervalOnly ? t('line.patternInterval') : t('line.lineInterval')}</small></label><label class="toggle-row"><input id="line-interval-only" type="checkbox" ${raw(state.lineIntervalOnly ? 'checked' : '')}> ${t('line.onlyDirection')}</label><div class="form-row"><label>${t('line.color')}<input id="route-color" type="color" value="${routeColor(route)}" ${raw(publishedLocked ? 'disabled' : '')}></label><button type="button" id="suggest-route-color" ${raw(publishedLocked ? 'disabled' : '')}>${t('line.suggest')}</button></div>${raw(route.source === 'player' ? html`<label class="toggle-row"><input id="route-ring" type="checkbox" ${raw(route.ring ? 'checked' : '')} ${raw(route.stopIds.length < 3 ? 'disabled' : '')}> ${t('line.ring')}</label>` : '')}<label class="toggle-row"><input id="route-active" type="checkbox" ${raw(route.active === false ? '' : 'checked')} ${raw(publishedLocked ? 'disabled' : '')}> ${t('line.active')}</label></div><div class="toolbar">${raw(route.source === 'player' && canDraw ? html`<button id="add-stop-button">${t('line.add')}</button>` : '')}${raw(route.source === 'player' ? html`<button id="edit-alignment-button" type="button">${t('line.editAlignment')}</button>` : '')}${raw(mirror && editPublished ? html`<button id="mirror-line-button" type="button">${t('line.mirror')}</button>` : '')}${raw(route.ring ? html`<button id="reverse-ring-button" type="button">${t('line.reverse')}</button>` : '')}${raw(route.source === 'player' ? html`<button id="delete-route-button" class="danger">${t('line.delete', { mode: t('mode.' + route.mode).toLowerCase() })}</button>` : editPublished ? html`<button id="revert-route-button">${t('line.revert')}</button>` : '')}</div></div><div class="section"><div class="section-title"><h3>${t('line.sequence')}</h3><span class="value">${route.stopIds.length}</span></div><div class="stop-list">${raw(stops)}</div></div>`;
  $('route-color').onchange = event => setRouteField(route, 'color', event.target.value);
  $('suggest-route-color').onclick = () => setRouteField(route, 'color', suggestLineColor(route.stopIds.map(stop).filter(Boolean).map(station => station.pos)));
  $('route-headway').onchange = event => setRouteField(route, 'headway', Math.max(3, Math.min(120, Number(event.target.value) || route.headway)));
  $('line-interval-only').onchange = event => { state.lineIntervalOnly = event.target.checked; ctx.renderInspector(); };
  el.querySelectorAll('[data-line-direction]').forEach(button => {
    button.onclick = () => selectRoute(button.dataset.lineDirection, { fit: false });
  });
  const variant = $('line-variant');
  if (variant) variant.onchange = event => selectRoute(event.target.value, { fit: false });
  el.querySelectorAll('[data-stop-up], [data-stop-down], [data-stop-remove]').forEach(button => {
    const index = Number(button.dataset.stopUp ?? button.dataset.stopDown ?? button.dataset.stopRemove);
    const stopName = stop(route.stopIds[index])?.name || t('stop.fallback');
    button.setAttribute('aria-label', button.hasAttribute('data-stop-up') ? t('line.moveEarlier', { name: stopName }) : button.hasAttribute('data-stop-down') ? t('line.moveLater', { name: stopName }) : t('line.removeNamed', { name: stopName }));
  });
  const ringToggle = $('route-ring');
  if (ringToggle) ringToggle.onchange = event => {
    ctx.remember();
    const index = state.customRoutes.findIndex(item => item.id === route.id);
    state.customRoutes[index] = { ...state.customRoutes[index], ring: event.target.checked, geometry: ctx.routeGeometry(route.stopIds, event.target.checked), edited: true };
    ctx.changed();
  };
  $('route-active').onchange = event => setRouteField(route, 'active', event.target.checked);
  const reverseRing = $('reverse-ring-button');
  if (reverseRing) reverseRing.onclick = () => setRouteStops(route, [route.stopIds[0], ...route.stopIds.slice(1).reverse()]);
  $('add-stop-button').onclick = () => { state.tool = 'add-stop'; ctx.setMobileView('map'); map.getCanvas().style.cursor = 'crosshair'; toast(t('toast.insert')); };
  const editAlignment = $('edit-alignment-button');
  if (editAlignment) editAlignment.onclick = () => ctx.editPlayerAlignment(route);
  const mirrorButton = $('mirror-line-button');
  if (mirrorButton && mirror) mirrorButton.onclick = () => setRouteStops(mirror.target, mirror.stopIds);
  const revert = $('revert-route-button');
  if (revert) revert.onclick = () => { revertLine(route); toast(t('toast.lineRestored')); };
  const del = $('delete-route-button');
  if (del) del.onclick = () => { ctx.remember(); state.customRoutes = state.customRoutes.filter(item => item.id !== route.id); state.customStops = state.customStops.filter(station => !station.id.startsWith(route.id + ':')); state.selected = null; ctx.changed(); toast(t('toast.deleted', { mode: t('mode.' + route.mode) })); };
}

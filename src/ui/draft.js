import { html, raw } from '../html.js';
import { t, localize, fmtDecimal } from '../i18n/index.js?v=2026-10-09-shell';
import { modes } from '../modes.js?v=2026-09-28-builder';

const MODE_ORDER = ['metro', 'tram', 'bus', 'rail'];

export function renderDraftInspector(ctx) {
  const { $, state, colors, safeUrl, suggestLineColor, renderDraft, renderInspector, createMetro, map, draftCatchment, confirmDialog, activeChallenge, challengeAllowsMode, enterLineTool, toast } = ctx;
  if (state.tool !== 'metro') return false;
  const el = $('inspector-content');
  $('inspector-peek-label').textContent = '✎';
  $('inspector-peek-kind').textContent = t('draft.kind');
  const mode = t('mode.' + state.draftMode);
  const template = state.draftTemplate;
  const spec = modes[state.draftMode] || modes.metro;
  const catchment = typeof draftCatchment === 'function' ? draftCatchment() : null;
  const sourceNote = template ? html`<div class="section"><p><b>${localize(template.status) || t('draft.status')}</b> · ${localize(template.confidence) || t('draft.confidence')}</p><p>${localize(template.description) || ''}</p><p><a href="${safeUrl(template.sourceUrl || '#')}" target="_blank" rel="noopener">${template.sourceTitle || t('draft.source')} ↗</a></p><p class="fine-print">${t('draft.fine')} ${raw(template.stationCoordinateSourceUrl ? html`${t('draft.coords')} <a href="${safeUrl(template.stationCoordinateSourceUrl)}" target="_blank" rel="noopener">${t('draft.coordLink')}</a>` : '')}</p></div>` : '';
  const heading = state.editingRouteId
    ? t('draft.editOpen', { mode: mode.toLowerCase() })
    : template
      ? t('draft.edit', { mode: mode.toLowerCase() })
      : t('draft.headingMode', { mode: mode.toLowerCase() });
  const intro = state.movingDraftIndex !== null
    ? t('draft.move', { name: state.draft[state.movingDraftIndex]?.name || t('draft.station') })
    : template
      ? t('draft.sourced')
      : t('draft.tap');
  const routeNote = (template ? t('draft.templateNote') : t('draft.directNote', { mode: mode.toLowerCase() }))
    + (state.draftRing ? t('draft.ringNote') : '')
    + t('draft.editHints');
  const challenge = typeof activeChallenge === 'function' ? activeChallenge() : null;
  const allowedModes = challenge?.constraints?.modes?.length
    ? MODE_ORDER.filter(id => challengeAllowsMode?.(challenge, id))
    : MODE_ORDER;
  const modePicker = allowedModes.length
    ? html`<div class="mode-picker" role="group" aria-label="${t('draft.mode')}">${raw(allowedModes.map(id => html`<button type="button" data-draft-mode="${id}" aria-pressed="${id === state.draftMode}" class="chip mode-${id}">${t('mode.' + id)}</button>`).join(''))}</div>`
    : '';
  const vehicleOptions = (spec.vehicleOptions || []).map(id => html`<option value="${id}" ${raw(id === state.draftVehicle ? 'selected' : '')}>${t('vehicle.' + id)}</option>`).join('');
  const alignmentOptions = (spec.alignmentOptions || []).map(id => html`<option value="${id}" ${raw(id === state.draftAlignment ? 'selected' : '')}>${t('alignment.' + id)}</option>`).join('');
  const stations = state.draft.map((station, index) => html`<div class="stop-row"><span class="stop-index">${index + 1}</span><span title="${localize(station.coordinateNote) || ''}">${station.name}${raw(station.stopId ? html`<small class="source-note">${t('draft.shared')}</small>` : station.schematic ? html`<small class="source-note">${t('draft.schematic')}</small>` : '')}</span><button data-draft-remove="${index}" title="${t('draft.removeStation')}">×</button></div>`).join('');
  const spacingWarn = catchment?.tooClose
    ? html`<p class="model-notice">${t('draft.spacingWarn', { meters: Math.round((spec.stopSpacingHint || 400) * 0.5) })}</p>`
    : '';
  const live = catchment ? html`<div class="draft-live"><div><b>${ctx.format(catchment.residents)}</b> ${t('draft.catchment')}</div><div><b>${ctx.format(catchment.newlyRapid)}</b> ${t('draft.newRapid')}</div><div><b>${fmtDecimal(catchment.km, 1)} km</b> · ${fmtDecimal(catchment.minutes, 0)} min ${t('draft.oneWay')}</div></div>` : '';
  el.innerHTML = html`<div class="section sticky-draft"><div class="section-title"><h2>${template ? t('draft.proposal') : state.editingRouteId ? t('draft.editTitle') : t('draft.new')}</h2><span class="chip mode-${state.draftMode}">${mode}</span></div><h2 class="inspector-heading">${heading}</h2><p class="intro">${intro}</p>${raw(modePicker)}<div class="form-stack"><label>${t('draft.name')}<input id="metro-name" maxlength="18" value="${state.draftName}"></label><div class="form-row"><label>${t('draft.every')}<input id="metro-headway" type="number" min="3" max="60" value="${state.draftHeadway}"></label><label>${t('draft.color')}<input id="metro-color" type="color" value="${state.draftColor}"></label></div><label>${t('draft.vehicle')}<select id="draft-vehicle">${raw(vehicleOptions)}</select></label><label>${t('draft.alignment')}<select id="draft-alignment">${raw(alignmentOptions)}</select></label><button type="button" id="suggest-draft-color">${t('draft.suggest')}</button><label class="toggle-row"><input id="draft-move" type="checkbox" ${raw(state.draftMove ? 'checked' : '')}> ${t('draft.moveTool')}</label><label class="toggle-row"><input id="draft-ring" type="checkbox" ${raw(state.draftRing ? 'checked' : '')}> ${t('draft.ring')}</label><small>${t('draft.ringHelp')}</small></div>${raw(live)}${raw(spacingWarn)}<div class="toolbar draft-actions"><button id="cancel-metro">${t('draft.cancel')}</button><button id="finish-metro" class="primary" ${raw(state.draft.length < (state.draftRing ? 3 : 2) ? 'disabled' : '')}>${state.editingRouteId ? t('draft.save') : t('draft.open')}</button></div></div>${raw(sourceNote)}<div class="section"><div class="section-title"><h3>${t('draft.stations')}</h3><span class="value">${state.draft.length}</span></div><div class="stop-list">${raw(stations || html`<p class="empty-state">${t('draft.empty')}</p>`)}</div></div><div class="section"><p class="fine-print">${routeNote}</p></div>`;
  $('metro-name').oninput = event => { state.draftName = event.target.value; };
  $('metro-headway').onchange = event => { state.draftHeadway = Math.max(3, Math.min(60, Number(event.target.value) || spec.defaultHeadway || 8)); };
  $('metro-color').oninput = event => { state.draftColor = event.target.value; renderDraft(); };
  $('suggest-draft-color').onclick = () => { state.draftColor = suggestLineColor(state.draft.map(station => station.pos)); $('metro-color').value = state.draftColor; renderDraft(); };
  $('draft-ring').onchange = event => { state.draftRing = event.target.checked; renderInspector(); renderDraft(); };
  $('draft-move').onchange = event => { state.draftMove = event.target.checked; map.getCanvas().style.cursor = state.draftMove ? 'grab' : 'crosshair'; };
  $('draft-vehicle').onchange = event => { state.draftVehicle = event.target.value; };
  $('draft-alignment').onchange = event => { state.draftAlignment = event.target.value; };
  el.querySelectorAll('[data-draft-mode]').forEach(button => {
    button.onclick = () => {
      if (template) return;
      const next = button.dataset.draftMode;
      if (!modes[next] || next === state.draftMode) return;
      if (challenge && challengeAllowsMode && !challengeAllowsMode(challenge, next)) {
        toast?.(t('toast.challengeMode'));
        return;
      }
      if (typeof enterLineTool === 'function') {
        enterLineTool(next);
        return;
      }
      state.draftMode = next;
      const nextSpec = modes[next];
      state.draftVehicle = nextSpec.vehicleOptions[0];
      state.draftAlignment = nextSpec.alignmentOptions[0];
      state.draftHeadway = nextSpec.defaultHeadway;
      state.draftColor = suggestLineColor(state.draft.map(station => station.pos)) || colors[next];
      if (!state.editingRouteId && !state.draftName) state.draftName = ctx.nextDraftName(next);
      renderInspector();
      renderDraft();
    };
  });
  el.querySelectorAll('[data-draft-remove]').forEach(button => {
    const station = state.draft[Number(button.dataset.draftRemove)];
    button.setAttribute('aria-label', t('draft.remove', { name: station?.name || t('draft.station') }));
  });
  $('finish-metro').onclick = createMetro;
  $('cancel-metro').onclick = async () => {
    if (state.draft.length && confirmDialog && !await confirmDialog(t('confirm.discard'))) return;
    state.tool = 'inspect';
    state.draft = [];
    state.draftWaypoints = [];
    state.draftRing = false;
    state.draftMove = false;
    state.movingDraftIndex = null;
    state.editingRouteId = null;
    state.draftTemplate = null;
    state.draftMode = 'metro';
    state.draftVehicle = 'metro6';
    state.draftAlignment = 'tunnel';
    state.draftColor = colors.metro;
    map.getCanvas().style.cursor = '';
    renderInspector();
    renderDraft();
  };
  return true;
}

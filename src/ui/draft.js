import { html, raw } from '../html.js';
import { t, localize } from '../i18n/index.js?v=2026-09-28-share2';

export function renderDraftInspector(ctx) {
  const { $, state, colors, safeUrl, suggestLineColor, renderDraft, renderInspector, createMetro, map } = ctx;
  if (state.tool !== 'metro') return false;
  const el = $('inspector-content');
  $('inspector-peek-label').textContent = '✎';
  $('inspector-peek-kind').textContent = t('draft.kind');
  const mode = t('mode.' + state.draftMode);
  const template = state.draftTemplate;
  const sourceNote = template ? html`<div class="section"><p><b>${localize(template.status) || t('draft.status')}</b> · ${localize(template.confidence) || t('draft.confidence')}</p><p>${localize(template.description) || ''}</p><p><a href="${safeUrl(template.sourceUrl || '#')}" target="_blank" rel="noopener">${template.sourceTitle || t('draft.source')} ↗</a></p><p class="fine-print">${t('draft.fine')} ${raw(template.stationCoordinateSourceUrl ? html`${t('draft.coords')} <a href="${safeUrl(template.stationCoordinateSourceUrl)}" target="_blank" rel="noopener">${t('draft.coordLink')}</a>` : '')}</p></div>` : '';
  const heading = template ? t('draft.edit', { mode: mode.toLowerCase() }) : t('draft.heading');
  const intro = state.movingDraftIndex !== null ? t('draft.move', { name: state.draft[state.movingDraftIndex]?.name || t('draft.station') }) : template ? t('draft.sourced') : t('draft.tap');
  const routeNote = (template ? t('draft.templateNote') : t('draft.metroNote')) + (state.draftRing ? t('draft.ringNote') : '') + t('draft.rightClick');
  const stations = state.draft.map((station, index) => html`<div class="stop-row"><span class="stop-index">${index + 1}</span><span title="${localize(station.coordinateNote) || ''}">${station.name}${raw(station.schematic ? html`<small class="source-note">${t('draft.schematic')}</small>` : '')}</span><button data-draft-remove="${index}" title="${t('draft.removeStation')}">×</button></div>`).join('');
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${template ? t('draft.proposal') : t('draft.new')}</h2><span class="chip mode-${state.draftMode}">${mode}</span></div><h2 class="inspector-heading">${heading}</h2><p class="intro">${intro}</p><div class="form-stack"><label>${t('draft.name')}<input id="metro-name" maxlength="18" value="${state.draftName}"></label><div class="form-row"><label>${t('draft.every')}<input id="metro-headway" type="number" min="3" max="60" value="${state.draftHeadway}"></label><label>${t('draft.color')}<input id="metro-color" type="color" value="${state.draftColor}"></label></div><button type="button" id="suggest-draft-color">${t('draft.suggest')}</button><label class="toggle-row"><input id="draft-ring" type="checkbox" ${raw(state.draftRing ? 'checked' : '')}> ${t('draft.ring')}</label><small>${t('draft.ringHelp')}</small></div></div>${raw(sourceNote)}<div class="section"><div class="section-title"><h3>${t('draft.stations')}</h3><span class="value">${state.draft.length}</span></div><div class="stop-list">${raw(stations || html`<p class="empty-state">${t('draft.empty')}</p>`)}</div><div class="toolbar" style="margin-top:14px"><button id="cancel-metro">${t('draft.cancel')}</button><button id="finish-metro" class="primary" ${raw(state.draft.length < (state.draftRing ? 3 : 2) ? 'disabled' : '')}>${t('draft.open')}</button></div></div><div class="section"><p class="fine-print">${routeNote}</p></div>`;
  $('metro-name').oninput = event => { state.draftName = event.target.value; };
  $('metro-headway').onchange = event => { state.draftHeadway = Math.max(3, Math.min(60, Number(event.target.value) || 8)); };
  $('metro-color').oninput = event => { state.draftColor = event.target.value; renderDraft(); };
  $('suggest-draft-color').onclick = () => { state.draftColor = suggestLineColor(state.draft.map(station => station.pos)); $('metro-color').value = state.draftColor; renderDraft(); };
  $('draft-ring').onchange = event => { state.draftRing = event.target.checked; renderInspector(); renderDraft(); };
  el.querySelectorAll('[data-draft-remove]').forEach(button => {
    const station = state.draft[Number(button.dataset.draftRemove)];
    button.setAttribute('aria-label', t('draft.remove', { name: station?.name || t('draft.station') }));
  });
  $('finish-metro').onclick = createMetro;
  $('cancel-metro').onclick = () => {
    state.tool = 'inspect';
    state.draft = [];
    state.draftRing = false;
    state.movingDraftIndex = null;
    state.draftTemplate = null;
    state.draftMode = 'metro';
    state.draftColor = colors.metro;
    map.getCanvas().style.cursor = '';
    renderInspector();
    renderDraft();
  };
  return true;
}

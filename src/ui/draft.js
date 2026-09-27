import { html, raw } from '../html.js';
import { modeLabel } from '../modes.js';

export function renderDraftInspector(ctx) {
  const { $, state, colors, safeUrl, suggestLineColor, renderDraft, renderInspector, createMetro, map } = ctx;
  if (state.tool !== 'metro') return false;
  const el = $('inspector-content');
  $('inspector-peek-label').textContent = '✎';
  $('inspector-peek-kind').textContent = 'draft';
  const mode = modeLabel(state.draftMode);
  const template = state.draftTemplate;
  const sourceNote = template ? html`<div class="section"><p><b>${template.status || 'Historical concept'}</b> · ${template.confidence || 'Conceptual alignment'}</p><p>${template.description || ''}</p><p><a href="${safeUrl(template.sourceUrl || '#')}" target="_blank" rel="noopener">${template.sourceTitle || 'Open proposal source'} ↗</a></p><p class="fine-print">The proposal source does not give an engineered alignment. ${raw(template.stationCoordinateSourceUrl ? html`Map coordinates: <a href="${safeUrl(template.stationCoordinateSourceUrl)}" target="_blank" rel="noopener">station data source ↗</a>.` : '')}</p></div>` : '';
  const heading = template ? `Edit this ${mode.toLowerCase()} concept` : 'Draw your metro';
  const intro = state.movingDraftIndex !== null ? `Click the new map position for ${state.draft[state.movingDraftIndex]?.name || 'this station'}. Press Escape to cancel.` : template ? 'This sourced idea is loaded as a draft. Add or remove stations to explore a variant.' : 'Tap the map to place stations. Click near an existing stop to snap to its location and enable a transfer.';
  const routeNote = (template ? 'Draft segments are direct lines between the displayed stations. Proposed station sites marked schematic are map anchors, not surveyed locations.' : 'Metro tracks are drawn as direct segments. Tunnel engineering and construction cost are outside this sandbox.') + (state.draftRing ? ' The closing segment connects directly to the first station.' : '') + ' Right-click a station to move or remove it; middle-drag to reposition it directly.';
  const stations = state.draft.map((station, index) => html`<div class="stop-row"><span class="stop-index">${index + 1}</span><span title="${station.coordinateNote || ''}">${station.name}${raw(station.schematic ? '<small class="source-note">Schematic location</small>' : '')}</span><button data-draft-remove="${index}" title="Remove station">×</button></div>`).join('');
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${template ? 'PROPOSAL DRAFT' : 'NEW INFRASTRUCTURE'}</h2><span class="chip mode-${state.draftMode}">${mode}</span></div><h2 class="inspector-heading">${heading}</h2><p class="intro">${intro}</p><div class="form-stack"><label>Line name<input id="metro-name" maxlength="18" value="${state.draftName}"></label><div class="form-row"><label>Every · minutes<input id="metro-headway" type="number" min="3" max="60" value="${state.draftHeadway}"></label><label>Line color<input id="metro-color" type="color" value="${state.draftColor}"></label></div><button type="button" id="suggest-draft-color">Suggest color</button><label class="toggle-row"><input id="draft-ring" type="checkbox" ${raw(state.draftRing ? 'checked' : '')}> Ring line · one continuous direction</label><small>Stops are served in drawn order, then the line returns to its first stop.</small></div></div>${raw(sourceNote)}<div class="section"><div class="section-title"><h3>Stations</h3><span class="value">${state.draft.length}</span></div><div class="stop-list">${raw(stations || '<p class="empty-state">Click on the map to begin.</p>')}</div><div class="toolbar" style="margin-top:14px"><button id="cancel-metro">Cancel</button><button id="finish-metro" class="primary" ${raw(state.draft.length < (state.draftRing ? 3 : 2) ? 'disabled' : '')}>Open line</button></div></div><div class="section"><p class="fine-print">${routeNote}</p></div>`;
  $('metro-name').oninput = event => { state.draftName = event.target.value; };
  $('metro-headway').onchange = event => { state.draftHeadway = Math.max(3, Math.min(60, Number(event.target.value) || 8)); };
  $('metro-color').oninput = event => { state.draftColor = event.target.value; renderDraft(); };
  $('suggest-draft-color').onclick = () => { state.draftColor = suggestLineColor(state.draft.map(station => station.pos)); $('metro-color').value = state.draftColor; renderDraft(); };
  $('draft-ring').onchange = event => { state.draftRing = event.target.checked; renderInspector(); renderDraft(); };
  el.querySelectorAll('[data-draft-remove]').forEach(button => {
    const station = state.draft[Number(button.dataset.draftRemove)];
    button.setAttribute('aria-label', `Remove ${station?.name || 'station'} from draft`);
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

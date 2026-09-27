const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => escapeMap[character]);
}

export function raw(value) {
  return { __raw: String(value ?? '') };
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const text = value && typeof value === 'object' && Object.hasOwn(value, '__raw') ? value.__raw : escapeHtml(value);
    out += text + strings[i + 1];
  }
  return out;
}

export function directionGlyph(route) {
  if (route.ring) return '⟳';
  if (route.source === 'player') return '↔';
  if (route.direction === '1') return '↩';
  return '→';
}

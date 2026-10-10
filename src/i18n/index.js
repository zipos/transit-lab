import en from './locales/en.json?v=2026-10-10-map' with { type: 'json' };
import pl from './locales/pl.json?v=2026-10-10-map' with { type: 'json' };

const catalogs = { en, pl };
const listeners = new Set();

function detect() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem('transit-lab:settings') || '{}').locale;
    if (saved === 'pl' || saved === 'en') return saved;
  } catch (_) {}
  const languages = globalThis.navigator?.languages || [globalThis.navigator?.language || 'en'];
  return languages.some(language => String(language || '').toLowerCase().startsWith('pl')) ? 'pl' : 'en';
}

let locale = detect();
const initialTitle = globalThis.document?.title || '';

function lookup(catalog, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), catalog);
}

function fill(template, params) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] == null ? '' : String(params[name]));
}

export function getLocale() { return locale; }

export function t(key, params = {}) {
  const value = lookup(catalogs[locale], key) ?? lookup(catalogs.en, key);
  if (typeof value !== 'string') {
    try {
      if (new URLSearchParams(globalThis.location?.search || '').get('debug') === '1') console.warn('missing i18n key', key);
    } catch (_) {}
    return key;
  }
  return fill(value, params);
}

export function plural(key, n, params = {}) {
  const forms = lookup(catalogs[locale], key) ?? lookup(catalogs.en, key);
  const category = new Intl.PluralRules(locale === 'pl' ? 'pl' : 'en').select(Number(n) || 0);
  const template = forms?.[category] || forms?.other || forms?.many;
  if (typeof template !== 'string') return key;
  return fill(template, { ...params, n });
}

function numberLocale() { return locale === 'pl' ? 'pl-PL' : 'en-GB'; }

export function fmtNumber(value) {
  return new Intl.NumberFormat(numberLocale()).format(Math.round(Number(value) || 0));
}

export function fmtDecimal(value, digits = 2) {
  return new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
}

export function fmtCurrency(value) {
  const amount = fmtNumber(value);
  return locale === 'pl' ? `${amount}\u00a0zł` : `PLN ${amount}`;
}

export function localize(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && (Object.hasOwn(value, 'pl') || Object.hasOwn(value, 'en'))) {
    return value[locale] || value.en || value.pl || '';
  }
  return value ?? '';
}

export function applyDom(root = globalThis.document) {
  if (!root) return;
  if (root.documentElement) root.documentElement.lang = locale;
  const description = root.querySelector?.('meta[name="description"]');
  if (description) description.setAttribute('content', t('app.description'));
  if (root.title === initialTitle && !globalThis.TRANSIT_REGION) root.title = t('app.name');
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(element => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder)); });
  root.querySelectorAll('[data-locale]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.locale === locale)));
}

export function setLocale(next) {
  locale = next === 'pl' ? 'pl' : 'en';
  try {
    const settings = JSON.parse(globalThis.localStorage?.getItem('transit-lab:settings') || '{}');
    settings.locale = locale;
    globalThis.localStorage.setItem('transit-lab:settings', JSON.stringify(settings));
  } catch (_) {}
  applyDom();
  listeners.forEach(listener => listener(locale));
}

export function onLocale(listener) { listeners.add(listener); }

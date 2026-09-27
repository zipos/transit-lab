# 12 · Polish and English

**Phase 1 · Size M · Depends on 11 · The owner (a native Polish speaker) reviews all Polish text**

## Why

The audience is Polish, but every string is English and numbers use `en-GB` formatting.

## Scope

1. **Engine:** `src/i18n/index.js` exports `t(key, params)`, `plural(key, n)`, `fmtNumber`, `fmtDecimal`, `fmtCurrency` and `setLocale`, plus a `locales/pl.json` and `locales/en.json` with nested keys.
   - Plurals use `Intl.PluralRules`. Polish needs `one`, `few` and `many`: 1 przystanek, 2–4 przystanki, 5+ przystanków.
   - Number formatting uses `Intl.NumberFormat('pl-PL')`, which uses a non-breaking space for thousands and a comma for decimals.
   - Currency is "zł" after the number in Polish (`1 234 zł`) and "PLN 1,234" in English.
2. **Locale selection:** localStorage `transit-lab:settings.locale`, then `navigator.languages` (`pl*` → `pl`), otherwise `en`.
   - Add a switcher in the top bar (`PL | EN`) and in Settings.
   - Set `<html lang>`, the document title and the meta description.
   - Switching re-renders without reloading the map.
3. **Move every user-visible string** in `index.html` and `src/**` into the locale files, including toasts, `aria-label`, `title`, the Data & model dialog, the Guide, the first-run coach from brief 07, context-menu items and placeholder text. Brief 07 already has a small Polish and English dictionary; move it, do not rewrite the coach.
4. **Keep data as published.** Stop names, line long names and municipality names stay as in the source.
   - Region names come from the manifest's `{pl, en}`.
   - Historical template titles and descriptions become `{pl, en}` objects in `regions/<id>/templates.json`. Keep the original source title as published.
5. **Glossary.** Use these terms consistently and put the table at the top of `pl.json` as a `_glossary` key:

| English | Polish |
| --- | --- |
| line | linia |
| pattern / variant | wariant trasy |
| stop | przystanek |
| station (metro/rail) | stacja |
| interchange | węzeł przesiadkowy |
| transfer | przesiadka |
| interval / headway | częstotliwość (UI: "co 8 min") |
| ring line | linia okrężna |
| draft | szkic |
| trips per day | podróże na dobę |
| satisfaction index | wskaźnik zadowolenia |
| operating cost | koszt eksploatacji |
| capital cost | koszt budowy |
| demand served | obsłużony popyt |
| resident density | gęstość zaludnienia |
| travel-time map | mapa czasu dojazdu |
| challenge | wyzwanie |

6. **Review file.** Write `docs/i18n-review.md` listing every Polish string you are less than certain about, with context, for the owner to review. Do not machine-translate long explanatory text silently; flag it.

## Acceptance checks

- `rg -n "'[A-Z][a-z]+ [a-z]+" src --glob '!src/i18n/**'` finds no leftover UI sentences. Explain any false positives in the PR.
- The UI works end to end in both languages, the switch persists across reloads, and no key is missing (`t()` logs missing keys in debug mode, and there are none).
- Polish plurals render correctly for 1, 2, 5, 12, 22 and 25 stops.
- Phone layout: no Polish label overflows. Polish is about 20–30% longer, so check the bottom bar, the tabs and the stat cards.

## Stop and ask if

- A term isn't in the glossary and appears in more than one place. Propose a translation in `docs/i18n-review.md` and continue with it marked.

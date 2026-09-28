# Polish copy for the owner to review

The interface is bilingual. Polish is the default when the browser language starts with `pl`. Uncertain Polish is listed here so it can be corrected without hunting through the catalogs.

Stop names, line long names, municipality names and published source titles stay as printed in the source. Region names come from `regions/gzm/region.json`.

## Glossary terms used outside the table

These are proposed, not in the brief's glossary:

| English | Polish used | Where |
| --- | --- | --- |
| live | dostępny | Region picker status |
| planned | planowany | Region picker status |
| draft | szkic | Peek label |
| line | linia | Peek label |

## Machine-written long text

Treat every string in these places as a draft translation:

- `src/i18n/locales/pl.json`: `guide`, `data`, `intro.steps`, `draft` (the explanatory sentences), `line` (help and notices), `confirm`, `toast`, `loading.game`, `loading.tiles`, `loading.map`
- `regions/gzm/templates.json`: each template's `title.pl`, `status.pl`, `confidence.pl`, `description.pl`, and each `coordinateNote.pl`

The English side of those template fields is the previous text. `sourceTitle` stays the published Polish title.

### Template titles

- Szybki tramwaj: Sosnowiec–Siemianowice–Katowice
- Szybki tramwaj: Dąbrowa Górnicza–Bytom
- Kolej metropolitalna: Katowice–Mysłowice

### Template statuses

- historyczna rekomendacja
- historyczna koncepcja obsługi na istniejącej linii kolejowej

### Station notes

Each schematic station note is a Polish rendering of the English "approximate proxy" sentence. The place names inside them are unchanged.

## Line list (brief 13)

- co ~{{minutes}} min
- Tylko ten kierunek
- Ta częstotliwość zapisuje się na każdym wariancie linii.
- Ta częstotliwość zapisuje się tylko na wariancie otwartym w tym kierunku.
- Odbij na drugi kierunek

## Share links and plans (brief 34)

- Udostępniony scenariusz
- Zachowaj kopię
- Porównaj z
- Opublikowana sieć
- W tej przeglądarce brakuje miejsca na kolejny plan.

## Simulation progress (brief 20)

- Przeliczanie

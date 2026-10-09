# Polish copy for the owner to review

Last pass: 2026-10-09. Lines below show the current wording; items marked as changed in that pass were rewritten for grammar (number agreement is avoided by putting the label before the number).

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

- co ok. {{minutes}} min
- Tylko ten kierunek
- Ta częstotliwość zapisuje się na każdym wariancie linii.
- Ta częstotliwość zapisuje się tylko na wariancie otwartym w tym kierunku.
- Odbij w drugą stronę

## Share links and plans (brief 34)

- Udostępniony scenariusz
- Zachowaj kopię
- Porównaj z
- Opublikowana sieć
- W tej przeglądarce nie ma już miejsca na kolejny plan.

## Demand zones (brief 21)

- Rozkład GTFS 2026 · dojście pieszo 4,5 km/h, trasa o 25% dłuższa niż w linii prostej
- 20 min+
- {{minutes}} min pieszo do {{name}}
- Strefa popytu
- Mieszkańcy strefy: {{count}}

## Mode choice (brief 23)

Draft Polish. The share is explicitly not calibrated.

- udział
- Udział transportu
- Od drzwi do drzwi
- Bez kalibracji
- wsiadania:
- pieszo, poniżej 1,2 km:
- mieszkańców w 800 m od tramwaju lub kolei: (udział w procentach w nawiasie)
- udział wewnątrz tej gminy:

## Line builder (brief 30)

Draft Polish.

- Narysuj linię ({{mode}})
- Edytuj przebieg
- Zapisz przebieg
- Wspólny opublikowany przystanek
- mieszkańcy w zasięgu:
- nowo w 800 m od szybkiego transportu:
- Wydzielony pas / Tunel / Estakada
- Skopiowane przystanki ({{count}}) przyciągnięto do najbliższych opublikowanych peronów.

## Flows and crowding (brief 24)

Draft Polish.

- Odcinki przeładowane
- {{load}}% w szczycie
- Żaden odcinek nie przekracza pojemności w godzinie szczytu.
- Pokaż na mapie
- Doprecyzowane
- Doprecyzowanie
- Przypisywanie pasażerów…
- pasażerów na dobę
- Obciążenie w szczycie {{load}}%
- Najbardziej obciążony odcinek: {{from}} → {{to}}
- Przepływy są jeszcze liczone.
- wsiadania na dobę:
- przesiadki na dobę:

## Simulation progress (brief 20)

- Przeliczanie

## Budget (brief 31)

Draft Polish.

- koszt budowy
- Tryb budżetu
- Budżet
- koszt budowy nowej infrastruktury
- roczna zmiana kosztów eksploatacji
- roczne wpływy z biletów
- Wpływy z biletów czekają na kalibrację.
- pokrycie wpływami z biletów
- zł budowy na nowego pasażera dziennie
- Koszt budowy {{spent}} zł z budżetu {{budget}} zł
- eksploatacja / dobę
- pojazdy: {{count}}
- pojazdy: +{{count}} wobec opublikowanej
- Koszty planistyczne
- Opcjonalny tryb budżetu używa planistycznych kosztów jednostkowych ze źródeł w notatce parametrów modelu. Kwoty dotyczą roku umowy lub sprawozdania i nie są budżetem projektu ani wyceną przetargową.

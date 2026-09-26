# GZM / Transit Lab

A browser sandbox for all 41 GZM member municipalities, Jaworzno and Orzesze, using Transport GZM, PKM Jaworzno and Koleje Śląskie service. It includes bus, tram and regional rail patterns; you can edit service and stops, draw metro lines, load historical proposals, and compare modeled results. Orzesze is outside GZM membership, but appears in the published GZM and regional rail feeds. The interface follows the system light or dark setting.

## Start and save

Run `python3 -m http.server 8765` in this folder, then open `http://localhost:8765`. On Windows, `py -m http.server 8765` also works. The map needs internet access for OpenFreeMap tiles; the game files have no build step.

Changes save in the current browser's local storage. Use **Export** to create a scenario JSON for backup or sharing and **Import** to open it elsewhere. This build accepts scenarios and local saves from the earlier eight-city, five-city and three-city snapshots, retaining routes and stops that still exist. The source ZIP does not contain your browser's local edits. Mobile PWA installation and offline tiles remain future work.

## Play

1. Select an existing line on the map or in the list. Change its interval, active state or stop order; add and remove stops.
2. Draw a metro, or load one of three source-backed 2018 rapid-tram or metropolitan-rail concepts as an editable draft. A player line normally runs in both directions; enable **Ring line** in the draft or line inspector to run continuously in the drawn stop order, closing from the last stop to the first. Rings need at least three stops and can be reversed in the inspector. The concept coordinates are marked schematic where no surveyed site was published.
3. Open **Layers** in the bottom bar and use the mode buttons to show only tram, bus, rail or metro patterns. They hide that mode's routes, stop dots and animated vehicle markers without editing a line or the simulation. Switch the planning layer between resident density and tram/rail/metro access, or hide it with its adjacent toggle. Its color scale sits in the same control. The access layer uses straight-line distance from each 1 km cell center to the nearest active rapid-transit stop and updates after line edits. The single desktop panel has Network, Inspect and Results tabs, collapses to a slim summary, and expands on hover or a rail click. Mobile tabs open the same views as a bottom sheet. Past ideas sit in a compact disclosure. Map orientation controls share the bottom bar.
4. Right-click the map for exact grid information, nearby stops, route actions, coordinates and a ruler. While drawing a line, right-click a draft station to move or remove it, or middle-drag it directly. The ruler adds points with left clicks; finish or clear it from its panel or the right-click menu.
5. Click a map stop or a stop name in a line to inspect every route pattern serving it, the inbound direction, and each line's estimated interval. Click empty map space, press Escape, or use the inspector close button to dismiss a selection. Compare simulated passengers, satisfaction, waiting and operating cost against the source snapshot. Use Undo, Reset, Export and Import to manage experiments. The Fullscreen button or **F** key toggles fullscreen; Display settings can hide that button.

## Reproducible source data

The transport service snapshot is for **23 September 2026**. Pinned source ZIPs, SHA-256 checks and importers recreate the normalized network. Run from this folder:

```bash
python3 data/import_gtfs.py
python3 data/import_population.py
```

`data/import_municipal_income.py` and its source snapshot remain in the project archive for reproducibility, but municipal wage is no longer loaded or shown in the game.

The network has **1,009 directional patterns and 7,672 stops** over the 43-municipality focus area and nearby interchange context. GZM contributes 888 patterns, Koleje Śląskie 75, and PKM Jaworzno 46. GTFS patterns use one representative trip shape per direction, so branches and short turns are simplified. PKM uses published main timetable sequences with official map coordinates, direct stop-to-stop shapes and weekday departure-count interval estimates. Indented branches and stops without published coordinates are omitted and recorded in the snapshot. The online basemap may change while the pinned service data stays fixed.

If Node.js is available, `node tests/simulation-audit.cjs` checks model invariants, local results and background-worker parity. `python3 tests/pkm-import-audit.py` checks PKM branch ordering and arrival-only termini.

The **2021 GUS resident grid** contributes **2,798 selected 1 km cells**, including **677 zero-resident cells**, and **2,237,684 residents** across 43 municipalities. Cell polygons are drawn directly as a continuous mask. A subtle city-boundary fill blends gaps, since selection uses each cell's center inside the pinned PRG municipality boundaries. The total is a selected-grid sum, not an exact full-city census total. Published residents weight trip origins; a separate density and municipal-center proxy weights destinations.

The **tram/rail/metro access layer** combines the pinned 2026 GTFS stop positions with active player metro lines. Its colored 1 km cells show straight-line distance from each published population-cell center to the nearest active tram, rail or metro stop. It updates when a service is enabled, disabled or edited. It is a geometric planning proxy, not actual walking distance, journey time, crowding or observed dissatisfaction. Municipal median wage was removed from the map because the available GUS series is municipality-wide and cannot describe a district or station catchment.

Sources:

- [GZM ZTM extended GTFS](https://otwartedane.metropoliagzm.pl/dataset/rozklady-jazdy-i-lokalizacja-przystankow-gtfs-wersja-rozszerzona), publisher snapshot `schedule_ZTM_2026.09.23_11277_0005`, CC BY.
- [Koleje Śląskie GTFS](https://koleje-ks.pl/gtfs/2025-2026.zip), 2025–2026 feed downloaded 23 September 2026. [Transitland catalog](https://www.transit.land/feeds/f-u2v-koleje~slaskie) records CC0; the operator download page does not state a license.
- [PKM Jaworzno official timetables](https://www.pkm.jaworzno.pl/rozklady/start.php), pinned timetable and route-map snapshot retrieved 26 September 2026. The site does not state a reusable feed license. `data/import_pkm.py` refreshes the snapshot; update the expected SHA in `data/import_gtfs.py` deliberately when refreshing it.
- [GUS NSP 2021 resident grid](https://portal.geo.stat.gov.pl/aktualnosci/dane-o-rezydentach-w-siatce-kilometrowej-nsp-2021-mozliwe-do-pobrania/), source: Główny Urząd Statystyczny, geo.stat.gov.pl, retrieved 24 September 2026. ATOM metadata reports no use conditions; [portal terms](https://portal.geo.stat.gov.pl/regulamin/) require source and retrieval-date attribution. No named CC license is stated.
- [GUGiK National Register of Boundaries (PRG)](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/), pinned municipal boundaries retrieved 25 September 2026.
- [GUS BDL P4610](https://bdl.stat.gov.pl/bdl/dane/podgrup/temat/40/403/4610), archived December 2025 municipality-wide wage input; no longer shown in the game.
- [2018 GZM metropolitan-rail concept](https://bip.metropoliagzm.pl/attachments/download/189291), source for three historical editable line drafts. These are planning concepts, not approved alignments.
- Basemap: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), served by [OpenFreeMap](https://openfreemap.org/). MapLibre GL JS is bundled with its license in `vendor/LICENSE-maplibre.txt`.

The [zbiorkom.live GZM mirror](https://cdn.zbiorkom.live/gtfs/gzm.zip) was reviewed; the baseline uses original publisher feeds and does not depend on its API.

## Simulation and layer limits

The 2021 grid residents are assigned to **53 municipality-based anchors**: one per municipality, two for those with at least 80,000 selected-grid residents. Origins use residential population. Destinations use a separate estimate based on density and proximity to the municipal population center. There is **no observed work, school or shopping zoning**. A game assumption of **0.6 cross-zone opportunities per resident per day** yields approximately **1,342,610** possible trips. Paths use stop sequences, approximate mode speeds, and at most one 340 m walk between transit boardings; that interchange is a geometric proxy, not a pedestrian router. Initial zone access is modeled separately. Published route distances use a detour factor derived from each representative GTFS shape when the shape length plausibly matches its stop sequence; edited or mismatched geometry uses a conservative fallback. Average initial waiting is half the route interval. A trip must board at least one transit line to count as a passenger. Satisfaction is a model index derived from journey time, which includes waiting and transfer penalties once; no observed satisfaction is available. Adding service can attract new riders with longer trips and reduce the rider average even when the network improves. Local Results show changes by origin municipality, with satisfaction to two decimals. Statistics run in a background worker; a synchronous fallback supports browsers without workers. When a scenario serves no trips, wait, journey, transfers and satisfaction display as unavailable rather than zero.

Operating cost is route-kilometers × departures × an assumed cost per kilometer: bus zł12, tram zł20, rail zł38, metro zł55. Imported GTFS patterns are directional; ordinary player lines include both directions, while ring lines run in one drawn direction and include their closing segment. Passenger counts, satisfaction, costs, load and animated vehicle positions are **scenario estimates**, not observed GZM statistics or a financial forecast. The demand grid is from 2021 while service is from 2026.

No dissatisfaction mask is shown because a geographically resolved observed measure was not found. Comparable neighborhood rent and wealth data are also absent. Land-sale records require reliable area units, ownership-share treatment and enough comparable sales per cell. A check of [GUGiK RCN](https://www.geoportal.gov.pl/pl/dane/rejestr-cen-nieruchomosci-rcn/) free-market full-ownership undeveloped-land sales from 2024–2026 found no 1 km cell with five comparable sales in Chorzów; a metropolitan value surface would misrepresent coverage.

Potential future layers with finer published geography include the [GUS 250 m 2021 population grid](https://portal.geo.stat.gov.pl/aktualnosci/nowe-dane-o-ludnosci-krajowej-z-nsp-2021-w-siatce-kwadratow-250mx250m/), [GUS 1 km buildings and dwellings grid](https://portal.geo.stat.gov.pl/aktualnosci/dane-o-budynkach-i-mieszkaniach-w-siatce-kilometrowej-nsp-2021/), and land-use polygons from [GUGiK BDOT10k](https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/) or [Copernicus Urban Atlas 2021](https://land.copernicus.eu/en/products/urban-atlas/urban-atlas-2021). These require separate import, coverage and reuse review before being presented as game data.

Edited routes use direct lines between stops; they do not follow roads, existing track or engineered tunnel alignments. The source line templates likewise show schematic direct segments where a proposal does not publish a precise geometry. Play animates illustrative vehicles along selected route shapes, using rough travel-time pacing and frequency-based spacing. It is not a timetable or live vehicle feed.

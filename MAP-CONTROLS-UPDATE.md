# Map controls and planning layers — 25 September 2026

## Changes

- Replaced the left-click density and wage popups with an in-game map context menu. Right-clicking the map shows the published resident grid value at that point, straight-line access to active tram/rail/metro, the nearest published stop, and coordinates. The menu offers line selection, metro drafting, nearest-stop insertion where relevant, ruler controls, copy, zoom and model details. The browser's native menu is suppressed on the map only. Escape, arrow keys and click-away work with the custom menu.
- Removed the citywide median wage layer from the playable UI. Municipality-level wages cannot describe districts or station catchments. The source importer and pinned data remain archived for reproducibility, but the browser no longer loads them.
- Added a **tram/rail/metro access** mask over the published 1 km population cells. Each cell uses straight-line distance from its center to the nearest stop on an active tram, rail or player metro line. It updates when those lines are edited, enabled, disabled, imported or removed. The measure does not follow the pedestrian network and does not represent travel time, service quality or observed dissatisfaction.
- While drawing a line, right-click a draft station for **Move** and **Remove**. Move lets the next left click place that station; middle-drag moves it directly. The station spacing rule still applies, and a moved station snaps to a published stop within 120 m. Escape cancels a pending move.
- Added a map ruler to the right-click menu. Start it at a location, left-click to add segments, and finish or clear it from the small map panel or the context menu. It displays cumulative straight-line distance. While active, ruler clicks do not place metro stations.
- Delayed system-theme map-style replacement until MapLibre is idle. This prevents a symbol-placement exception when a theme change follows a large scenario update.

## Verification

- JavaScript syntax check and simulation invariants passed.
- Browser interaction check passed over both a local HTTP preview and the directly opened `file://` page. It covered right-click-only data, keyboard-safe custom menu placement, coordinate copy, ruler segments, station move/remove, middle dragging, and the ruler's separation from metro drafting.
- Importing a test player metro reduced the access distance of the cell containing its station to zero. The access layer survived a live system-theme switch.
- Desktop light, desktop dark and phone dark regression checks passed with no page or console errors.

## Data choices to revisit

The [GUS 2021 250 m population grid](https://portal.geo.stat.gov.pl/aktualnosci/nowe-dane-o-ludnosci-krajowej-z-nsp-2021-w-siatce-kwadratow-250mx250m/) is a promising consistent finer grid for all five cities, but its population definition and reuse terms need checking against the current 1 km resident grid before substitution. The [GUS 2021 buildings and dwellings grid](https://portal.geo.stat.gov.pl/aktualnosci/dane-o-budynkach-i-mieszkaniach-w-siatce-kilometrowej-nsp-2021/) could add housing intensity. [GUGiK BDOT10k](https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/) and [Copernicus Urban Atlas 2021](https://land.copernicus.eu/en/products/urban-atlas/urban-atlas-2021) offer land-use context. None of these supplies district-level wage, rent or observed dissatisfaction by itself.

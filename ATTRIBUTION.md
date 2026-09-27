# Data attribution

Code is AGPL-3.0; see [LICENSE](LICENSE). Dataset terms are separate. Raw input pins, URLs and retrieval dates are in [data/sources.json](data/sources.json). Original raw files remain in earlier public Git history; this cleanup does not rewrite it.

## GZM ZTM

Source: [GZM ZTM extended GTFS](https://otwartedane.metropoliagzm.pl/dataset/rozklady-jazdy-i-lokalizacja-przystankow-gtfs-wersja-rozszerzona), publisher snapshot `schedule_ZTM_2026.09.23_11277_0005`, retrieved 23 September 2026. Terms: **CC BY**; attribution required. Attribution: **GZM ZTM extended GTFS, publisher snapshot schedule_ZTM_2026.09.23_11277_0005.** The network is a processed derivative, with simplified patterns and estimated service intervals.

## Koleje Śląskie

Source: [Koleje Śląskie GTFS](https://koleje-ks.pl/gtfs/2025-2026.zip), 2025–2026 feed downloaded 23 September 2026. **Published by the owner's decision on 27 September 2026, terms still unclear.** The operator download page does not state a reusable license. The [Transitland catalog](https://www.transit.land/feeds/f-u2v-koleje~slaskie) records CC0, but a third-party catalog is not the operator's permission. Attribution retained: **Koleje Śląskie GTFS, 2025–2026 feed downloaded 23 September 2026.** No additional required attribution wording has been established.

## PKM Jaworzno

Source: [PKM Jaworzno official timetables](https://www.pkm.jaworzno.pl/rozklady/start.php), pinned timetable and route-map snapshot retrieved 26 September 2026. **Published by the owner's decision on 27 September 2026, terms still unclear.** The site does not state a reusable feed license. Attribution retained: **PKM Jaworzno official main timetable sequences and route-map coordinates; retrieved 26 September 2026.** No additional required attribution wording has been established. `data/import_pkm.py` generates the raw snapshot; the processed network keeps these patterns.

## GUS resident population

Source: [GUS NSP 2021 resident grid](https://portal.geo.stat.gov.pl/aktualnosci/dane-o-rezydentach-w-siatce-kilometrowej-nsp-2021-mozliwe-do-pobrania/), Główny Urząd Statystyczny, geo.stat.gov.pl; retrieved 24 September 2026. Terms: GUS ATOM rights: no access or use conditions; no restrictions on public access. GUS Portal terms require source attribution to geo.stat.gov.pl and the retrieval date; no named CC license is stated. See the [portal terms](https://portal.geo.stat.gov.pl/regulamin/). Required attribution retained verbatim: **Source: Główny Urząd Statystyczny, geo.stat.gov.pl; retrieved 2026-09-24.** The processed grid selects complete 1 km resident cells by municipal boundaries.

## GUGiK municipal boundaries

Source: [National Register of Boundaries (PRG)](https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/), municipal units layer; retrieved 25 September 2026. Terms recorded with the source: **Geoportal states PRG data are free to use for any purpose.** Attribution retained: **GUGiK National Register of Boundaries (PRG), municipal units layer; retrieved 2026-09-25.** The processed boundaries are transformed from EPSG:2180 to WGS84.

## Historical transport concepts

Source: [2018 GZM metropolitan-rail concept](https://bip.metropoliagzm.pl/attachments/download/189291), Górnośląsko-Zagłębiowska Metropolia / Politechnika Śląska. Attribution: **Koncepcja Kolei Metropolitalnej dla Górnośląsko-Zagłębiowskiej Metropolii (2018), Tables 1.10 and 1.11.** These are planning concepts, not approved alignments. Template station coordinates use the GZM ZTM and Koleje Śląskie feeds credited above; unsurveyed proposal locations are marked schematic. The repository does not claim that the concept document has an open-data license.

## Basemap and map software

Attribution: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). OpenStreetMap data use the Open Database License; basemap tiles are served by [OpenFreeMap](https://openfreemap.org/) with [OpenMapTiles](https://www.openmaptiles.org/) attribution displayed on the map. MapLibre GL JS is bundled under its BSD 3-Clause license in [vendor/LICENSE-maplibre.txt](vendor/LICENSE-maplibre.txt).

## Retired input

The [GUS BDL P4610](https://bdl.stat.gov.pl/bdl/dane/podgrup/temat/40/403/4610) municipal income input is no longer used; its importer, processed files and current-tree raw snapshot were removed. Its earlier source attribution remains in the public history and README's historical note. It is not needed to rebuild the current population or network snapshots.

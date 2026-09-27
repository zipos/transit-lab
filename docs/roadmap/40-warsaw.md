# 40 · Warsaw

**Phase 4 · Size L · Depends on 10, 21, and 23 (23b and 24 strongly recommended) · Review: yes**

## Why

Warsaw is the next region and the showcase for metro planning. It is a single municipality of about 1.8M residents, so it only works once the zone model (brief 21) and destinations (brief 22) exist.

## Feeds (verified to exist on 26 Sep 2026; re-check terms at import time)

| Service | Source | Notes |
| --- | --- | --- |
| ZTM Warszawa: bus, tram, metro, and probably SKM | Official GTFS, `https://gtfs.ztm.waw.pl/last` (also on FTP). Terms: `https://www.ztm.waw.pl/pliki-do-pobrania/dane-rozkladowe/` | Check `route_type` values (metro should be `1`; brief 10 maps it) and whether SKM is included. Read and record the reuse and attribution terms. |
| WKD | `https://mkuran.pl/gtfs/wkd.zip` (Mikołaj Kuranowski), CC0 | |
| Koleje Mazowieckie and other rail | `https://mkuran.pl/gtfs/polish_trains.zip`, a unified Polish rail feed built from PKP PLK data, covering KM, SKM Warszawa, PolRegio, PKP Intercity, Koleje Śląskie and others | Terms: PKP PLK and KM public-sector data terms; attribute PKP PLK, KM and Mikołaj Kuranowski. The upstream is known to have data issues; read its README. Filter to agencies and routes that stop inside the region. |

Prefer the official ZTM feed over the `mkuran.pl/gtfs/warsaw.zip` mirror. Pin every file through `data/sources.json` (brief 01).

**Possible follow-up for GZM:** `polish_trains.zip` also covers Koleje Śląskie. Evaluate whether GZM should switch to it for consistency. That is a separate PR, and it needs the owner's approval.

## Scope

1. **Region scope (stop and ask before importing).**
   - Propose the municipality list: Warsaw plus the municipalities where ZTM runs service under agreements, plus the KM and WKD corridors where they carry substantial commuting.
   - Produce a table (TERYT, name, population in the 2021 grid, which feeds serve it) and a map screenshot of the boundary. Get the owner's approval.
   - The alternative is the full Warsaw metropolitan area, which is bigger and slower. Report its zone count and estimated run time for comparison.
2. **Manifest** `regions/waw/region.json`: service date, feeds, `zoneTarget` (start about 500; tune for ≤ 2 s), a centre near Centrum, `defaultResultArea`, and costs (brief 31 values; Warsaw metro costs are well documented).
3. **Warsaw districts for local results.** Warsaw is one municipality, so local results need its 18 districts (dzielnice).
   - Find official district boundaries (PRG or the city's open data), record their license, and assign zones by the centroid's district.
   - Results group by district for Warsaw, and by municipality elsewhere in the region.
4. **Destinations:** apply brief 22's approved method. Also confirm Warsaw-specific data availability, such as district-level employment in BDL.
5. **Calibration:** the official ZTM Warszawa annual passenger figure, cited. Include KM and WKD only if they're part of the cited total, and otherwise calibrate them separately or document it.
6. **Historical and planned proposals** (`regions/waw/templates.json`, bilingual):
   - Planned or studied metro lines (for example M3, M4 and M5 as published by Metro Warszawskie or the city) and major tram plans, with official sources.
   - Station coordinates only where published; otherwise schematic, clearly flagged, as GZM does.
   - Don't invent alignments.
7. **Challenges:** 5 seed challenges, following brief 32 (for example: an M3 to Gocław under budget; relieve the busiest tram corridor; a cross-river link; a Białołęka rapid-transit fix; make a line to the airport worthwhile).
8. **Performance and size:** the region download is ≤ 6 MB compressed and a full run is ≤ 2 s on the reference laptop. Report the actual numbers.

## Acceptance checks

- `python3 data/build_region.py waw` is reproducible from pinned sources.
- Warsaw's metro lines, trams, buses, SKM, KM and WKD appear with correct modes and colors. Selecting M1 shows the right stations.
- Baseline boardings are within 5% of the cited target. District results exist for all 18 districts.
- The region picker lists Warsaw. Saves, share links and challenges work there.
- Screenshots in the PR: overview (both themes), the flow map, and a travel-time map from Centrum.

## Stop and ask if

- The region scope has not been approved yet (item 1).
- The ZTM terms require something the project can't meet (for example, no redistribution of derived data).

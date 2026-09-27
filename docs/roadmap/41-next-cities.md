# 41 · Kraków, Wrocław, Poznań

**Phase 4 · Size L per city · Depends on 40 (reuse its checklist) · Review: yes**

Do one city per PR, in this order. Each follows brief 40's structure:

1. Region scope proposal, which needs the owner's approval.
2. Manifest.
3. Feeds pinned in `data/sources.json`.
4. Local result areas (municipalities, and city districts if the city is a single large municipality).
5. Destinations.
6. Calibration against a cited annual ridership figure.
7. Historical templates.
8. Five challenges.
9. Performance and size limits: ≤ 6 MB compressed, ≤ 2 s per run.

## Kraków

- Official ZTP GTFS at `https://gtfs.ztp.krakow.pl/`: `GTFS_KRK_A.zip` (bus), `GTFS_KRK_T.zip` (tram) and `GTFS_KRK_M.zip` (Mobilis). Merge the three and deduplicate shared stops by id or area.
- Rail (Koleje Małopolskie, PolRegio, SKA): from `https://mkuran.pl/gtfs/polish_trains.zip`, with the attribution noted in brief 40.
- Templates: Kraków's metro and premetro studies, and planned tram extensions, from official city or ZTP documents.
- Kraków's districts (dzielnice) are auxiliary units. Decide whether local results use them, depending on boundary availability.

## Wrocław

- Official open data GTFS: `https://www.wroclaw.pl/open-data/87b09b32-f076-4475-8ec9-6020ed1f9ac0/OtwartyWroclaw_rozklad_jazdy_GTFS.zip`. The dataset page lists the terms as "Informacja publiczna – brak ograniczeń" (public information, no restrictions); record that.
- The feed includes several suburban bus operators (DLA and others). Keep those that serve the region.
- Rail (Koleje Dolnośląskie and others): the Polish Trains feed.
- Templates: official studies of the tram network, a possible metro or premetro, and the agglomeration rail (Wrocławska Kolej Aglomeracyjna) plans.

## Poznań

- ZTM Poznań static GTFS: `https://www.ztm.poznan.pl/pl/dla-deweloperow/getGTFSFile`, where the latest ZIP comes back when no `file` parameter is given. Verify, and record the terms from ZTM Poznań's open data pages.
- Rail (Koleje Wielkopolskie, Poznańska Kolej Metropolitalna services, PolRegio): the Polish Trains feed.
- Templates: Poznański Szybki Tramwaj (PST) extensions and metropolitan rail plans, from official sources.

## Shared work (first city only)

- Generalize anything still specific to Warsaw that shows up. The goal is that adding the next city is almost entirely data: a manifest, templates and challenges.
- Write `docs/adding-a-region.md`: a checklist distilled from these three imports.

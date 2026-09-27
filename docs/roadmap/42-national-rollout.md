# 42 · All voivodeship capitals

**Phase 4 · Size L · Depends on 41 and `docs/adding-a-region.md`**

## Goal

Cover the metropolitan area around every voivodeship capital. Poland has 16 voivodeships and 18 capital cities, because two voivodeships split their seats between two cities.

| Region id | Capital(s) | Voivodeship | Notes |
| --- | --- | --- | --- |
| `gzm` | Katowice | śląskie | Live |
| `waw` | Warszawa | mazowieckie | Brief 40 |
| `krk` | Kraków | małopolskie | Brief 41 |
| `wro` | Wrocław | dolnośląskie | Brief 41 |
| `poz` | Poznań | wielkopolskie | Brief 41 |
| `3m` | Gdańsk (with Gdynia and Sopot) | pomorskie | Several operators: ZTM Gdańsk, ZKM Gdynia, SKM Trójmiasto, PKM (Pomorska Kolej Metropolitalna). Probably the largest after Warsaw. |
| `lodz` | Łódź | łódzkie | MPK Łódź plus ŁKA (Łódzka Kolej Aglomeracyjna) |
| `szc` | Szczecin | zachodniopomorskie | ZDiTM Szczecin; SKM Szczecin rail |
| `bto` | Bydgoszcz + Toruń | kujawsko-pomorskie | Two capitals; one region or two, to be decided |
| `lub` | Lublin | lubelskie | Trolleybuses: add a `trolleybus` mode, or map it to bus with its own color |
| `bia` | Białystok | podlaskie | BKM has a direct GTFS link |
| `kie` | Kielce | świętokrzyskie | |
| `rze` | Rzeszów | podkarpackie | |
| `olsz` | Olsztyn | warmińsko-mazurskie | ZDZiT Olsztyn; trams |
| `opo` | Opole | opolskie | |
| `zg-gw` | Zielona Góra + Gorzów Wielkopolski | lubuskie | Two capitals; Gorzów has trams |

## Approach

1. **Source discovery.** For each city, look up the feed in the Polish MMTIS National Access Point (published by the Ministry of Infrastructure; `mkuran.pl/gtfs/` lists many of its entries), then the operator's own open data page. Record the URL, terms and date in `data/sources.json`. Rail for every region comes from the Polish Trains feed.
2. **Coverage table.** Keep `docs/regions-status.md` with, per region:
   - feed status and license;
   - municipality scope (owner-approved);
   - calibration source;
   - templates and challenges count;
   - download size and run time;
   - status (planned, importing, beta, live).
3. **Region picker upgrade.** Replace the list with a map of Poland showing region outlines and status badges, using `regions/index.json` bboxes. Keep it light, with no extra tile requests beyond the basemap.
4. **Modes.** Add `trolleybus` if Lublin, Gdynia or Tychy need it. Tychy trolleybuses are already inside GZM, so check how today's import classifies them (GTFS route_type 11 is mapped to bus). Show it as its own legend entry.
5. **Order.** Tri-City and Łódź first (large, multi-operator, rail-heavy, fun), then by population.

## Stop and ask if

- A city has no reusable GTFS, as happened with PKM Jaworzno. The owner decides whether a scraped snapshot is acceptable for that city.
- Two-capital voivodeships: one region or two.

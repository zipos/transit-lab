# 22 · Destinations — decision note

Status: **waiting for the owner.** Part 2 (the attractions pipeline and trip purposes) is not started. Brief 23b stays blocked on this note.

Retrieved 28 September 2026 from the public pages and API responses cited below. Figures are copied from those responses. Nothing here is a tuned target for the passenger model.

## Recommendation

Use three layers, and leave the 1 km buildings grid out.

1. **Municipality control totals for work:** GUS BDL variable **1735396**, subject **P4508**, “Pracujący w gospodarce narodowej wg płci i siedziby pracy głównej”, dimension `ogółem`, unit `osoba`. Snapshot year **2024** (series also has 2023 and 2025; `lastUpdate` on the city of Warsaw was 2026-07-09).
2. **Where inside the municipality:** OpenStreetMap, from the Geofabrik voivodeship extracts, as weights only. Work weights from workplaces and commercial land. Education weights from schools and campuses, scaled by RAD-on student counts at the institution’s registered address and branches. Other weights from shops and clinics, plus the residents already in the zone file.
3. **Check, not a second constraint:** the NSP 2021 commuting matrix (gmina of residence → gmina of work). Report correlation and the ten largest residuals after Part 2. Do not force the model to match it. Flows below 3 people are omitted, the matrix counts employees, and it is 2021 while the job totals are 2024.

Trip-purpose shares are not chosen in this note. Part 2 would record them in `docs/model-parameters.md` only with a cited source. No 60/20/20 guess.

Warsaw is one BDL municipality. The 18 dzielnice do not have a usable figure in variable 1735396, so Warsaw is split only by the OSM weights, same as Katowice or Gliwice.

## 1. GUS BDL employment by workplace

| | |
| --- | --- |
| URL | API index: <https://api.stat.gov.pl/home/bdlapi>. Variable: <https://bdl.stat.gov.pl/api/v1/variables/1735396?format=json&lang=pl>. Data: <https://bdl.stat.gov.pl/api/v1/data/by-variable/1735396?unit-level=6&year=2024>. |
| What it is | People working in the national economy, by the seat of the main job (`siedziba pracy głównej`), total, in persons. This is the workplace side, not place of residence. Subject P4508 sits under group G481. |
| Resolution | Published for 3,918 gminy at `unit-level=6` for 2024, and also for powiat and voivodeship. Not a grid. |
| Year | 2023, 2024, 2025 on the variable. Use 2024. |
| Warsaw districts | The city unit `071412865011` (“M.st.Warszawa od 2002”) is **1,962,485** in 2024, attribute id 1 (`wartość`). Each dzielnica, including Śródmieście `071412865108`, returns `val: 0` with attribute id 0. Attribute 0 is named `"0"` and has an empty description, so that zero is not a published workplace total. There is no dzielnica series to import. |
| Effort | One paginated JSON download for level 6, joined to zones by municipality name and TERYT. No new runtime dependency. The raw response stays out of git; the pipeline would keep the municipality totals that the zones are scaled to. |
| Terms | GUS copyright notice: copying pages and files into one’s own work is allowed if the source is named. <https://www.gus.gov.pl/copyright>. No separate licence is stated on the API. Reuse also sits under the Act of 11 August 2021 on open data and reuse of public-sector information: name the source, the date taken, and that the figures were processed. |

2024 workplace totals for the largest GZM municipalities (attribute id 1):

| Municipality | BDL unit | Workplace jobs, 2024 | Residents in the current zones |
| --- | --- | ---: | ---: |
| Katowice | 012414869011 | 256,888 | 274,532 |
| Gliwice | 012414766011 | 97,245 | 176,664 |
| Tychy | 012415177011 | 56,585 | 121,524 |
| Sosnowiec | 012415075011 | 49,928 | 186,184 |
| Zabrze | 012414778011 | 46,333 | 145,895 |
| Dąbrowa Górnicza | 012415065011 | 43,987 | 112,633 |
| Chorzów | 012414863011 | 42,242 | 110,300 |
| Bytom | 012414562011 | 32,265 | 144,164 |
| Ruda Śląska | 012414872011 | 31,483 | 133,385 |
| Jaworzno | 012415068011 | 29,940 | 86,666 |
| Warszawa (the city, not a district) | 071412865011 | 1,962,485 | — |

Resident counts are the sum of the 450 GZM zones already in `data/gzm/population.json`. They are not a BDL population figure.

## 2. GUS commuting matrix, NSP 2021

| | |
| --- | --- |
| URL | Release page, 31 January 2024: <https://stat.gov.pl/spisy-powszechne/nsp-2021/nsp-2021-wyniki-ostateczne/macierz-przeplywow-ludnosci-zwiazanych-z-zatrudnieniem-nsp-2021,9,2.html>. File: <https://stat.gov.pl/download/gfx/portalinformacyjny/pl/defaultaktualnosci/6536/9/2/1/macierz_przeplywow_ludnosci_zwiazanych_z_zatrudnieniem.xlsx> (2,916,382 bytes downloaded; the page lists 2.78 MB). |
| What it is | Commuters from gmina of residence to gmina of work, from administrative registers used for the 2021 census. Earlier edition was the 2016 flow study; this is the 2021 replacement, not an annual series. |
| Form | Workbook with four sheets. `Macierz przepływów` is a long table, range `A1:F95891`: residence TERYT, residence name, workplace TERYT, workplace name, commuters. Codes are 7-digit TERYT (`2469011` Katowice, `1465011` M.st.Warszawa). Flows of fewer than 3 people are omitted. `Wyjeżdżający z gmin` and `Przyjeżdżający do gmin` are margins, range `A1:D3130`. |
| Warsaw | One municipality, `1465011`. No dzielnica codes in the shared strings (no `1465101`). |
| Effort | Download the xlsx in the data build, filter to the municipalities of the active region, compare with modelled municipality flows. Do not commit the workbook. |
| Terms | Same GUS copyright notice as source 1. Aggregated residuals in a test report are a processed derivative; name GUS, NSP 2021, and the download date. |

## 3. OpenStreetMap weights

| | |
| --- | --- |
| URL | Geofabrik Poland index: <https://download.geofabrik.de/europe/poland.html>. Śląskie: <https://download.geofabrik.de/europe/poland/slaskie-latest.osm.pbf> (176 MB; index checked 28 Sep 2026). Mazowieckie, for Warsaw: <https://download.geofabrik.de/europe/poland/mazowieckie-latest.osm.pbf> (286 MB). Full Poland extract is 2.0 GB and is not needed. Copyright: <https://www.openstreetmap.org/copyright>. Licence text: <https://opendatacommons.org/licenses/odbl/1-0/>. |
| What it represents | A weight for where activity sits inside a municipality, not a count of jobs. Proposed tags: `office=*`; `shop=*`; `amenity=school`, `college`, `university`, `hospital`, `clinic`; `landuse=commercial`, `retail`, `industrial`; building footprint area only as a secondary weight where `building=*` is present on those features. A node for a university and a node for a corner shop must not get the same education weight; student counts from source 4 scale the campuses. |
| Resolution | Individual OSM objects, then summed onto the existing zone cells. |
| Year | The Poland extract on that index was last modified with data up to 2026-09-27T20:23:36Z. Voivodeship extracts move on the same cycle. Pin the file’s SHA-256 in `sources.json` the way other inputs are pinned. |
| Effort | `osmium tags-filter` (or `osmium export` to GeoJSONSeq) on the voivodeship PBF, then a short Python script to sum weights by zone. `osmium` was not installed on this machine during the spike. A `requirements.txt` for the data build is fine. The app runtime stays dependency-free. Do not commit the PBF or the feature extract. |
| Terms | ODbL 1.0. Attribution “© OpenStreetMap contributors” is required on the zone data and in `ATTRIBUTION.md`. Share-alike applies to a derived database. The committed output should be zone weights, not the extracted objects. The PBF and the feature-level file stay in gitignored `data/sources/`, same as the GTFS zips. This is the part that needs an explicit yes: aggregated weights are what would be published, and they are still derived from OSM. |

## 4. University students (RAD-on / POL-on)

| | |
| --- | --- |
| URL | Public data catalog: <https://radon.nauka.gov.pl/api>. Reports: <https://radon.nauka.gov.pl/dane>. Institutions and branches, with addresses, are the public POL-on extracts served there. The POL-on 2.0 write API (`polon2.opi.org.pl`, bearer token) is for universities submitting students and is not the source to use. |
| What it represents | Students by institution, used to scale `amenity=university` / `college` (and a branch’s address) so a campus outweighs a single school node. |
| Resolution | Institution and branch address, then the zone that contains that point. Not a grid. |
| Year | RAD-on’s help page of 14 August 2025 says the reports were updated to 31 December 2024. |
| Effort | Download the public institutions register and the student report (CSV or XLSX) in the data build. Geocode only from the published address fields. If an address does not land in a zone, leave it unmatched and list it; do not invent a coordinate. |
| Terms | The catalog describes the API as public, free, and open. It does not name a Creative Commons licence. Reuse follows the 2021 open-data act unless a given report sets a condition: name OPI PIB / RAD-on, the extract date, and that student counts were joined to zones. |

## 5. GUS 1 km buildings and dwellings grid — not used

Portal layer: <https://geo.stat.gov.pl/app/cat/org/gus/mapa/213786d8-eeac-73ac-73f2-11cddd636b50?lang=PL> (“NSP 2021 Budynki i mieszkania w siatce kilometrowej”). The NSP publication schedule describes this grid as counts of dwellings and buildings for the variables in Commission Implementing Regulation (EU) 2018/1799, plus user-defined aggregates. It does not describe non-residential floor area. The portal’s licence field for that layer says “brak szczegółowych informacji”. Both the missing variable and the missing licence keep this layer out. Revisit only if GUS publishes a non-residential floor-area grid with a stated reuse condition.

## Worked example

Today’s attraction is the proxy in `src/sim/model.js`: `sqrt(residents) * (0.6 + log1p(density) / 8) * (0.7 + centrality)`, with centrality measured from the residents-weighted centre of the 450 zones, `[18.96296, 50.27984]`. Ranked on the current `data/gzm/population.json`:

| Rank | Municipality | Proxy | Residents | Density per km² | Centroid (lon, lat) | Zone id |
| ---: | --- | ---: | ---: | ---: | --- | --- |
| 1 | Katowice | 276.1 | 10,522 | 10,522 | 18.98241, 50.27695 | `PL_CRS3035RES1000mN3057000E4959000` |
| 2 | Chorzów | 268.6 | 11,977 | 11,977 | 18.94566, 50.30698 | `PL_CRS3035RES1000mN3060000E4956000` |
| 3 | Chorzów | 265.2 | 10,887 | 10,887 | 18.94396, 50.29807 | `PL_CRS3035RES1000mN3059000E4956000` |
| 4 | Chorzów | 260.3 | 9,067 | 9,067 | 18.95622, 50.28806 | `PL_CRS3035RES1000mN3058000E4957000` |
| 5 | Chorzów | 254.3 | 9,653 | 9,653 | 18.93889, 50.27133 | `PL_CRS3035RES1000mN3056000E4956000` |
| 6 | Siemianowice Śląskie | 248.8 | 10,892 | 10,892 | 19.00145, 50.30259 | `PL_CRS3035RES1000mN3060000E4960000` |
| 7 | Chorzów | 246.8 | 9,012 | 9,012 | 18.94227, 50.28915 | `PL_CRS3035RES1000mN3058000E4956000` |
| 8 | Bytom | 234.8 | 13,098 | 13,098 | 18.92620, 50.35374 | `PL_CRS3035RES1000mN3065000E4954000` |
| 9 | Katowice | 233.9 | 10,648 | 10,648 | 19.02081, 50.25582 | `PL_CRS3035RES1000mN3055000E4962000` |
| 10 | Chorzów | 226.1 | 6,721 | 6,721 | 18.95452, 50.27914 | `PL_CRS3035RES1000mN3057000E4957000` |

Six of those ten zones are in Chorzów. Chorzów’s 2024 workplace total is 42,242 people. Katowice’s is 256,888. Under the recommended rule, work attraction inside Chorzów sums to 42,242 and work attraction inside Katowice sums to 256,888, before any OSM split. The proxy’s Chorzów ranking does not survive that constraint. The single Katowice zone at rank 1 is the dense cell nearest the residents-weighted centre; it is not, by itself, evidence about Śródmieście offices.

The within-municipality top 10 under OSM weights is **not** in this note. Computing it means downloading the Śląskie PBF and running the filter above. That is Part 2, after approval. No zone job count was invented to fill the gap.

## What Part 2 would build, after a yes

- `data/lib/attractions.py` writes `{ work, education, other }` onto each zone, and records BDL, the NSP file, the OSM PBF hash, and the RAD-on extract in `data/sources.json` and `ATTRIBUTION.md`.
- Home→work uses `work` and is scaled so each municipality’s attracted total matches variable 1735396. Home→education uses `education`. Home→other uses `other` plus residents.
- A “Destinations” planning layer for jobs and education.
- An audit: a metro toward the Katowice centre beats an equally long metro between two housing zones. The NSP comparison (correlation and ten largest municipality residuals) is reported, not fitted.

## Asking the owner

1. Approve this combination (BDL 1735396 for 2024, OSM weights, RAD-on students, NSP 2021 as a check only).
2. Accept publishing aggregated OSM zone weights under ODbL attribution, with the PBF and the feature extract kept out of git.
3. Accept that Warsaw dzielnice stay out of the job totals, because variable 1735396 does not publish them.
4. Leave the NSP buildings grid out until GUS states both a non-residential variable and a licence.

Until those are answered, Part 2 and brief 23b do not start.

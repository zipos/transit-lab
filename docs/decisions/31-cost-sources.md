# 31 · Capital and fleet cost sources — decision note

Status: **partial — owner must pick stop-and-ask items and any >2× disagreement defaults.** Values proposed for the params table live in `docs/model-parameters.md` § Capital and fleet costs (brief 31). Retrieved October 2026. No ridership or licence text was invented.

## Recommendation (defaults to load if owner accepts)

| Parameter | Recommended default | Why |
| --- | --- | --- |
| Metro tunnel km | **340 mln PLN/km** | Recent Warsaw M2 **extensions** (Trocka, KJ), all-in without RS. Better planning prior than the one-off central section. |
| Metro elevated km | **stop-and-ask** | No Polish elevated metro. |
| Tram segregated km | **65 mln PLN/km** | Kraków Górka Narodowa contract ≈5 km / 326 mln. |
| Tram street km | **115 mln PLN/km** | Poznań Naramowice 380 mln / 3.3 km (includes large road package). |
| BRT dedicated km | **16 mln PLN/km** | Wrocław Jagodno ≈15.8 mln/km; Gdańsk Spacerowa estimate similar. |
| Bus street km | **0** | Assumption: existing roadway. |
| Rail new km | **160 mln PLN/km** | PLK Podłęże–Gdów ~3.2 mld / ~20 km. |
| Rail existing km | **0** | Assumption: stations only. |
| Station underground | **0** with all-in metro km | Avoid double-count; no clean metro station-only source. |
| Station elevated | **stop-and-ask** | No Polish source. |
| Tram stop | **0.04 mln PLN** | Kraków shelter tender ≈41.5 tys. zł. |
| Rail halt | **26 mln PLN** | Kraków Piastów 26.3 mln. |
| bus12 | **3.14 mln PLN** brutto | Częstochowa Urbino 12e, buses only, 2026. |
| bus18 | **4.0 mln PLN** brutto | Szczecin Urbino 18e, 2021. |
| tram30 | **17 mln PLN** brutto | TŚ/Pesa ~25 m, 2024–25 GZM market (see disagreement). |
| emu3 | **30 mln PLN** netto | KŚ Impuls **4-car** unit price 2023 (length mismatch). |
| metro6 | **30.6 mln PLN** netto | Warsaw Inspiro 2011. |
| opCostPerStationYear | **stop-and-ask** | No Polish per-station O&M found. |
| annualFactor | **365** | Assumption: calendar year. |
| fareRevenuePerTrip | **do not show until 23b** | Document 244 mln revenue and 39.419 mln tickets; no published annual boardings. |

## Disagreements greater than 2×

### 1. Tram vehicle unit cost (`tram30`)

| Source | Figure | Year | Notes |
| --- | ---: | --- | --- |
| MPK Kraków / Stadler Lajkonik (~33.4 m) | **7.27 mln PLN netto**/unit (≈8.9 mln brutto at 23% VAT) | Contract ~2018; deliveries through 2021 | <https://www.portalsamorzadowy.pl/finanse/krakow-ostatni-50-tramwaj-lajkonik-dotarlo-do-mpk,305916.html> |
| Tramwaje Śląskie / Pesa (~25 m) | **~17.05 mln PLN brutto**/unit (170.5 mln / 10) | Accepted offers Dec 2024 | <https://portalkomunalny.pl/miliard-zlotych-na-65-nowych-tramwajow-dla-gornego-slaska-572670/> |

Ratio ≈ **1.9–2.4×** depending on VAT treatment of the Kraków net price. **Recommend 17 mln brutto** as default: current GZM-operator market price. Downside: ordered length is 25 m, while the model vehicle is labelled 30 m. Alternative if owner wants length match: Kraków 7.27 mln netto for ~33 m, knowing it is an older price basis.

### 2. Tunnel tram vs surface tram (context for segregated default)

| Source | Figure | Year |
| --- | ---: | --- |
| Kraków Łagiewniki–Kurdwanów (1.7 km, tunnel + underground stop) | **840 mln** ≈ **494 mln/km** | Opened 2022 — <https://www.mainspring.co.uk/industry-news/krak%C3%B3w-tramway-expansion-continues/> |
| Kraków Górka Narodowa (~5 km surface KST) | **~65–70 mln/km** | 2017–2023 |

Ratio ≈ **7×**. **Do not** use the tunnel line as `tramSegregated`. Keep tunnel tram as a future alignment type if needed; default segregated = Górka Narodowa class.

### 3. Metro tunnel all-in per km (central vs extensions) — under 2× but material

| Source | Approx. PLN/km | Year / basis |
| --- | ---: | --- |
| M2 central (construction ~4.06 mld / ~6.1–6.5 km; higher if RS included) | **~600–980 mln/km** | 2009–2015 — portalsamorządowy / Transit Costs <https://transitcosts.com/warsaw-line-2-2/> |
| M2 Trocka / KJ extensions | **~337–345 mln/km** | 2015–2020 — Transit Costs extension pages |

Ratio ≈ **1.8–2.9×** if comparing RS-inclusive central to extensions. **Recommend ~340 mln/km** (extensions, no RS). Rolling stock is `vehicleCost.metro6`.

## Fare revenue (GZM) — brief 23b gate

| Quantity | Value | Source |
| --- | ---: | --- |
| Ticket sales revenue (GZM budget, 2024) | ≈ **244 mln PLN** | <https://dwakwadranse.pl/metropolia-z-absolutorium-za-2024-rok-transport-rowery-i-walka-ze-smogiem-priorytetami-gzm/> |
| Tickets sold (ZTM, 2024) | **39.419 mln** | ZTM figures via <https://katowice24.info/artykul/systematycznie-rosnie-n1513076> |
| Revenue ÷ tickets sold | ≈ **6.19 PLN / ticket** | Derived; **not** fare per boarding |
| Annual passengers / boardings | **not found** | Do not invent. Period tickets cover many trips; tickets ≠ boardings |

Until brief **23b** fits ASC and boardings are trusted, Budget UI must **hide** the revenue line (roadmap 31). Document the 244 mln and 39.419 mln now so a later `fareRevenuePerTrip = revenue ÷ boardings` can be filled when boardings are cited.

## Stop-and-ask (no invented PLN)

1. **`capitalCostPerKm.metroElevated`** — Poland has no elevated metro project to cite.
2. **`costPerStation.elevated`** — same.
3. **`opCostPerStationYear`** — no Polish per-station annual O&M published in sources checked; vehicle-km opex also still needs its own sourced pass.
4. **True `fareRevenuePerTrip`** — need cited annual boardings (or passenger-trips), not ticket sales alone.
5. **`vehicleCost.emu3` length** — accept 30 mln netto as 4-car KŚ proxy, or wait for a cited 3-car pure-electric unit price (ŁKA middle-car add-on is not a full unit price).
6. **`tram30` default** — confirm 17 mln (TŚ) vs 7.27 mln netto (Kraków Lajkonik).
7. **Inflation / common price year** — all figures left in nominal contract years; owner may want a single real-PLN base year before coding.

## Notes on other parameters

- **Tram street vs segregated:** Poznań Naramowice (street corridor + roads) is *more* expensive per tram-km than Kraków’s segregated Górka Narodowa line. That is real project scope, not a modelling error. If the sandbox “street” means shared lane with minimal civils, the owner may prefer a lower assumption — but no thin Polish “paint + kerb only” tram rebuild was found at a clean per-km rate; do not invent one.
- **BRT:** Polish “buspas” projects are lane conversions/corridor rebuilds, not full Latin-American BRT. 16 mln/km is dedicated-lane corridor class.
- **Rail new:** Podłęże–Gdów includes tunnels/structures; mountain Podłęże–Piekiełko sections are higher (~150+ mln/km still, sometimes more). 160 mln/km is a planning mid for new double track near cities.
- **Underground station cost:** Łódź Koziny underground rail halt ≈188 mln (2021, PLK) is cited only as typology context — not used as metro `costPerStation` default. <https://www.nakolei.pl/pod-lodzia-powstanie-trzeci-podziemny-przystanek-kolejowy-plk-podpisaly-umowe-warta-188-mln-zl/>
- **Metro vehicles:** 2011 Inspiro price is old; no newer Warsaw 6-car unit price was needed for the default once the 35-train contract is cited. Owner may refresh later.

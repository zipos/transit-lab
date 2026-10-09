# Model parameters

Values live in `src/sim/params.js`. A region may override them with `demand.choice` in its `region.json`. It cannot set `asc`: `resolveChoice` forces the boarding constant to 0 until brief 23b.

Generalized cost used for the transit search, in minutes:

`in-vehicle time + walkWeight × (access + egress + transfer walk) + waitWeight × wait + transferPenalty × (boardings − 1) + boardMinutes × boardings + alightMinutes × alightings`

The first boarding does not pay the transfer penalty. Later boardings do.

| Key | Value | Status |
| --- | ---: | --- |
| `walkWeight` | 2 | Starting value from brief 23. Assumption for GZM. Out-of-vehicle walking is commonly valued well above in-vehicle time; Wardman, M. (2004), “Public transport values of time”, *Transport Policy* 11(4), is the survey behind that range. Not estimated on this network. |
| `waitWeight` | 1.5 | Starting value from brief 23. Same status as `walkWeight`. |
| `transferPenalty` | 5 min | Starting value from brief 23. Assumption. Applied once per boarding after the first. |
| `waitAwareHeadway` | 10 min | Assumption from brief 23. At or below this headway, wait is half the headway (random arrival). |
| `waitLongFactor` | 0.3 | Assumption from brief 23. Above 10 minutes, wait is `5 + 0.3 × (headway − 10)`, because a rider can time their arrival. No separate published source for the 0.3 coefficient was used. |
| `boardMinutes` | 1 | Assumption. One minute to board, unweighted. Kept from the previous door time so boarding is not free. |
| `alightMinutes` | 0.3 | Assumption. Time to step off, unweighted. Also the floor on a scheduled step so a timetable difference cannot be zero. |
| `lambda` | 0.05 per generalized minute | Assumption. A 20-minute gap in generalized cost multiplies the odds by about *e*. Not chosen to match a ridership total. |
| `asc` | 0 | Required. Brief 23b is the only place this may move. The results label says the share is not calibrated. |
| `walkExcludeKm` | 1.2 | From brief 23. Shorter straight-line trips are walking. They are counted and left out of the share. |
| `carDetour` | 1.35 | Assumption from brief 23. Car time is straight distance × 1.35 ÷ speed. |
| `denseCarKmh` / `midCarKmh` / `otherCarKmh` | 18 / 26 / 40 | Assumption from brief 23. Density bands are 8,000 and 3,000 residents/km². The origin–destination speed is the harmonic mean of the two ends. |
| `carAccessMinutes` | 3 | Assumption from brief 23. Added to car generalized minutes at weight 1. |
| `carParkingMax` | 10 min | Assumption from brief 23. Linear in destination density from 0 up to `carParkingDensity` (8,000 residents/km²), then capped. |
| `satisfactionScale` | 20 min | From brief 23. Satisfaction is `50 + 50 × tanh((GC_car − GC_transit) / 20)`, averaged over transit riders, then rounded to a whole number. |
| `rapidAccessKm` | 0.8 | Straight line from a population cell to a tram, rail, or metro stop that runs in the period. |
| `tripRate` | 0.6 | Existing game assumption: cross-zone trip opportunities per resident per day. Not a survey result. Set on the region as `demand.tripRate`. |

Door-to-door time reported in the results is clock minutes (walk, wait, ride, board, alight), not the weighted generalized cost. The search itself minimizes generalized cost.

## Plausibility, peak, model version 4

Run on 28 September 2026 against `data/gzm` network `2026-09-23-gzm-v5`. ASC is 0.

| | Modeled | Published comparison |
| --- | ---: | --- |
| Region transit share, trips longer than 1.2 km | 8.7% | 23.5% of non-walk trips, and 16% of all trips, in the 2018 household survey for the central subregion of Silesia (train 0.4%, urban bus 13%, tram 2.5%, trolleybus 0.1%). Cited by the GZM K-KM synthesis from *Studium transportowe Subregionu Centralnego Województwa Śląskiego 2018*, figure 2.1. <https://bip.metropoliagzm.pl/attachments/download/188456> |
| Trips that both start and end in Katowice | 14.7% | That study does not publish a Katowice-only split. |
| Region transit trips | 115,332 | Not compared with an annual ridership total. Brief 23b does that. |
| Satisfaction | 10 | The formula, not a survey. A low score means the unweighted car alternative is faster in generalized minutes than weighted transit. |

The gap versus 23.5% is expected. The constant is 0 on purpose. Destinations are still the housing proxy from brief 21, not workplaces. The survey is all purposes in 2018 for a subregion, and this model is a peak logit on a gravity matrix. Do not close the gap by editing `asc` here.

## Flows and crowding (brief 24)

Passenger totals do not change when vehicle capacity changes. Capacity is used only for volume/capacity. The published baseline has no fitted boarding constant, so flows stay unscaled and the panel says they are not calibrated.

| Parameter | Value | Why |
| --- | --- | --- |
| `peakHourShare` | 0.10 | Assumption from brief 24. Peak-hour flow is the daily assigned flow times this share. Not taken from a counted peak profile. |
| `crowdAlpha` / `crowdBeta` / `crowdVc0` | 0.6 / 2 / 0.8 | Assumptions from brief 24. A ride's generalized cost is multiplied by `1 + 0.6 × max(0, v/c − 0.8)²`. In-vehicle time itself is unchanged. |
| Crowding iterations | 3 | The first result has no crowding. Two further searches use the method of successive averages, with weights 1/2 and 1/3 on the new flow. The replaced result is labeled refined. |

Vehicle capacity is seats plus standing at 4 people per square metre. Standing places in Bujak, Bujak and Kucharski, *Sustainability* 2025, 17(13), 5835, Table 1, are at 5 people per square metre (0.2 m², the Polish rule cited in that paper). Standing is rescaled by 4/5. <https://www.mdpi.com/2071-1050/17/13/5835>

| Mode in the model | Vehicle | Seats | Standing at 5/m² | Capacity at 4/m² |
| --- | --- | ---: | ---: | ---: |
| Bus | Solaris Urbino 12 LF electric | 28 | 50 | 68 |
| Bus, not the default | Solaris Urbino 18 LF electric | 42 | 88 | 112 |
| Tram | Pesa low-floor tram, 30 m | 40 | 175 | 180 |
| Rail | Stadler Flirt, 3 cars | 154 | 252 | 356 |
| Metro | Six-car metro | 244 | 940 | 996 |

The live bus mode uses the 12 m figure. The articulated bus is recorded for a later vehicle-size control. A Solaris press figure of "up to 100" for the Urbino 12 electric is a weight limit, not this 4 people/m² capacity.

## Flow map bands (brief 33)

The passenger-flows layer sums assigned daily segment flow across every pattern that shares the same **undirected stop-pair and mode**, then draws one straight band between those stops. Line width scales with `√daily`. Colour is by mode, or by peak-hour v/c when "Show crowding" is on. Parallel patterns on the same street therefore merge per mode rather than stacking offset ribbons. Station circles use stop boardings from the same flow table. The layer rebuilds only when stats change.

Travel-time maps use a single-origin graph search from the clicked point (walk seeds to nearby stops). Door-to-door clock minutes colour the resident grid in 10-minute bands to 60. Winners/losers colour cells by the change in destination attraction reachable within 45 min generalized cost, scenario versus baseline, accumulated cheaply during the main assignment.

## Capital and fleet costs (brief 31)

Planning-level unit costs for optional Budget mode. Figures are **nominal PLN millions** unless noted. Price basis is the contract or reporting year of the cited project, not inflated to a common year. Full choices, disagreements >2×, and stop-and-ask items: `docs/decisions/31-cost-sources.md`.

Where a line capital figure already includes stops/stations, the matching `costPerStation` default is **0** so the model does not double-count. Fare revenue must not be shown until brief 23b calibrates boardings.

| Parameter | Value (PLN) | Year / price basis | Source |
| --- | ---: | --- | --- |
| `capitalCostPerKm.metroTunnel` | **340 mln / km** | 2017–2020 contracts | Warsaw M2 extensions, all-in (tunnels + stations, no rolling stock): Trocka 1,070 mln / 3.1 km ≈ 345 mln/km; KJ 1,148 mln / 3.4 km ≈ 337 mln/km. Transit Costs Project: <https://transitcosts.com/warsaw-line-2-extension-to-trocka/>, <https://transitcosts.com/warsaw-line-2-extension-to-kj/>. Central M2 was ~600–980 mln/km (see decision note; >1.5× extensions). |
| `capitalCostPerKm.metroElevated` | **null** (stop-and-ask) | — | No Polish elevated metro found. Code leaves the rate unset so totals do not invent a figure; pending key is listed until the owner chooses (`docs/decisions/31-cost-sources.md`). |
| `capitalCostPerKm.tramSegregated` | **65 mln / km** | 2017 contract / 2023 opening | Kraków Krowodrza Górka–Górka Narodowa: contract 326.2 mln brutto for ~5 km double track (later ~350 mln with extras) → ~65–70 mln/km, segregated with structures/P+R. Magiczny Kraków: <https://www.krakow.pl/aktualnosci/208328,29,komunikat,wiemy__kto_zbuduje_tramwaj_do_gorki_narodowej_.html>; MI summary: <https://www.gov.pl/web/infrastruktura/krakowski-szybki-tramwaj-miedzy-krowodrza-gorka-a-gorka-narodowa>. |
| `capitalCostPerKm.tramStreet` | **115 mln / km** | 2019 contract | Poznań Wilczak–Naramowice: ~380 mln for 3.3 km tramway **plus** ~7.5 km roads/junctions → ~115 mln per tram-km (road-heavy street corridor). PIM: <https://www.pim.poznan.pl/aktualnosci/informacje-archiwalne/podpisano-umowe-na-budowe-trasy-tramwajowej-na-naramowice>. Higher than Kraków segregated because of the road package; use as street-rebuild corridor, not paint-only. |
| `capitalCostPerKm.brtDedicated` | **16 mln / km** | 2023–2025 planning/contracts | Wrocław Jagodno corridor: 42.68 mln for ~2.7 km bus (tram-ready) corridor ≈ 15.8 mln/km. <https://24wroclaw.pl/artykul/buspas-na-jagodno-miasto-n1425882>. Cross-check Gdańsk Spacerowa estimate ~97–100 mln / 5.7 km ≈ 17 mln/km. |
| `capitalCostPerKm.busStreet` | **0** | — | **assumption.** Ordinary mixed-traffic bus uses existing roadway; capital is stop furniture only (see `costPerStation.tramStop` / shelter). |
| `capitalCostPerKm.railNew` | **160 mln / km** | 2026 contract | PKP PLK Podłęże–Gdów (Podłęże–Piekiełko): ~3.2 mld brutto for ~20 km new double track with stations and structures ≈ 160 mln/km. <https://www.plk-sa.pl/o-spolce/biuro-prasowe/informacje-prasowe/szczegoly/podleze-piekielko-nowoczesna-kolej-polaczy-krakow-z-gdowem-11514>. Mountain sections are higher; this is the nearer Kraków flat-ish section. |
| `capitalCostPerKm.railExisting` | **0** | — | **assumption.** Running on existing track: capital is stations/halts only. |
| `costPerStation.underground` | **0** (when using all-in metro km) | — | **assumption.** Warsaw M2 published costs bundle stations with tunnels; no clean station-only Polish metro figure. Set 0 with all-in `metroTunnel` km so stations are not double-counted. Deep rail halt Łódź Koziny ~188 mln (2021) is a different typology — see decision note. |
| `costPerStation.elevated` | — | — | **stop-and-ask.** No Polish elevated metro/rail station-only figure found. |
| `costPerStation.tramStop` | **0.04 mln** | 2026 tender offers | Kraków ZTP: supply+mount 100 shelters; lowest offer 4.148 mln brutto → ~0.0415 mln per shelter. <https://transinfo.pl/infotrans/cztery-oferty-na-100-wiat-przystankowych-w-krakowie/>. Platforms/trackwork sit in line km when using all-in tram rates. |
| `costPerStation.railHalt` | **26 mln** | 2024 delivery | Kraków Piastów halt: 26.3 mln (Swietelsky). Simpler halts Kraków Kościelniki + Przylasek >19 mln for two (~9.5 mln each). Default uses Piastów (interchange-quality). <https://krknews.pl/kolejarze-uruchomia-w-ten-weekend-trzy-nowe-przystanki-krakow-piastow-krakow-koscielniki-i-krakow-przylasek/>. |
| `vehicleCost.bus12` | **3.14 mln** brutto | 2026 | MPK Częstochowa: 4× Urbino 12 electric = 12.556 mln brutto (buses only; chargers separate). <https://www.mpk.czest.pl/aktualnosci/2026/08/umowa-na-zakup-nowych-autobusow-elesktrycznych-podpisana>. |
| `vehicleCost.bus18` | **4.0 mln** brutto | 2021 | Szczecin: 8× Urbino 18 electric, contract 32 mln → 4.0 mln/unit. <https://kurier-kolejowy.pl/aktualnosci/36909/zeroemisyjne--przegubowe--niskopodlogowe--8-solarisow-urbino-18-electric-dla-szczecina.html>. Kraków 2020 batch 50×18e was 165.435 mln **including** plug-in chargers (~3.31 mln all-in). |
| `vehicleCost.tram30` | **17 mln** brutto | 2024–2025 | Tramwaje Śląskie / Pesa: accepted offer ~170.5 mln brutto for 10× ~25 m trams → ~17.05 mln/unit (GZM-local, current market). <https://portalkomunalny.pl/miliard-zlotych-na-65-nowych-tramwajow-dla-gornego-slaska-572670/>. Kraków Stadler Lajkonik ~33 m was **7.27 mln netto**/unit (~2018–2021) — disagree >2×; see decision note. |
| `vehicleCost.emu3` | **30 mln** netto | 2023 | Koleje Śląskie / Newag: 3× **four-car** Impuls = 90 mln netto for vehicles → 30 mln/unit. Closest published electric EMU purchase for the GZM region; model capacity is 3-car Flirt — **length mismatch flagged**. <https://www.newag.pl/wp-content/uploads/2025/01/Raport-biezacy-nr-23-2023.pdf>. Pure 3-car electric unit prices are scarce (hybrids are not used as default). |
| `vehicleCost.metro6` | **30.6 mln** netto | 2011 | Metro Warszawskie / Siemens–Newag: 35× six-car Inspiro = 1,069.594 mln netto → 30.56 mln/unit. <https://wiadomosci.onet.pl/warszawa/podpisano-umowe-na-dostawe-nowych-pociagow-metra/m23k7v0>. |
| `opCostPerStationYear` | — | — | **stop-and-ask.** No Polish published per-station annual O&M figure found for metro/tram/rail. Vehicle-km operating rates are out of scope of this table until sourced separately. |
| `annualFactor` | **365** | — | **assumption.** Converts model daily operating cost and (when calibrated) revenue to a calendar year. Weekday-only annualization (~250–300) would understate weekend service; owner may override. |
| `fareRevenuePerTrip` (GZM) | **documented, UI gated** | 2024 | Ticket **revenue** ≈ **244 mln PLN** (GZM 2024 budget reporting). <https://dwakwadranse.pl/metropolia-z-absolutorium-za-2024-rok-transport-rowery-i-walka-ze-smogiem-priorytetami-gzm/>. Tickets **sold** 39.419 mln (ZTM via Katowice24). <https://katowice24.info/artykul/systematycznie-rosnie-n1513076>. Revenue ÷ tickets sold ≈ **6.19 PLN per ticket sold** — **not** per boarding. Annual boardings/passengers were **not** published in sources found, so true revenue÷passengers is **not computed** (no invented ridership). Brief **23b** gates fare revenue UI until ASC/boardings are calibrated. |

**Tunnel tram (context, not a default mode):** Kraków Łagiewniki–Kurdwanów 1.7 km with tunnel stop cost PLN 840 mln (2022) ≈ 494 mln/km — more than 2× surface tram; do not use as `tramSegregated` default. <https://www.mainspring.co.uk/industry-news/krak%C3%B3w-tramway-expansion-continues/>.

# 02 · GTFS import quality

**Phase 0 · Size M · Depends on 01 · Review: yes (data logic)**

## Why

`data/import_gtfs.py` throws away information the feeds already contain, and the simulation then approximates it badly:

- It ignores `pickup_type` and `drop_off_type`. As a result, 410 virtual fare-zone markers (`granica BYTO - CHOR (Łagiewniki)`) and technical stops (`Stroszek Pętla [tech]`) are boardable stops in 593 patterns. The GZM GTFS spec says explicitly that passenger-facing stops must be filtered with these fields.
- It ignores `arrival_time`. Run times are then invented from fixed speeds (bus 22 km/h, tram 25 km/h) in `sim.js`.
- Its interval is `840 / all-day trips`, clamped to 6–90 min. Night and late-evening trips dilute it, so it isn't the peak service players care about.
- It copies `route_color` verbatim. For GZM that is `#000000` for every tram and most buses, and `#FFFFFF` for Koleje Śląskie rail.
- Koleje Śląskie has no `direction_id`, and each `route_id` variant becomes its own pattern. S1 alone appears as 10 separate "→" entries.
- Platforms of the same interchange are unrelated stops, so the simulation only links them through a 340 m walk.

## Scope

In `data/import_gtfs.py`:

1. **Passenger stops only.** Drop a `stop_times` row from a pattern's sequence when `pickup_type == "1"` and `drop_off_type == "1"`. Keep boarding-only and alighting-only stops, but record them per pattern as `noBoard: [indices]` and `noAlight: [indices]`, omitting empty arrays. As a safety net, fail the import when any output stop name matches `^granica\b` (case-insensitive) or contains `[tech]`.
2. **Scheduled run times.** For each output pattern, compute `times`: minutes from the first stop to each stop.
   - Take the median over all trips of that pattern that depart between 06:00 and 09:00. Fall back to all trips if none do.
   - Parse times over 24:00. Force times to be non-decreasing, and use at least 0.3 min per segment.
3. **Dayparts, for brief 06.** The pinned service date is a Wednesday. Also resolve one Saturday in the same feed (the first Saturday on or after that date with calendar service) and record both dates on the network.
   Per pattern, store `dayparts`:
   - `peak`: departures 06:00–09:00 on the Wednesday. `headway` = 180 ÷ those departures, rounded, clamped to 2–120. `times` = median scheduled minutes from the first stop. `trips` = that departure count.
   - `midday`: the same for 10:00–13:00 on the Wednesday.
   - `saturday`: the same for 10:00–13:00 on the resolved Saturday, using Saturday's `service_id`s.
   - A daypart with zero departures is `null`.
   - Top-level `headway`, `times`, and `dailyTrips` copy the peak daypart, so the current simulation keeps working before brief 06. `dailyTrips` remains the Wednesday count for that direction. If peak is null, fall back to midday, then to `headway = round(840 / dailyTrips)`.
4. **Colors.** Output `color` only when it is a meaningful brand color. Treat `#000000`, `#FFFFFF` and anything with a relative luminance above 0.9 or below 0.03 as missing, and omit the field. Keep the raw value as `sourceColor` for reference.
5. **Pattern selection for feeds without `direction_id`** (Koleje Śląskie):
   - Group trips by `route_short_name`, not `route_id`.
   - Within a line, cluster trips by their clipped (first stop, last stop) pair.
   - **Keep every cluster with at least 2 weekday trips.** Do not drop a short turn because it is a small share of the line, and do not cap the number of clusters. Brief 13 hides the duplicates in the list. Deleting them here deletes service from the model.
   - Infer direction by comparing each cluster's stop order with the largest cluster's.
   - Do not apply this clustering to feeds that have `direction_id` (GZM buses and trams). Depot and technical trips still leave through the passenger-stop filter in step 1.
6. **Stop areas.** Add `area` to each stop: a stable id shared by platforms with the same normalized name (strip `nż`, platform numbers and case) within 250 m. Use `parent_station` when the feed provides it. Unmatched stops get their own `area`. Write an `areas` array `{ id, name, pos }` (centroid) next to `stops`.
7. **Version.** Bump `version` to `2026-09-23-gzm-v5`, and add `2026-09-23-gzm-v4` to `LEGACY_VERSIONS` in `app.js`. Stop ids (`ztm:1234`) must not change, so saves stay valid. `normalizeScenario` already drops stop ids that no longer exist, and virtual stops will disappear from edited patterns, which is intended.

In `sim.js` (keep changes minimal; bigger engine work is brief 20):

- When a route has `times` and isn't `edited`, the ride edge from stop i to i+1 costs `times[i+1] - times[i]` instead of distance ÷ speed. Keep the current formula as the fallback.
- Operating cost uses `dailyTrips` when present and unedited. When the player changes the interval, scale it as `dailyTrips × originalHeadway ÷ newHeadway`. Keep `840 / headway` for player lines.
- Respect `noBoard` / `noAlight` by skipping the board or alight edge at those indices.
- Walking transfers within the same `area` cost 2 min flat instead of the distance formula.

In `app.js`:

- `routeColor(r)` falls back to the mode color when `r.color` is missing.
- The stop inspector groups the services of every stop in the same `area`, so a tram and bus interchange reads as one place.

In `tests/`:

- Add assertions: no stop name matches the virtual or technical patterns; every non-player route with `times` has non-decreasing values of the same length as `stopIds`; every Koleje Śląskie pattern has at least 2 weekday trips; a short-turn cluster with at least 2 trips is still present; no route color is `#000000` or `#FFFFFF`; each pattern has `dayparts.peak`, `dayparts.midday`, and `dayparts.saturday` (object or null).

## Acceptance checks

- The import runs, and the audit passes with the new assertions. Record the new baseline numbers (trips, wait, journey, satisfaction, and calculation time) in the PR description next to the old ones.
- The average wait falls, since peak headways are shorter than all-day averages. Explain any large shift in passenger totals.
- In the browser, T6's stop list no longer contains `[tech]` or `granica` entries, and it draws in the tram color.
- An exported v4 scenario that edited T6 imports cleanly.

## Stop and ask if

- Some feed has no `stop_times` arrival values for a large share of trips (more than 10%).
- You cannot find a Saturday with service in the feed.

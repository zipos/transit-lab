# 21 · Demand v2: zones and access

**Phase 2 · Size L · Depends on 20 · Review: yes**

## Why

This is the most important change for fun and realism. Today, 2.24M residents collapse into 53 municipality anchors, one or two per municipality, and each anchor reaches only stops within 1.4 km of its point (at most 8).

- Only 1,796 of 7,672 stops can ever be used.
- "Katowice 1" sits about 2.7 km south of the city centre.
- A 5-station, 3-minute Katowice–Sosnowiec metro changes the total by about 4%, and a 2-station one by 0.13%. Player stations away from an anchor point do nothing at all.
- Warsaw, a single municipality of about 1.8M people, would get two zones.

## Scope

### Offline zone building (`data/lib/zones.py`, called by `build_region.py`)

1. Start from populated 1 km GUS cells (population > 0) with their municipality.
2. **Deterministic agglomeration:** repeatedly merge the lowest-population zone into its 4-neighbour in the same municipality with the lowest population (tie-break by cell id). Stop when the zone count ≤ `demand.zoneTarget` from the manifest (GZM: start with 450) *and* every zone has ≥ `demand.minZonePop` residents (default 1,500).
   - Cells with ≥ 5,000 residents are never merged. In the current GZM grid that is 124 cells. 392 cells already have ≥ 1,500 residents, and the smallest municipality has 5,730, so a 450-zone target is feasible here.
   - Isolated cells with no same-municipality neighbour merge with the nearest zone in the same municipality.
   - If a municipality's total residents are under `minZonePop`, it stays one zone. Do not drop it and do not borrow cells from a neighbour. GZM does not hit this; later regions will.
3. Each zone stores:
   - `id`, `municipality`, `residents`;
   - `centroid`, weighted by population;
   - `cells`, as indices into the population cells, each with lon, lat and population, so access can be computed at runtime for player stations;
   - `density`.
4. **Access lists for published stops.** For each zone and each stop:
   - `walkMin` = population-weighted mean over the member cells of `distance × 1.25 / 4.5 km/h`;
   - keep stops with `walkMin ≤ 15` for bus and tram, and ≤ 20 for rail and metro;
   - keep at most 16 per zone, but always the 3 best per mode that is present.
   
   Store them as `access: [[stopIndex, walkMin], …]`. Access and egress are symmetric.
5. Write `zones` into `data/<region>/population.json`, or a separate `zones.json` if large, keeping the file under about 3 MB compressed. Report the size.

### Runtime (`src/sim/model.js`)

- Origins are zones, weighted by residents. Destinations still use the **existing proxy** (residents, density and centrality), now computed per zone and relative to the *region* centre-of-mass, until brief 22 replaces it. Keep today's distance decay `1/(1 + d/6)` until brief 23.
- **Player stops.** For each player stop, compute its access to nearby zones at runtime from the member cells, with the same thresholds. It can be the 17th entry; never push a published stop out.
- Local results aggregate zones by municipality, as before. Add an optional per-zone output (`zoneStats`: trips from and to the zone, average journey) for brief 33.
- Keep `estimatedDemand = residents × tripRate` (`demand.tripRate`, default 0.6) until brief 23.
- **Access layer.** The map layer that colors cells by "tram and rail access" must use the same walk minutes as the model (population-weighted cell distance, factor 1.25, 4.5 km/h), not a separate straight-line distance from the cell center. A cell that is a short walk in the model is the same color family on the map. Brief 33's travel-time layer is separate and comes later.

### Tests (extend the audit)

- More than 90% of stops that lie within 1 km of any populated cell appear in at least one access list.
- **Sensitivity:** a 5-station, 3-minute metro through the dense Katowice–Sosnowiec corridor gains at least 3× more trips than the same metro shape translated 8 km into low-density area. Pick coordinates with fewer than 500 residents per km² and document them.
- **Locality:** adding a station at a dense cell far from any old anchor changes trips in that cell's zone.
- Zone building is deterministic: two runs produce identical output.
- Performance: a full run is ≤ 2 s on the reference laptop with brief 20's laptop worker count. The same run with one worker (the phone budget) is reported in the PR. If one worker exceeds 6 s, lower `zoneTarget` in steps of 50 and report the curve of zones against seconds against baseline trips. Do not meet the laptop budget by spawning more workers on phones.

## Acceptance checks

- All tests pass. The PR reports the new baseline (trips, demand served, average journey, wait) and the two metro probes, before and after.
- Existing saves load and compute.
- The map's context menu shows the clicked cell's zone id and residents, for debugging, when `?debug=1` is set.

## Stop and ask if

- The GZM baseline passenger total moves by more than 5× in either direction. Calibration happens in brief 23, but a jump that large suggests a bug.
- The zone data pushes the region download above about 6 MB compressed.

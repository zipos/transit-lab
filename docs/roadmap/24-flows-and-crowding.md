# 24 · Passenger flows and crowding

**Phase 2 · Size L · Depends on 23 · Review: yes**

Brief 23b may not have landed yet. Compute flows from brief 23's probabilities either way. When `baseline.json` has a fitted ASC, scale flows so total boardings match that baseline. When it does not, show the flows and label them "not calibrated". Do not invent a scale factor.

## Why

Capacity is computed but never used. Players can't see where people ride, which lines are overloaded, or which stations are busiest, and that information is the core feedback loop of a transit game. Route choice also ignores crowding, so a 5-minute bus "carries" a metro's load.

## Scope

### A. Flow assignment (report only)

- During each origin's search, keep a predecessor-edge `Int32Array`, reused between origins.
- For each served OD pair, walk back from the chosen egress node and add `demand × P(transit)` to:
  - each ride edge, mapped to (pattern, segment index);
  - boardings and alightings per stop;
  - transfers per stop `area`.
- Accumulate per worker and merge on the main thread. Return `Float32Array`s as transferables: `segmentFlow` per pattern (flattened, with offsets) and `stopBoardings`.
- Scale to the fitted boardings from brief 23b when `baseline.json` contains an ASC. Otherwise leave the raw flows and label them "not calibrated".
- **Peak hour.** Peak-hour flow = daily × `peakHourShare` (params; start at 0.10, marked as an assumption unless sourced).
- **Capacity per segment** = (60 / headway) × vehicle capacity. Add `capacity` per mode to `src/modes.js`, using cited or clearly marked planning values for a standard vehicle or trainset at 4 passengers/m² standing:
  - 12 m bus, 18 m articulated bus, 30–33 m tram;
  - a regional EMU, a 6-car metro.
  
  Let player lines choose the vehicle size later (brief 30).
- **Outputs:** per pattern, riders, peak max load (v/c) and the busiest segment; per stop, daily boardings; network-level count of overloaded segments (v/c > 1) and passenger-km.

### B. Crowding feedback (behind a flag, then default on if time allows)

- Use the method of successive averages with 3 iterations.
- Ride cost multiplier: `1 + α·max(0, v/c − 0.8)^β`, with α = 0.6 and β = 2 as documented assumptions unless sourced.
- To stay inside the 1–2 s budget:
  - the first result (no crowding) shows immediately;
  - the refined result replaces it when ready, labeled "refined" with a small progress bar;
  - edits cancel refinement.

### C. UI hooks

Brief 33 draws the map layers; this brief only adds panel data.

- The line inspector shows daily riders, peak max load (colored bar) and the busiest segment ("Rondo → Rynek, 118% at peak").
- The stop inspector shows daily boardings and transfers.
- The Results tab lists the top 5 overloaded segments, with "Show on map" buttons that select the line and fit to the segment.

## Acceptance checks

- Conservation: the sum of stop boardings equals trips × (1 + average transfers) within 0.5%. Flows on a pattern's first segment equal boardings at its first stop.
- Invariants hold with crowding off. With crowding on, adding capacity (a shorter interval) on an overloaded segment never increases its v/c.
- Performance: without refinement, a full run stays under 2 s. Report refinement time separately.
- A test adds a heavy corridor demand scenario (a metro parallel to a tram) and asserts that the metro carries more than the tram after assignment.

## Stop and ask if

- Transferring flow arrays per recalculation adds more than 100 ms. Then consider sending flows only for patterns the UI currently shows.

# 20 · Simulation engine performance

**Phase 2 · Size L · Depends on 11 · Review: yes**

## Why

One full `calculate` takes about 1.7 s for 53 zones: 53 Dijkstra runs over about 43k nodes, at roughly 32 ms per run. Brief 21 raises the zone count to about 300–600, which would take 10–20 s with today's code. The owner's budget is **about 1–2 s after an edit**.

The current search is also not exactly correct. Its costs depend on state (`+4` min only when `boards[at] > 0`, and walking banned until `boards[at] > 0`), which label-setting Dijkstra doesn't handle exactly.

## Scope

### A. Layered graph with fixed edge costs

The current search adds a transfer penalty only when `boards[at] > 0` and forbids walking until then. Those costs depend on path state, which this Dijkstra does not solve exactly. Replace the `boards[]` state with node layers, so every edge cost is fixed.

This is still a frequency model: wait is a function of headway, not of a clock time. It is not a scheduled-trip router. Do not describe it as exact timetable routing.

| Node | Meaning |
| --- | --- |
| `A(s)` | At stop *s*, not yet boarded. Zone access edges end here. |
| `T(s)` | At stop *s* after alighting. |
| `W(s)` | At stop *s* after a walking transfer. |
| `On(p,i)` | On board pattern *p* at its *i*-th stop. |

| Edge | Cost |
| --- | --- |
| `A(s) → On(p,i)` | wait(h) + 1 (first boarding: no transfer penalty) |
| `T(s) → On(p,i)`, `W(s) → On(p,i)` | wait(h) + 1 + transferPenalty |
| `On(p,i) → On(p,i+1)` | ride time (scheduled `times` from brief 02, or the fallback) + dwell |
| `On(p,i) → T(s)` | 0.3 (alight) |
| `T(s) → W(s')` | walk time between nearby stops (same `area`: 2 min flat) |

- Destinations read only `T(s)`, which removes the "must have boarded" check.
- Track wait and boardings along the chosen path with parallel typed arrays, updated on relaxation. They are attributes only; they never enter the cost.
- Respect `noBoard` / `noAlight` by omitting those edges.
- Keep today's constants (wait = h/2, transfer penalty 4) so results stay comparable. Brief 23 changes them.

### B. Typed-array CSR graph

- Store the graph as `Int32Array` offsets and targets, with `Float32Array` costs and a `Uint8Array` edge kind.
- Use a binary heap on parallel `Float64Array` keys and `Int32Array` values with lazy deletion, reusing its buffers between runs.
- Don't allocate objects inside the search loop.
- Build the **static base graph once** per worker lifetime. On each scenario:
  - remove nothing;
  - mark disabled patterns with a `Uint8Array` so their boarding edges are skipped;
  - override edited patterns' headway through a per-pattern wait array read by boarding edges;
  - append the edges of edited or new patterns into an overflow CSR block.
  
  If this gets too complex, a full rebuild is acceptable as long as it takes under 60 ms; measure and report.

### C. Parallel workers

- Split origins across workers. On a laptop use `min(4, navigator.hardwareConcurrency - 1)`. On a phone, or when `deviceMemory` is 4 or less, use 1 worker. Each worker holds its own copy of the graph and computes a slice of origins. The main thread merges the partial sums, which are additive. The visitor's phone is the limit, not the 4 GB server: the server only sends files.
- Send a `progress` message every 10% so the UI can show a thin progress bar on the Results tab and the pulse strip, replacing "…".
- Cancellation: a new revision makes workers abandon the current run at the next origin boundary.

### D. Baseline shipped, not recomputed

- `tools/build-baseline.mjs <region>` writes `data/<region>/baseline.json`, the full stats object, and records the model version.
- The worker uses it when `networkVersion` and `modelVersion` match, and otherwise recomputes. This removes about 1.7 s from every page load today.

### E. Benchmark

`tests/bench-sim.mjs` prints the median of 5 runs for: the baseline; all service disabled; +1 player metro with 5 stations; and every headway halved. Report the numbers in the PR.

### F. Stretch, only if runs exceed 2 s after the zone increase in brief 21: delta evaluation

- For edits that only *add* service (a new line, or a shorter interval), compute reverse searches from each new or changed station to every origin, and forward searches from each station to every destination.
- Combine as `min(old(o,d), T(o→i) + ride(i,j) + T(j→d))`.
- Fall back to a full run for removals. Document the approximation, since it is exact only for paths that use the changed line once.

## Acceptance checks

- The invariant audit passes.
- Report baseline trips, wait and journey next to the pre-change engine. A difference is expected, because the old search was not exact. Do not tune the new engine to reproduce the old totals. Stop and ask if trips move by more than 15% and you cannot explain which paths changed.
- A single-thread full run is **at least 5× faster** than the 1.7 s reference on the same machine. The 4-worker laptop time is extra information, not the budget.
- Report the same run with the worker count forced to 1. That is the phone budget. If it is over 4 s before brief 21 adds zones, stop and ask rather than raising the worker count on small devices.
- The UI shows progress. Rapid consecutive edits never show stale results; add an automated check that posts revisions 1, 2 and 3 quickly and receives only revision 3's stats.
- There are no main-thread long tasks over 50 ms during a recalculation (Performance panel).

## Stop and ask if

- Memory per worker exceeds about 150 MB for GZM. Then reduce the worker count or share an immutable graph through `SharedArrayBuffer`, which needs COOP/COEP headers, a hosting decision.

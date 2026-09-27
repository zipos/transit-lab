# 10 · Region core

**Phase 1 · Size L · Depends on 01, 02 · Review: yes**

## Why

"GZM" is hard-coded in about 36 places: globals `GZM_NETWORK` and `GZM_POPULATION`, storage keys, the default result city `'Katowice'`, the bbox fallback, "43 municipalities", titles, and importer constants. Every new city would otherwise mean forking code. Data also ships as 5.6 MB of JS globals, parsed on the main thread and again in the worker.

## Target structure

```
regions/index.json                 # [{ id, name: {pl,en}, center, bbox, status: "live"|"beta" }]
regions/gzm/region.json            # manifest (below)
regions/gzm/templates.json         # historical proposals (moved from data/templates.json)
data/gzm/network.json              # generated
data/gzm/population.json           # generated (was population-density.json)
data/gzm/manifest.lock.json        # generated: output hashes and counts, for cache busting and review
data/build_region.py               # orchestrator: python3 data/build_region.py gzm
data/lib/                          # refactored importer functions (gtfs.py, population.py, boundaries.py, pkm.py)
```

### `region.json` fields

- **Identity and view:** `id`, `name {pl,en}`, `shortName {pl,en}`, `networkVersion`, `serviceDate` (YYYYMMDD), `center`, `zoom`, `bbox`, `defaultResultArea`.
- **Coverage:** `municipalities`, a list of `{ teryt, name }` defining the focus area; boundaries come from PRG by TERYT.
- **Feeds:** a list of `{ id, kind: "gtfs"|"pkm-snapshot", sourceRef }`, where `sourceRef` points into `data/sources.json` from brief 01. Each feed may add `modes` overrides (route_type to mode), `includeAgencies` and `excludeRouteTypes`.
- **Demand:** `demand: { zoneTarget, tripRate }`, used later by brief 21.
- **Economics:** `costs` overrides (optional; brief 31).

## Scope

1. **Importers.** Move logic from `data/import_*.py` into `data/lib/*.py` functions that take the manifest.
   - Remove GZM constants: the bbox is derived from the municipality boundaries, and the service date and feeds come from the manifest.
   - Keep the scripts runnable. `data/build_region.py <id>` runs boundaries, population, feeds and writes, then the lock file. The old `import_*.py` become thin wrappers or are deleted, and the README is updated.
   - Map GTFS `route_type` `1` → `metro` (needed for Warsaw) and `12` → `metro`. Also accept extended types: 100–117 → rail, 400–405 → metro, 700–716 → bus, 900–906 → tram.
2. **Data format.** Write compact JSON only. Delete the `data/*.js` global wrappers and the root `data/network.json` / `population-density.json` after moving them.
3. **App loading.**
   - The region comes from `?region=<id>` (validated against `regions/index.json`). Without it, show a lightweight region picker overlay; for now it has one live entry, GZM, and the last-used region is remembered.
   - Load `region.json`, `network.json`, `population.json` and `templates.json` with `fetch()`, showing byte-based progress in the existing loading card. Use the lock-file hashes as `?v=` for cache busting.
   - The worker receives the URLs and fetches them itself (it hits the HTTP cache). Don't `postMessage` megabytes.
   - `file://` loading will stop working; say so in the README's "Run locally" section.
4. **Storage keys.**
   - Use `transit-lab:<region>:<networkVersion>` for scenarios and `transit-lab:settings` for display settings.
   - On first run, migrate every `gzm-transit-lab:*` key into `transit-lab:gzm:*` and `transit-lab:settings`, then delete the old keys.
   - Exported scenarios gain `region`. Import rejects a scenario for another region, with a message naming it.
5. **Remove hard-coded GZM text** from `index.html`, `app.js`, `sim.js` and `sim-worker.js`. Titles, captions, the fit-bounds fallback, `'Katowice'`, "43 municipalities", the source snapshot list in the empty inspector and the Data & model dialog all come from the manifest and `network.sources`. Brand: `TRANSIT LAB · <region shortName>`.
6. `sim.js` must not read globals at load time. Export `createModel(network, population, options)`, returning `{ calculate, zones, zoneCities }`. The worker and tests call it.

## Acceptance checks

- `python3 data/build_region.py gzm` reproduces the brief-02 output. Pattern, stop, zone and resident counts are identical. JSON may differ only in key order or float formatting; document any exception.
- `rg -n "GZM|Katowice|gzm" --glob '!regions/**' --glob '!data/**' --glob '!docs/**' --glob '!tests/**'` finds nothing, or only comments explaining migration code.
- Both `http://localhost:8765/?region=gzm` and the picker work. An old `gzm-transit-lab:2026-09-23-gzm-v4` local save appears after migration, and an old exported file imports.
- Main-thread parse time falls (compare "Scripting" in the Performance panel before and after, and report it).

## Stop and ask if

- Refactoring an importer changes GZM output counts.
- You want to support `file://` (it would need a different loading strategy).

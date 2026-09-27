# 03 · Map rendering fixes

**Phase 0 · Size M · Depends on nothing (works better after 02)**

## Why

The first impression is broken, and several render paths do far more work than needed.

- **Invisible network.** The first screen shows a density mask with almost no visible network, because routes use GTFS `route_color` `#000000`. A selected line (for example T6) is black on the dark basemap and only its stop dots show.
- **Fake vehicles.** Static "vehicles" are drawn before Play is ever pressed. `applyMapModeVisibility()` calls `renderVehicles()`, and the dots read as stops.
- **Full redraw on every click.** `renderMap()` rebuilds every GeoJSON source (1,009 routes, 45,730 points, 7,672 stops) on each selection click, stop click or Escape, not only after edits.
- **Wasteful animation.** `renderVehicles()` recomputes every route's segment list every 170 ms, searches it linearly, and animates only the first 12 tram, 8 rail and 10 bus routes of the whole network.
- **Slow lookups.** `routeById()` rebuilds `allRoutes()` (1,009 object spreads) on every call, and the inspector calls it repeatedly.

## Scope

All in `app.js` (and `styles.css` only if needed):

1. **Colors.**
   - `routeColor(r)` returns the mode color when `r.color` is missing, and also when it is near-black or near-white (relative luminance below 0.03 or above 0.9). Imported scenarios can still carry such colors.
   - Selected-line casing adapts to theme: white on the dark basemap, dark (`#10212b`) at about 0.6 opacity on the light basemap.
2. **Overview legibility.** At zoom ≤ 11:
   - Draw trams, rail and metro clearly (opacity ≥ 0.8, width ≥ 1.8 px), and push buses back (opacity about 0.25).
   - Move rail and metro above tram, and tram above bus. Use `line-sort-key` or separate layers.
   - When the density layer is on, lower its opacity slightly at zoom ≤ 11 so lines stay readable.
   - Check with screenshots in both themes.
3. **Vehicles only while playing.**
   - Don't populate `vehicles` until Play is first pressed. Pause freezes the vehicles where they are, and a new "Clear" action (or Reset time) hides them.
   - Remove the `renderVehicles()` call from `applyMapModeVisibility()` unless playing, or unless vehicles are already visible.
4. **Split `renderMap()`** into:
   - `renderNetwork()`: routes and stops. Call it only after scenario edits, undo, import, reset and theme reload.
   - `renderSelection()`: the `selected-route`, `selected-stops` and `inspected-stop` sources.
   - Existing `renderDraft()`, `renderRuler()` and the access grid (only when the scenario changes).
   - `selectRoute`, `inspectStop` and `clearSelection` call only `renderSelection()`.
5. **Route cache.** Keep a `Map` of merged routes, rebuilt in `changed()`, undo, import and reset. `routeById` and `allRoutes` read from it.
6. **Vehicle engine.**
   - Precompute per route (cached by route id plus geometry identity) a `Float64Array` of cumulative segment distances and the flattened coordinates. Find positions by binary search.
   - Animate all active routes whose bbox intersects the viewport with a 20% margin. Cap at 800 vehicles on a wide viewport and 200 on a phone-width viewport. Prioritize metro, then rail, tram and bus, then shorter headway.
   - Keep the existing phase formula so motion looks the same.
7. **Instrumentation (dev only).** Behind `?debug=1`, count `setData` calls per source and log per-frame timings to the console.
8. **Tile failures name the host.** The map error path currently tells the player to check their internet connection whenever a style, tile, or fetch fails. When the failed request is for `tiles.openfreemap.org`, say that the OpenFreeMap tiles failed to load. The game's own files may have loaded fine. Self-hosting tiles is out of scope.

## Acceptance checks

- Fresh load in dark and light themes: trams and rail are clearly visible at the default overview, and there are no vehicle dots before Play.
- Selecting T6 in dark mode shows a clearly visible line, not only stop dots.
- With `?debug=1`, selecting and deselecting routes never calls `setData` on `network-routes` or `network-stops`.
- While playing at 12× over Katowice at zoom 13, trams move on every visible tram line. Frames average under 8 ms in the Performance panel on a laptop, and the phone-width cap stays at or below 200 vehicles.
- Blocking OpenFreeMap in the browser (or a failed style request) shows a message that names OpenFreeMap, not a generic connection error.
- Include before/after screenshots (overview dark, overview light, selected T6 dark) in the PR.

## Stop and ask if

- Readability needs a basemap change beyond `stylizeBasemap` / `stylizeDarkBasemap` (for example, a different OpenFreeMap style).

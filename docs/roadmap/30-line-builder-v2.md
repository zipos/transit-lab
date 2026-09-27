# 30 · Line builder v2

**Phase 3 · Size M · Depends on 11, 13**

## Why

Building lines is the core fun, and it is currently limited:

- **Metro only.** Only "Draw metro line" exists. Other modes appear only through templates, and `normalizeScenario` rejects player bus lines.
- **Append only.** Stations can only be appended; there's no inserting in the middle and no shaping of the alignment.
- **Snapped stations don't share stops.** A station snapped to a published stop creates a *new* stop at the same position. The transfer then costs a walk plus a penalty, and the stop inspector doesn't show them together.
- **No catchment feedback.** Players get no immediate sense of how many people a station serves.
- **Closed lines are hard to edit.** Once a player line is open, its stations can't be moved or inserted anymore.

## Scope

1. **Mode picker** in the draft header: Metro, Tram, Bus/BRT and Commuter rail. The mode table in `src/modes.js` gets, per mode:
   - `speed`, `dwell` (min), `stopSpacingHint` (m), `defaultHeadway`, `vehicleOptions` (capacity choices for brief 24), and `alignmentOptions` (for brief 31: metro tunnel or elevated, tram at street level or segregated, BRT with or without a dedicated lane).
   - Store the chosen `vehicle` and `alignment` on the route. Allow `bus` in `scenario.js` validation.
2. **Shared stations.** When a draft station snaps (within 150 m) to a published stop, the route references that **existing stop id** instead of creating a copy.
   - Player-created stops stay `<routeId>:<n>`.
   - Deleting a player line deletes only its own stops.
   - Migrate old saves: a player stop within 5 m of a published stop, whose note says "Snapped", is replaced by the published id.
3. **Editing.**
   - Click a draft segment to insert a station at the nearest point on that segment.
   - **Shift+click** on a segment adds a non-stop *waypoint* that shapes geometry and length. Waypoints are drawn smaller and stored in `route.waypoints` (per segment).
   - Drag stations with the left mouse button when the Move tool is active. Keep middle-drag.
   - Backspace removes the last station, and Enter opens the line.
   - "Edit alignment" on an open player line re-enters the draft with its stations and waypoints. Saving replaces the route in one undo step.
4. **Catchment feedback while drawing.**
   - Show a translucent 800 m ring (1,200 m for rail and metro) around each draft station.
   - A live panel shows residents within the catchment, and residents *newly* within 800 m of any rapid transit (tram, rail or metro), from the population cells.
   - It also shows the line length and an estimated one-way run time using the mode's speed and dwell.
   - Warn when stations are closer than the mode's `stopSpacingHint × 0.5`.
5. **Custom confirm and discard.** Leaving a draft uses brief 11's `confirmDialog`.
6. **Touch.** Tap to add. Long-press a station for move or remove (replacing right-click on touch devices). The draft panel on mobile keeps the "Open line" button reachable without scrolling.

## Acceptance checks

- All four modes can be drawn, opened, saved, exported, imported, edited and undone.
- A metro station snapped to "Katowice Dworzec PKP" shows in that stop's inspector together with the published services. The model treats the transfer as happening at the same stop, so there is no walking transfer and a lower journey time than before; add a test.
- An old save with snapped copies migrates, with a toast mentioning it.
- Inserting a mid-segment station and adding waypoints change the line length and the cost consistently.
- Phone check: draw a 4-station tram entirely by touch.

## Stop and ask if

- Routing tram or bus drafts along real streets or tracks comes up. That needs OSM network data and a router, which is a separate, larger decision. Keep straight segments plus waypoints for now.

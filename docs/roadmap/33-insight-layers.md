# 33 · Insight layers: flows, travel-time maps, winners and losers

**Phase 3 · Size M · Depends on 24 (flows); the travel-time map only needs 20–21**

## Why

The most satisfying moment in a transit game is *seeing* the effect: thick lines where people ride, a colored travel-time map that suddenly reaches farther, and neighborhoods lighting up green after a new line opens. Today results are four numbers in a panel.

## Scope

1. **Flow map layer** ("Passenger flows" in Layers):
   - Route line width is proportional to daily or peak segment flow from brief 24 (the square root or a stepped scale, with a legend). Color is by mode, or by v/c (green, amber, red) when "Show crowding" is on.
   - Station circles are sized by boardings.
   - Parallel patterns on shared streets will overlap. First pass: sum flows per shared stop-pair and draw one combined band per mode. Document the method.
   - Rebuild only when stats change, not on selection.
2. **Travel-time map** (isochrone):
   - Add "Travel time from here" to the context menu, plus a button in the stop inspector.
   - The worker runs a single search from that point, using runtime access from the nearest cells. The resulting time to every zone or 1 km cell is colored in 10-minute bands up to 60 min.
   - A toggle compares the **scenario against the baseline** (minutes saved), with a diverging color scale.
   - The legend shows the band and residents reachable within 30 or 45 min (a key number worth displaying).
3. **Winners and losers layer:**
   - Per zone, the change in *accessibility*: jobs (or the destination attraction from brief 22) reachable within 45 min by transit, scenario against baseline.
   - Compute it cheaply during the main run, since each origin's search is already done: sum the attraction of destinations with GC ≤ threshold.
   - Diverging color, and a tooltip on hover with the zone's residents and the change.
4. **Mobile:** all layers are in the Layers menu, with legends that fit at 390 px width.
5. **Performance:** one travel-time search takes under 150 ms in the worker. Map layer updates must not block interaction.

## Acceptance checks

- After adding a Katowice–Sosnowiec metro, the flow map shows the metro band, and the winners map shows gains along the corridor.
- A travel-time map from Katowice Rynek appears in under 0.5 s end to end. The baseline comparison shows positive minutes saved near new stations.
- Legends and layers work in both themes and both languages.
- Include screenshots for the PR.

## Stop and ask if

- The flow bands are unreadable at overview zoom in the dense GZM core. Propose alternatives (schematic offsets, or showing only rapid modes at low zoom) with screenshots.

# Adversarial review — 25 September 2026

## Fixed in this pass

| Finding | Change | Check |
| --- | --- | --- |
| Dark basemap roads, road names and place names were too dim, especially beneath the resident mask. | Brightened dark roads, rail, waterways and labels; gave labels dark halos; placed planning masks below the road layers. Selected station labels now follow the system theme. | Inspected rendered maps at overview and street zoom, with the density mask on. Browser checks verified road and label colors and layer order through both HTTP and direct `file://` loading. |
| A newly drawn line served only the clicked station order, and its cost omitted the return direction. | Player lines now create forward and reverse paths, capacity and operating cost. Imported GTFS patterns remain directional. The line list shows ↔ and the inspector explains return service. | Simulation audit checks that reversing the drawn order yields the same passengers and cost and that two-way operating cost is twice one-way cost, allowing one złoty of final rounding. |
| Hiding a map mode left its selected line and selected station markers visible. | Applied the mode filter to every selected route and station layer. | Browser check compared the selected-layer filters with the route filter after hiding metro. |
| Stations on a player line disappeared after another line was selected. | Added player stations to the general stop source, with mode tags. | Browser check found both player stations in the general source before selection. |
| Illustrative vehicles on a clipped multi-segment route only traveled over the first segment. | Animation now samples every geometry segment by distance and shows return-direction markers on player lines. | Code path review and desktop/phone browser smoke checks; the markers remain illustrative. |
| The app's own animation loop kept running while the clock was paused. | The loop now starts on Play, cancels on Pause, and only rewrites the clock when the displayed minute changes. | Desktop/phone interaction checks found no page or console errors. |

## Verification

- `node --check` passed for `app.js` and `sim.js`.
- `node tests/simulation-audit.cjs` passed. Baseline estimate: 48,348 passengers; all service disabled: 0; a two-way test metro: 52,326. These are model outputs, not observed traffic.
- Playwright interaction checks passed in desktop light, desktop dark and phone dark layouts. They covered overlays, modal behavior, mobile tabs, draft cancellation, zoom, system-theme switching and page/console errors.
- A targeted dark-theme check passed both over the local HTTP preview and with `index.html` opened as a `file://` page. It verified player stations, map-mode hiding and the mask/road drawing order.

## Remaining model risks, in priority order

1. **Passenger estimates are not calibrated to observed trips.** The 2021 resident grid is grouped around only 19 fixed anchors; the same resident totals influence origins and destinations. Jobs, schools, tourism and trip purpose are not represented. A new corridor can therefore look better or worse than it would in a real origin–destination survey.
2. **Capacity does not constrain route choice.** The model reports aggregate load from offered seats, but passengers are assigned through travel-time paths even if a particular service would be overcrowded. Satisfaction also has no crowding penalty. Treat the load figure as a rough scenario indicator.
3. **Service is a frequency approximation.** Imported GTFS uses one representative shape per direction; branches, short turns, exact timetables, day-to-day variation and track or street constraints are simplified. Player lines use direct station segments and have no construction or engineering feasibility model.
4. **The resident mask has 1 km source resolution.** Its colored blocks show published grid cells; the municipal fill only blends boundary gaps. It cannot establish block-level population or value. The wage layer is a citywide employed-resident median, not land value, rent or household wealth.
5. **Vehicle dots are illustrative.** Clipped route segments can be spatially disconnected, so a marker may jump when it reaches the next segment. They are not live vehicle positions or a timetable replay.

The project is useful for comparing network ideas within a consistent sandbox. The figures should not be used as an official ridership, satisfaction, capacity or budget forecast.

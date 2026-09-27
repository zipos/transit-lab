# 06 · Dayparts

**Phase 0 · Size M · Depends on 02 and 04**

## Why

Play moves dots and the clock shows 07:00, but the model is one all-day average. The departure times brief 02 stores are unused by the clock. A peak / midday / Saturday switch makes that control describe the service the model actually runs. This does not need the new pathfinder in brief 20.

## Scope

1. **Data, already produced by brief 02.** Each pattern has `dayparts.peak`, `dayparts.midday`, and `dayparts.saturday`, each `{ headway, times }` or `null` when that daypart has no trips. Do not re-parse GTFS here. If a daypart is missing because brief 02 has not stored it, stop and ask rather than inventing intervals.
2. **Scenario field.** Extend the brief 04 whitelist with optional `daypart`: `"peak"` (default), `"midday"`, or `"saturday"`. Old saves omit it and mean peak.
3. **Model.** `calculate` takes the active daypart.
   - A pattern with a daypart entry uses that `headway` and `times`.
   - A pattern with `null` for that daypart does not run. Saturday then shows lines that actually have Saturday trips, not a copy of Wednesday.
   - Player lines keep the interval the player set, in every daypart. Their run times stay on the mode speed.
   - Operating cost for imported patterns uses that daypart's trip count when brief 02 stored one (`dayparts.*.trips`). Otherwise scale `dailyTrips` by `peakHeadway / daypartHeadway` and say so in the Data & model dialog.
4. **UI.** A control beside the clock: **Peak**, **Midday**, **Saturday**.
   - Choosing one sets `daypart` and jumps the clock to 07:30, 12:00, or 12:00.
   - The clock keeps running while Play is on. The model does not change with the minute. The control's caption says the figures are for that period, not for the exact displayed time.
   - Recalculate when the daypart changes. Undo does not include daypart changes; they are a view of the same network.
5. **Animation.** Vehicle spacing uses the active daypart's headway.

## Acceptance checks

- Peak matches the post-brief-02 baseline. Switching to Saturday changes which rail patterns run and does not leave every tram at its Wednesday interval.
- A pattern with no Saturday trips is absent from Saturday results and from the animated vehicles.
- An old save with no `daypart` loads as peak.
- The caption states that the model follows the period, not the minute hand.

## Stop and ask if

- Brief 02 did not store per-daypart `times` and `headway`. Do not approximate Saturday as a flat factor of the weekday.

# Model parameters

Values live in `src/sim/params.js`. A region may override them with `demand.choice` in its `region.json`. It cannot set `asc`: `resolveChoice` forces the boarding constant to 0 until brief 23b.

Generalized cost used for the transit search, in minutes:

`in-vehicle time + walkWeight × (access + egress + transfer walk) + waitWeight × wait + transferPenalty × (boardings − 1) + boardMinutes × boardings + alightMinutes × alightings`

The first boarding does not pay the transfer penalty. Later boardings do.

| Key | Value | Status |
| --- | ---: | --- |
| `walkWeight` | 2 | Starting value from brief 23. Assumption for GZM. Out-of-vehicle walking is commonly valued well above in-vehicle time; Wardman, M. (2004), “Public transport values of time”, *Transport Policy* 11(4), is the survey behind that range. Not estimated on this network. |
| `waitWeight` | 1.5 | Starting value from brief 23. Same status as `walkWeight`. |
| `transferPenalty` | 5 min | Starting value from brief 23. Assumption. Applied once per boarding after the first. |
| `waitAwareHeadway` | 10 min | Assumption from brief 23. At or below this headway, wait is half the headway (random arrival). |
| `waitLongFactor` | 0.3 | Assumption from brief 23. Above 10 minutes, wait is `5 + 0.3 × (headway − 10)`, because a rider can time their arrival. No separate published source for the 0.3 coefficient was used. |
| `boardMinutes` | 1 | Assumption. One minute to board, unweighted. Kept from the previous door time so boarding is not free. |
| `alightMinutes` | 0.3 | Assumption. Time to step off, unweighted. Also the floor on a scheduled step so a timetable difference cannot be zero. |
| `lambda` | 0.05 per generalized minute | Assumption. A 20-minute gap in generalized cost multiplies the odds by about *e*. Not chosen to match a ridership total. |
| `asc` | 0 | Required. Brief 23b is the only place this may move. The results label says the share is not calibrated. |
| `walkExcludeKm` | 1.2 | From brief 23. Shorter straight-line trips are walking. They are counted and left out of the share. |
| `carDetour` | 1.35 | Assumption from brief 23. Car time is straight distance × 1.35 ÷ speed. |
| `denseCarKmh` / `midCarKmh` / `otherCarKmh` | 18 / 26 / 40 | Assumption from brief 23. Density bands are 8,000 and 3,000 residents/km². The origin–destination speed is the harmonic mean of the two ends. |
| `carAccessMinutes` | 3 | Assumption from brief 23. Added to car generalized minutes at weight 1. |
| `carParkingMax` | 10 min | Assumption from brief 23. Linear in destination density from 0 up to `carParkingDensity` (8,000 residents/km²), then capped. |
| `satisfactionScale` | 20 min | From brief 23. Satisfaction is `50 + 50 × tanh((GC_car − GC_transit) / 20)`, averaged over transit riders, then rounded to a whole number. |
| `rapidAccessKm` | 0.8 | Straight line from a population cell to a tram, rail, or metro stop that runs in the period. |
| `tripRate` | 0.6 | Existing game assumption: cross-zone trip opportunities per resident per day. Not a survey result. Set on the region as `demand.tripRate`. |

Door-to-door time reported in the results is clock minutes (walk, wait, ride, board, alight), not the weighted generalized cost. The search itself minimizes generalized cost.

## Plausibility, peak, model version 4

Run on 28 September 2026 against `data/gzm` network `2026-09-23-gzm-v5`. ASC is 0.

| | Modeled | Published comparison |
| --- | ---: | --- |
| Region transit share, trips longer than 1.2 km | 8.7% | 23.5% of non-walk trips, and 16% of all trips, in the 2018 household survey for the central subregion of Silesia (train 0.4%, urban bus 13%, tram 2.5%, trolleybus 0.1%). Cited by the GZM K-KM synthesis from *Studium transportowe Subregionu Centralnego Województwa Śląskiego 2018*, figure 2.1. <https://bip.metropoliagzm.pl/attachments/download/188456> |
| Trips that both start and end in Katowice | 14.7% | That study does not publish a Katowice-only split. |
| Region transit trips | 115,332 | Not compared with an annual ridership total. Brief 23b does that. |
| Satisfaction | 10 | The formula, not a survey. A low score means the unweighted car alternative is faster in generalized minutes than weighted transit. |

The gap versus 23.5% is expected. The constant is 0 on purpose. Destinations are still the housing proxy from brief 21, not workplaces. The survey is all purposes in 2018 for a subregion, and this model is a peak logit on a gravity matrix. Do not close the gap by editing `asc` here.

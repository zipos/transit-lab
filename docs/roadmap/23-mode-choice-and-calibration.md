# 23 · Mode choice

**Phase 2 · Size L · Depends on 21 · Review: yes**

Ship this before brief 22. Do not wait for real destinations, and do not fit the boarding constant here. That fit is brief 23b, and it waits for brief 22 because a constant fitted on the current destination proxy would be thrown away.

## Why

Transit share today is an ad hoc logistic curve: journey time against `straight/28 km/h × 1.65 + 11`. No car alternative varies with congestion or parking, and the totals aren't checked against reality. The baseline carries 4.18% of modeled demand.

"Satisfaction" (62.17, shown to 2 decimals) is hard to interpret, and "load" (2%, total passengers ÷ total seats across the network) is meaningless.

## Scope

1. **Parameters file.** Create `src/sim/params.js`, with per-region overrides from `region.json`, and `docs/model-parameters.md`. Every value gets a one-line rationale and a source link, or is marked `assumption` with a sentence explaining it. No unexplained constants remain in `model.js`.
2. **Generalized cost.** Search on GC, and track the components separately for reporting.
   - GC = in-vehicle time + `walkWeight`·(access + egress + transfer walk) + `waitWeight`·wait + `transferPenalty`·(boardings − 1).
   - Start values to confirm or replace with sourced ones: walkWeight 2.0, waitWeight 1.5, transferPenalty 5 min.
   - Wait for interval *h*: `h/2` for h ≤ 10, and `5 + 0.3·(h − 10)` above that, because riders time their arrival for long intervals. Cite a source, or mark it as an assumption.
3. **Car alternative.**
   - Car time = straight distance × 1.35 ÷ speed.
   - Speed depends on origin and destination density: at least 8,000/km² → 18 km/h, 3,000–8,000 → 26 km/h, below that → 40 km/h. Use the harmonic mean of the two ends.
   - Add 3 min access plus a parking penalty of 0–10 min by destination density. These are assumptions; document them.
4. **Choice model.**
   - P(transit) = 1 / (1 + exp(λ·(GC_transit − GC_car) − ASC)).
   - Trips shorter than 1.2 km straight-line are excluded as walking, and the excluded total is reported.
   - Trips with no transit path get P = 0.
5. **Leave the choice uncalibrated.** ASC is 0. λ is documented in `docs/model-parameters.md`. The Results share is labeled "not calibrated" until brief 23b. Do not look up an annual ridership total in this brief and do not pick an ASC that makes the total look right. Brief 23b does that, then checks the mode split so the constant cannot hide a wrong matrix.
6. **Outputs**, replacing today's set:
   - daily trips; daily boardings; transit mode share (%);
   - average door-to-door time; average wait; average transfers;
   - residents within 800 m of a tram, rail or metro stop (count and %);
   - operating cost; and a **satisfaction index** (0–100, whole numbers, defined as 50 + 50·tanh((GC_car − GC_transit)/20) averaged over transit riders).
   
   Drop "load". Crowding comes in brief 24.
7. **UI.** Update the Results cards and the pulse strip to the new outputs, with one short explanation per metric in a tooltip or info popover. Show deltas against the baseline with color (green or red) and the direction that counts as good.

## Acceptance checks

- ASC is 0 and the share label says the figure is not calibrated.
- The monotonicity audits still hold:
  - more frequency never loses trips;
  - disabling all service gives zero;
  - the dense-corridor metro beats the low-density metro.
- **Plausibility table** in the PR: modeled transit share for the whole region, and for trips within Katowice's municipality. List any published modal-split survey you can find (cite it) for comparison. Mismatches are OK if explained.
- The satisfaction and delta displays are whole numbers; no two-decimal values remain in the UI except minutes.

## Stop and ask if

- You are tempted to set ASC to anything other than 0. That belongs in brief 23b.

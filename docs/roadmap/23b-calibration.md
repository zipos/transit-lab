# 23b · Calibration

**Phase 2 · Size M · Depends on 23 and 22 · Review: yes**

## Why

Brief 23 adds a car alternative but leaves the alternative-specific constant at 0, and it labels the mode share as not calibrated. Fitting that constant to a single published boarding total is useful, and it is also easy to over-trust: the constant absorbs bad destinations, a weak car speed, and the fact that return trips are not modeled. This brief fits it, then checks something the constant cannot absorb.

## Scope

1. **Headline fit.**
   - Find the official annual passenger figure for the region's public transport (for GZM, a Transport GZM report) and cite it. Convert it to average weekday boardings with a documented factor. The factor is an assumption unless a source gives weekday versus annual.
   - Model boardings = trips × (1 + average transfers).
   - Fit ASC by bisection so baseline boardings match within 5%. Keep λ at the value brief 23 documented.
   - Store ASC in `data/<region>/baseline.json`. The brief 20 build script refits it when the network changes.
   - **If no official figure can be found, stop and ask.** Do not invent one.
2. **A check the constant cannot fix.** Report both, and do not retune ASC to improve them:
   - **Boardings by mode** (bus, tram, rail, and metro once it exists) against a published mode split. Cite the source. If you cannot find one, say so and use the next check.
   - **Flows between municipalities** against the commuting table from brief 22, when that table was adopted: correlation and the ten largest residuals.
3. **UI.** Remove the "not calibrated" label once ASC is fitted. The Data & model dialog states the target, the source, the annual-to-weekday factor, and that one constant was fitted. Link the mode-split or commuting comparison, including a mismatch. A mismatch is shown, not hidden.
4. **Do not** add a second fitted constant to force the mode split to match. If the split is far off, that is a reason to revisit destinations or costs, and it is a stop-and-ask.

## Acceptance checks

- Baseline boardings match the cited target within 5%.
- The PR includes the mode split, or the commuting residuals, next to the cited numbers. It states whether the structure looks right, not only the total.
- Monotonicity audits from brief 23 still hold. The dense-corridor metro still beats the low-density metro.
- ASC was not chosen to improve the mode split.

## Stop and ask if

- No citable ridership total exists.
- |ASC| > 5.
- The best mode's modeled share and the published share differ by more than 20 percentage points. Do not ship a recalibration that hides this.

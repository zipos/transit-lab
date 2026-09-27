# 32 · Challenges

**Phase 3 · Size M · Depends on 31 (and 33 for some objective types)**

## Why

A sandbox without goals loses casual players quickly. Short, city-specific challenges with 1–3 stars give a reason to explore the model, and a reason to share results.

## Scope

1. **Data:** `regions/<id>/challenges.json`, with bilingual text:

```json
{
  "id": "gzm-katowice-sosnowiec",
  "title": { "pl": "…", "en": "…" },
  "brief": { "pl": "…", "en": "…" },
  "constraints": { "budgetPLN": 4000000000, "modes": ["metro", "tram"], "maxNewLines": 1, "allowEditingPublished": true },
  "objectives": [
    { "type": "odTime", "from": [19.0237, 50.2598], "to": [19.1286, 50.2800], "maxMinutes": 15, "label": { "pl": "…", "en": "…" } },
    { "type": "tripsDelta", "min": 20000 }
  ],
  "stars": [1, 2, 3]
}
```

   Here `stars[k]` is the number of objectives that must be met to earn k+1 stars. Alternatively, a challenge can define `score` thresholds on one metric; choose one scheme and document it.
2. **Objective types**, each computed from model output:
   - `odTime`: best transit GC or door-to-door time between two points. This is a single search from the origin point, from brief 33's travel-time function.
   - `tripsDelta`, `boardingsDelta`, `modeShareDelta`.
   - `coverage`: residents within 800 m of rapid transit ≥ N.
   - `costPerRider` ≤ X (needs budget mode).
   - `maxLoad`: no segment over v/c 1.0 at peak (from brief 24).
   - `municipalityTrips`: trips from municipality M ≥ N.
3. **UI.**
   - A **Challenges** entry in the Network tab and on mobile.
   - The list shows stars earned. Opening a challenge starts a fresh scenario slot (brief 34) with its constraints enforced: mode picker limits, and budget mode on and locked.
   - A progress panel updates live after every recalculation. On completion, show a celebratory but restrained result card, a "Share result" link (brief 34) and a "Next challenge" button.
   - Progress is stored in `transit-lab:<region>:challenges`.
4. **Seed content: 5 challenges for GZM.** Check each objective against the model so it's solvable, with at least one 3-star solution recorded in `tests/fixtures/challenges/<id>.json`.
   - Connect the Katowice and Sosnowiec centres in ≤ 15 min.
   - A Gliwice–Katowice rapid corridor.
   - Fix a poorly served suburb (pick one from the brief-33 winners/losers data where access is worst relative to population).
   - Double tram frequency within an operating budget.
   - Cheapest line that raises rapid-transit coverage by 50,000 residents.

## Acceptance checks

- `tests/challenges-audit.mjs` loads each fixture solution and asserts it earns the stars it claims, and asserts that the empty baseline earns 0 stars.
- Constraints are enforced. A disallowed mode can't be picked, and over-budget blocks completion but not editing.
- Works on a phone.

## Stop and ask if

- Seed challenge wording in Polish needs the owner's voice or tone. Draft it and mark it for review.

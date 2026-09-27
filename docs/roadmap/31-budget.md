# 31 · Budget

**Phase 3 · Size M · Depends on 23, 30 · Review: yes (every number needs a source)**

Fare revenue uses boardings. When brief 23b has fitted an ASC, use those boardings. When it has not, hide the revenue line and say calibration is pending. Do not multiply uncalibrated trips by a fare and present it as income.

## Why

Today, building a 30 km metro costs nothing but operating cost, so the best move is always "metro everywhere". A budget makes trade-offs real: tram against metro, frequency against coverage.

It must stay **optional**. The default is sandbox, and challenges (brief 32) turn it on.

## Scope

1. **Cost table** in `src/modes.js` or `params.js`, with per-region overrides and every value sourced in `docs/model-parameters.md`:
   - **Capital cost per km** by mode and alignment:
     - metro in tunnel, metro elevated;
     - tram segregated, tram at street level;
     - BRT with a dedicated lane, ordinary bus (≈0);
     - commuter rail on new track, or on existing track (≈0, stations only).
   - **Per station:** underground station, elevated station, tram stop, rail halt.
   - **Vehicles:** cost per vehicle by type. The fleet is derived as `ceil(round-trip time ÷ headway) × 1.1` spare.
   - **Operating cost:** reuse the per-vehicle-km rates, sourced or marked as assumptions, plus a per-station yearly cost.
   - **Fare revenue:** an average revenue per trip per region, derived from a cited operator ticket-revenue figure ÷ cited annual passengers.
   
   Search Polish sources, such as costs of recent projects (Warsaw M2 extensions, Kraków and Poznań tram lines, Łódź or Kraków rail halts) from official documents or reputable press, and record the year and price basis. **If you can't find a source for a value, stop and ask.**
2. **Annualization:** daily figures × `annualFactor` (params, documented) for operating cost and revenue.
3. **Budget mode toggle** in Results, off by default. When on:
   - The pulse strip shows **capital spent against budget**.
   - The Results tab adds a Budget card with capital cost (new infrastructure only), yearly operating delta, yearly revenue delta, farebox recovery (%), and **cost per new daily rider**.
   - Each player line's inspector shows its own capital and operating cost, and its fleet size.
   - Exceeding the budget is allowed in sandbox mode (the value turns red). Challenges can forbid it.
4. **Editing published lines** costs only operations and vehicles. More frequency needs more vehicles; show the fleet delta.
5. **Explain** in the Data & model dialog, in one short section, that costs are planning-level estimates with a price year, not project budgets.

## Acceptance checks

- Every number in the cost table has a source or an explicit `assumption` label with rationale in `docs/model-parameters.md`.
- A test checks that a 10 km tunnel metro with 8 stations costs more than a 10 km street-level tram with 15 stops, and more than a 10 km BRT. A test checks that halving a line's headway roughly doubles its fleet and operating cost.
- Budget mode on or off doesn't change passenger results.
- Polish and English strings are added (brief 12).

## Stop and ask if

- Sources disagree by more than 2× for a key capital cost. Present the range and let the owner choose.

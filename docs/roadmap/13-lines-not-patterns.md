# 13 · Lines instead of patterns

**Phase 1 · Size M · Depends on 02, 11**

## Why

The list shows 1,009 directional GTFS patterns. Every tram appears twice (`T6 →`, `T6 ↩`) and rail lines appear many times, including short turns. Changing T6's interval changes only one direction, which is unrealistic and confusing. Players think in lines.

Brief 02 keeps every rail terminal pair that has at least two weekday trips. Do not delete those patterns here to make the list shorter. The list groups them; the model still runs all of them.

## Scope

1. **Line model** (derived at load time, not stored):
   - `lineKey = source + ':' + name`. Each line holds its patterns grouped by direction (`direction` from GTFS, or as inferred in brief 02).
   - It has a `mode`, one color, and terminals taken from the longest pattern per direction.
   - Player lines are one line with one pattern, as now.
2. **List.**
   - One card per line, showing the name badge, the terminals ("Stroszek ⇄ Brynów"), the combined peak interval, the mode, and a variant count when a direction has more than one pattern ("4 variants").
   - Search matches the line name, terminals and any stop name on the line. Stop-name matches are listed after name matches.
   - Sort by mode (metro, rail, tram, bus), then natural sort of names (T2 before T11).
   - Show the first 80 lines with "Show more", as now.
3. **Line inspector.**
   - The header shows the line. Direction tabs (`→ Brynów`, `→ Stroszek`) list that direction's stop sequence, with a variant dropdown when there are several patterns per direction.
   - **Interval and In service apply to every pattern of the line by default.** An "Only this direction" checkbox reveals a per-pattern interval.
   - Stop edits (add, remove, reorder) apply to the displayed pattern. Offer a "Mirror to other direction" button when every changed stop's `area` (from brief 02) exists in the opposite pattern, and apply the equivalent edit there.
   - Revert restores the whole line.
4. **Combined interval.** For a line or a stop with several patterns, the effective interval is `1 / Σ(1/hᵢ)`, rounded to 1 decimal place and displayed as "co ~4 min". Use this in the list, the stop inspector and the line header.
5. **Stop inspector.** Group services by line, with one row per line and the direction(s) served at this stop area. Clicking a row opens the line inspector on the relevant direction.
6. **Map selection.** Clicking a route on the map selects the whole line (both directions highlighted), with the clicked pattern's direction tab active.
7. **Saves.** Overrides stay keyed by pattern id. A line-level edit writes the same field to each pattern's override. No format change and no version bump.

## Acceptance checks

- GZM shows about half as many list entries as before; report the exact number. T6 appears once.
- Setting T6 to every 5 min updates both directions, which you can confirm in the saved overrides and the audit's cost. Undo restores both in one step.
- "Only this direction" still allows asymmetric service.
- The stop inspector at a tram interchange shows one row per line.
- Existing exported scenarios load and display the same stats as before.

## Stop and ask if

- Some source reuses a line name for unrelated services (for example the same number in two cities of the region). Propose a disambiguation rule (such as grouping by `agency_id` too) before implementing it.

# 07 · First-run intro

**Phase 0 · Size S · Depends on 03**

## Why

The public build opens onto about 1,000 patterns and a data essay. Challenges (brief 32) come much later. A short prompt teaches the loop that already exists: hide clutter, edit a line, draw a line, read the result.

## Scope

1. On the first visit, after the map has loaded and the first passenger number has appeared, show a five-step coach. It does not cover the map. Each step names the control and waits until the player does it:
   1. Hide buses with the bus button in Layers.
   2. Select tram T6 from the list.
   3. Set its interval to 6 minutes.
   4. Draw a metro of three stations and open the line. Cancel is allowed; the step completes when a player line exists or the player skips.
   5. Open Results and point at the passenger delta.
2. **Skip** and a close button end the coach. Store `introDone` in `transit-lab:settings` (or `gzm-transit-lab:display` if brief 10 has not landed). Do not show it again. Settings has "Show the intro again".
3. **Copy.** Write both Polish and English in a small dictionary in the intro module. Polish is the default for `pl*` browsers, matching the project decision. Brief 12 moves these strings into the locale files; do not build the full i18n system here.
4. The coach highlights the target control. If a step's control is off-screen on a phone, scroll it into view. The player can pan the map during the coach.

## Acceptance checks

- A fresh profile sees the coach only after a passenger number is visible, and a second reload does not show it.
- Completing the steps leaves a saved scenario with T6 at 6 minutes and one player line.
- Skip leaves the published network unchanged.
- At 390 px width the coach does not cover the control it is asking for.

## Stop and ask if

- T6's id has changed and you cannot find a tram whose name is `T6`.

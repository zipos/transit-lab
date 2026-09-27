# Transit Lab roadmap

Task briefs for turning the GZM sandbox into **Transit Lab**: a fun, realistic, bilingual (PL/EN) public-transport planning game for Polish metropolitan areas, starting with GZM, then Warsaw, Kraków, Wrocław and Poznań, and eventually every voivodeship capital.

Each brief is self-contained: hand one file to an implementing model together with this README. Do them in order unless the dependency column says otherwise. The implementing model is GPT-class at about Sonnet 5 level (Sol or Luna). Stay inside the brief. Do not expand a small extraction into a full rewrite.

[00-plan-review.md](00-plan-review.md) lists where an earlier review was applied. The briefs win if that note and a brief ever disagree.

## Decisions already made (do not re-litigate)

| Topic | Decision |
| --- | --- |
| Name | **Transit Lab**, with a region picker. GZM becomes one region (`gzm`). |
| Language | Polish and English with a switcher. Polish is the default for `pl*` browsers. |
| Game feel | Free sandbox by default, plus an optional budget and per-city challenges. |
| Region scope | Metropolitan area including commuter rail (as GZM does today). |
| Hosting | Static files only, on a small Proxmox LXC behind a Cloudflare Tunnel. No backend; scenarios are shared through compressed URL links. |
| Recalculation budget | About 1–2 s on a laptop after an edit, with a visible progress state. Phones use one worker. A few seconds there is acceptable. The 4 GB server only serves files and is not the budget. |
| Raw source data | Not committed. Download scripts with pinned SHA-256; only processed output is committed. |
| Code license | **AGPL-3.0.** The text is `LICENSE` in the repo root. It covers the code. Datasets keep their publishers' terms. Do not replace the license. |
| Publishing | The current tree is public at `https://github.com/zipos/transit-lab`. GZM's feed is CC BY. Koleje Śląskie and PKM terms are still unclear; brief 01 records that in `ATTRIBUTION.md` and does not treat it as a reason to take the repo private. |

## Order and dependencies

| # | Brief | Phase | Depends on | Size | Review by stronger model? |
| --- | --- | --- | --- | --- | --- |
| 01 | [Repo hygiene and source fetching](01-repo-hygiene-and-sources.md) | 0 | — | M | No |
| 02 | [GTFS import quality](02-gtfs-import-quality.md) | 0 | 01 | M | Yes (data logic) |
| 03 | [Map rendering fixes](03-map-rendering-fixes.md) | 0 | — | M | No |
| 04 | [Scenario validation (security)](04-scenario-validation.md) | 0 | — | S | Yes (security) |
| 05 | [Deploy and CI](05-deploy-and-ci.md) | 0 | 01 | S | No |
| 06 | [Dayparts](06-dayparts.md) | 0 | 02, 04 | M | No |
| 07 | [First-run intro](07-first-run.md) | 0 | 03 | S | No |
| 10 | [Region core](10-region-core.md) | 1 | 01, 02 | L | Yes |
| 11 | [Extract list, inspector, helpers](11-module-split.md) | 1 | 10 | M | No |
| 12 | [Polish and English](12-i18n-pl-en.md) | 1 | 11 | M | Owner reviews Polish |
| 13 | [Lines instead of patterns](13-lines-not-patterns.md) | 1 | 02, 11 | M | No |
| 34 | [Share links, save slots, plan comparison](34-share-links.md) | 1 | 04, 10 | M | Yes (security) |
| 20 | [Simulation engine performance](20-sim-engine-performance.md) | 2 | 11 | L | Yes |
| 21 | [Demand v2: zones and access](21-demand-zones-and-access.md) | 2 | 20 | L | Yes |
| 22 | [Demand v2: destinations (spike first)](22-demand-destinations.md) | 2 | 21 | L | Yes |
| 23 | [Mode choice](23-mode-choice-and-calibration.md) | 2 | 21 | L | Yes |
| 23b | [Calibration](23b-calibration.md) | 2 | 23, 22 | M | Yes |
| 24 | [Passenger flows and crowding](24-flows-and-crowding.md) | 2 | 23 | L | Yes |
| 30 | [Line builder v2](30-line-builder-v2.md) | 3 | 11, 13 | M | No |
| 31 | [Budget](31-budget.md) | 3 | 23, 30 | M | Yes (numbers) |
| 32 | [Challenges](32-challenges.md) | 3 | 31 | M | No |
| 33 | [Insight layers: flows, travel-time maps, winners and losers](33-insight-layers.md) | 3 | 24 | M | No |
| 40 | [Warsaw](40-warsaw.md) | 4 | 10, 21, 23 (23b and 24 recommended) | L | Yes |
| 41 | [Kraków, Wrocław, Poznań](41-next-cities.md) | 4 | 40 | L per city | Yes |
| 42 | [All voivodeship capitals](42-national-rollout.md) | 4 | 41 | L | Yes |

Phase 0 is safe to parallelize except that 02 and 05 need 01, 06 needs 02 and 04, and 07 needs 03. Briefs 06 and 07 can land in parallel with the region split (brief 10). Brief 23 (mode choice) needs brief 21 only. Brief 23b (the boarding-total fit) waits for brief 22. Brief 24 can use uncalibrated shares from brief 23 and scales them once 23b exists. **Warsaw must wait for briefs 21 and 23**: Warsaw is a single municipality of about 1.8 million people, so the current municipality-anchor demand model would give it two zones and any Warsaw metro would register almost nothing.

Do not tune a new model to reproduce the 26 September passenger total. That total is the baseline to report against, not a target.

## Baseline facts measured on 26 Sep 2026 (before any brief)

Use these to check whether a change moved things in the right direction.

- The network has 1,009 directional patterns and 7,672 stops. There are 53 demand zones for 2,237,684 residents.
- One full `TransitSim.calculate` takes about 1.7 s in Node on an Apple-silicon Mac, and `node tests/simulation-audit.cjs` takes about 11 s.
- The baseline carries 56,080 trips per day, 4.18% of modeled demand. The average journey is 80.5 min and the average wait 21 min. "Load" is 2%.
- Only 1,796 of 7,672 stops are within the 1.4 km zone-access radius, so the rest can never be used by modeled trips.
- A 5-minute, 2-station player metro from Katowice to Sosnowiec adds 75 trips. A 5-station, 3-minute version adds 2,261.
- 410 stops are virtual or technical (`granica …`, `… [tech]`) and appear in 593 patterns.
- GTFS `route_color` is `#000000` for all 52 tram patterns and 408 bus patterns, and `#FFFFFF` for 35 more. The network is nearly invisible on the dark basemap.

## Rules for implementing models

1. **Read before editing.** Read the files the brief lists, plus `README.md`, before changing anything.
2. **No build step** unless a brief explicitly adds one. The app is plain HTML, CSS and JS served statically, and Python importers use the standard library unless a brief allows a `requirements.txt`.
3. **Never invent data.** This covers source URLs, licenses, costs, ridership figures and station coordinates. Each must come from a cited source (put the URL in code comments or in `docs/model-parameters.md`). If you cannot find a source, leave a clearly marked `TODO(source)` and tell the owner. Do not guess.
4. **Stop and ask** when a brief's "Stop and ask" condition triggers, or when a decision would be hard to reverse (such as deleting data, rewriting git history, or changing the save format without migration).
5. **Keep saves working.** Stored scenarios and exported JSON from earlier versions must still load, or be migrated with a visible message. Add the previous network version to the legacy list whenever you bump it.
6. **Verify every change:**
   - `node --check` on every changed JS file.
   - `node tests/simulation-audit.cjs` (and any new tests the brief adds).
   - A browser smoke test on `python3 -m http.server 8765`. Check desktop light, desktop dark and a phone-width viewport, and confirm there are no console errors.
   - After brief 05, the Playwright smoke test must stay green.
7. **Do not match old totals on purpose.** Report passenger, wait, and journey figures next to the previous ones. A difference is a result, not a defect, unless the brief's stop condition says otherwise.
8. **Time the visitor's phone, not the file server.** One simulation worker when `deviceMemory` is 4 or less, or when the viewport is phone-width. Laptop medians are extra.
9. **Model outputs are estimates.** Keep one clear disclaimer in the Data & model dialog. Don't repeat hedging in every UI string.
10. **Match the existing style:** 2-space indent, `const`/arrow functions, small helpers, no framework.
11. **One brief, one branch, one PR.** Update `README.md` (the root one) when user-visible behavior, data or numbers change.

## Glossary

- **Pattern:** one directional stop sequence from GTFS (what the app currently calls a route).
- **Line:** all patterns sharing a public line name, such as T6 in both directions and its variants.
- **Headway / interval:** minutes between departures.
- **Zone:** a demand unit, currently a municipality anchor; after brief 21, an aggregate of 1 km grid cells.
- **Region:** one playable metropolitan area with its own manifest, data and saves.

# 01 · Repo hygiene and source fetching

**Phase 0 · Size M · Depends on nothing**

## Why

The repo is about to become public on GitHub. It currently tracks 39 MB of raw source files, including feeds whose reuse license is unclear, plus duplicated data, removed features and stale hand-off notes written for earlier sessions.

## Scope

In scope:

1. **Stop tracking raw sources.**
   - Create `data/sources.json`. It lists every raw input with `id`, `url`, `filename`, `sha256`, `license`, `attribution`, `retrieved` (ISO date) and `notes`. Take the values from `data/import_gtfs.py`, `data/import_population.py`, `data/fetch_boundaries.py`, `data/import_pkm.py` and `README.md`.
   - Create `data/fetch_sources.py` (standard library only). It downloads each missing file into `data/sources/`, verifies SHA-256 and prints a clear error on mismatch. Add a `--accept-new` flag that records the new hash and date in `sources.json` instead of failing.
   - Publishers rotate feeds, so an old pinned GTFS may no longer be downloadable. The script must say so plainly and point to `--accept-new`.
   - Add `data/sources/*` to `.gitignore` (keep a `data/sources/.gitkeep`) and `git rm --cached` the raw files.
   - `pkm-jaworzno-2026-09-26.json` is produced by our own scraper (`data/import_pkm.py`). Keep it out of git too, and have `fetch_sources.py` tell the user to run `import_pkm.py` to regenerate it.
2. **Delete dead features and files.**
   - `data/municipal-income.js`, `data/municipal-income.json`, `data/import_municipal_income.py` and `data/sources/bdl-municipal-income-response.json` (the wage layer was removed).
   - Delete the README paragraph about it.
3. **Remove the duplicated data format.** The app loads `data/*.js`, and `data/network.json` (2.3 MB) plus `data/population-density.json` (11 MB) are only used as "Open network" links and as importer input.
   - For now, keep both formats but shrink `population-density.json` by writing it compact (`separators=(",", ":")`), as `network.json` already is.
   - Brief 10 will remove the `.js` wrappers entirely. Don't do that here.
4. **Remove stale hand-off docs.** Delete `CONTINUE-ON-ANOTHER-PC.md`, `POLISH-SESSION.md`, `ADVERSARIAL-REVIEW.md` and `MAP-CONTROLS-UPDATE.md`. Move anything still true and useful into `docs/model-limits.md`: the "Remaining model risks" list from `ADVERSARIAL-REVIEW.md`, corrected to 53 anchors, not 19.
5. **Replace the stale screenshots.** Delete `preview.png` and `context-menu-preview.png`, which show an old five-city build. Add `docs/screenshot-light.png` and `docs/screenshot-dark.png` taken from the current build *after brief 03 lands*. If 03 isn't merged yet, leave a `TODO(screenshot)` in the README.
6. **Remove dead code in `app.js`.**
   - `densityCells` (unused).
   - The unused half of `setPanel` that writes `state.inspectorOpen` and `data-inspector-open`. Check CSS for `data-inspector-open` first, and keep it if any rule uses it.
   - The stale string `'Outside the selected eight-city grid'`, which should say "Outside the population grid".
7. **Rewrite the root README for GitHub.** In order:
   - A one-paragraph pitch and a screenshot.
   - "Run locally", including `python3 data/fetch_sources.py` before re-running importers.
   - Data sources and attribution (keep all current attributions verbatim).
   - A link to `docs/model-limits.md` and a link to `docs/roadmap/`.
   - Keep it under about 120 lines.
8. **Add `ATTRIBUTION.md`** listing every data source, its license or terms, and the required attribution text. The code license is already AGPL-3.0 in `LICENSE`. Do not replace or remove it.

Out of scope: moving files into `src/` (brief 11), region folders (brief 10) and any behavior change.

## License note

The owner published this tree on 27 September 2026. Do not make the repository private and do not remove the remote. Processed `network.json` / `network.js` is a derivative of three feeds:

- GZM ZTM is CC BY. Attribution is required and publishing the derived network is fine.
- Koleje Śląskie's download page does not state a reusable license. Transitland's catalog entry is not the operator's permission.
- PKM Jaworzno's timetable pages do not state a reusable license.

In `ATTRIBUTION.md`, mark Koleje Śląskie and PKM as **published by the owner's decision, terms still unclear**. Do not delete those patterns from the public repo unless the owner asks.

## Git history: STOP AND ASK

The raw ZIPs are already in the public history (`69f8850`, `6ca84dd`), so deleting them from a later commit still leaves them reachable. Do not rewrite that history unless the owner chooses one of these:

- **(a) Recommended.** Create a fresh orphan branch with the cleaned tree as a single "Initial public release" commit, and push only that branch.
- **(b)** Rewrite history with `git filter-repo --path data/sources --invert-paths`.

Do not rewrite or force-push anything without explicit approval.

## Files

`.gitignore`, `data/sources.json` (new), `data/fetch_sources.py` (new), `data/import_*.py` (read hashes from `sources.json` instead of hard-coding), `app.js`, `README.md`, `ATTRIBUTION.md` (new), `docs/model-limits.md` (new), the deleted files listed above.

## Acceptance checks

- `git ls-files | xargs du -ch | tail -1` reports under 12 MB.
- On a fresh clone: `python3 data/fetch_sources.py` downloads the files or explains clearly why a pinned version is gone. `python3 data/import_population.py && python3 data/import_gtfs.py` reproduces byte-identical `data/network.js` whenever the hashes match.
- `node tests/simulation-audit.cjs` passes, and the app loads with no console errors.
- `rg -n "municipal-income|wage" --glob '!docs/**'` returns nothing except the README's historical note, if you keep one.

## Stop and ask if

- A source URL no longer serves the pinned file and no archived copy exists.
- You're unsure whether a source's terms allow redistributing processed output. List which one and why. Koleje Śląskie and PKM stay marked unclear in `ATTRIBUTION.md`; that is not a reason to unpublish the repo.

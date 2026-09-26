# Continue GZM Transit Lab on another computer

## Move the files

1. Copy the current project folder, including its `.git` directory, to the other computer. Older project ZIPs predate the metropolitan expansion.
2. If you have changed lines or built a metro in the browser, click **Export** in the game on this computer. Copy that scenario `.json` file too. Browser local storage is tied to this browser and does not travel with the project ZIP.
3. Open the extracted folder as a **Local** project in Codex. For a quick preview, open a terminal in that folder and run `py -m http.server 8765` on Windows, or `python3 -m http.server 8765` on macOS/Linux. Then visit `http://localhost:8765`. The map tiles require an internet connection.
4. If you exported a scenario, click **Import** in the game on the other computer and select its `.json` file.

Read `POLISH-SESSION.md` for the earlier polish session, `ADVERSARIAL-REVIEW.md` for map-visibility and simulation corrections, and `MAP-CONTROLS-UPDATE.md` for the current right-click menu, ruler and planning-layer changes.

## Continue development with Codex

Start a new Codex task in the extracted folder and paste:

> Continue the GZM Transit Lab browser game in this folder. Read README.md and inspect the code before changing it. The baseline uses 23 September 2026 GTFS data and the published GUS 2021 resident grid for all 41 GZM municipalities, Jaworzno and Orzesze. PKM Jaworzno uses a pinned official timetable/map snapshot with estimated intervals and schematic geometry. It has a scenario-derived rapid-transit access layer and sourced historical line drafts. Preserve the reproducible importers and local scenario export/import. The next goal is [describe the feature or problem]. Test the result in a browser.

The source files are `index.html`, `app.js`, `sim.js`, `sim-worker.js`, `styles.css`, and `data/`. The pinned GTFS, population, city-boundary and wage inputs are in `data/sources/`; rerun the corresponding `data/import_*.py` script after changing an importer. `README.md` records the sources, model assumptions and known limits.

## A good next step

Refine the player interaction: clearer visibility controls for the dense bus network and better route selection on touch screens. Workplace and school destinations and observed travel behavior remain future work. Passenger and satisfaction figures are model estimates, not observed data. Municipality-wide wage was removed from the map; rapid-transit access is a straight-line cell-center estimate.

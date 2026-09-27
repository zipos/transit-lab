# 11 · Extract the list, the inspector, and shared helpers

**Phase 1 · Size M · Depends on 10**

## Why

`app.js` is one long file, and later briefs (12, 13, 30) edit the list and the inspector. A full split of the map, the context menu, the ruler, and 2,600 lines of CSS into twenty modules is how selection, undo, and the context menu break without any player-visible gain. Extract only what those briefs touch. Leave the map in place until a brief has to edit it.

## Scope

Move these out of `app.js` into native ES modules, with no bundler:

```
index.html                 <script type="module" src="./src/main.js">
src/main.js                everything not listed below, including the map
src/modes.js               one table: label, color, speed, capacity, costPerKm, dwell
src/scenario.js            normalize / safeUrl / safeColor (brief 04), ESM export
src/html.js                html`` tagged template that escapes interpolations; raw() opt-out
src/ui/list.js
src/ui/inspector-line.js
src/ui/inspector-stop.js
src/ui/draft.js
src/ui/results.js
src/ui/modal.js            modal, plus confirmDialog() replacing window.confirm
src/sim/model.js           ESM export of the current model (was sim.js)
```

- `src/sim/worker.js` stays a classic worker that imports the model the way it does today, unless the module conversion forces a module worker. A module worker is acceptable. Keep the main-thread fallback.
- The list and inspector build markup only with `html```. Remove the post-render patches (`insertAdjacentHTML` for the color row, and the PKM source-label overwrite).
- Direction arrows (`⟳ ↔ ↩ →`) live in one helper used by the list, the line inspector, and the stop inspector.
- `confirmDialog()` replaces `window.confirm` for reset and for discarding a draft. That is the only intended behavior change.
- **CSS.** Where a selector you are already editing is defined more than once, merge it and keep the winning values. Do not rewrite `styles.css` into four files. Do not delete a rule you are not sure is unused.
- Tests load the ESM model with dynamic `import()`. Convert them to `.mjs` if that is simpler.

Out of scope: `src/map/*`, a CSS split, a 400-line file cap, and moving code that already works and that no upcoming brief edits.

## Acceptance checks

- The same flows work as before: select T6, edit its interval, undo, open a stop, draw three stations and cancel, open the context menu, toggle the theme, import an old scenario.
- The Playwright smoke test from brief 05 still passes.
- `rg -n "modeSpeed|costPerKm\\s*=|capacity\\s*=\\s*\\{" src` finds those definitions only in `src/modes.js`.
- No file you created is a dump of unrelated leftovers. `src/main.js` may stay large.

## Stop and ask if

- Extracting a function would change when a recalculation runs, or what an undo step contains.

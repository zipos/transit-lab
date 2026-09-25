# GZM Transit Lab polish session

**Date:** 2026-09-25  
**Requested work period:** at least one hour  
**Start:** 09:46 UTC  
**Finish:** 10:46 UTC  
**Active work:** 1 hour  
**Status:** complete

This file records each project change made during the polish session, why it was made, and how it was checked. The updated project archive contains this completed log.

## Change log

### Interactive map mode controls

- **`index.html`** turns the mode legend into accessible Tram, Bus, Rail and Metro toggle buttons.
- **`app.js`** filters both route strokes and stop dots by the selected modes. The map controls leave the scenario and statistics untouched; a selected line and an in-progress draft remain visible for focused editing.
- **`styles.css`** gives pressed, unpressed and keyboard-focused controls clear states at desktop and mobile sizes.
- **`app.js`** updates the quick guide to explain that these controls change only map visibility, including animated vehicles.
- **Why:** the imported snapshot contains 400 directional patterns; hiding route types makes it easier to inspect rail or tram connections without removing them from the network.
- **Verification:** light/dark desktop and dark phone checks confirm route and stop filters update; keyboard and accessibility states are announced correctly.

### Keyboard and screen reader behavior

- **`index.html`** marks mobile navigation as pressed-state buttons and gives modal content dialog semantics.
- **`app.js`** moves focus into dialogs, traps Tab navigation while a dialog is open, and restores focus when it closes. Escape now affects only the topmost modal or tool; an in-progress line asks before being discarded. Ctrl/Cmd+Z no longer intercepts native undo while editing a field or dialog.
- **`app.js`** announces active mobile views, route selection and planning-layer visibility with button and switch state attributes.
- **`app.js`** gives station reorder and removal icon buttons spoken labels, so assistive technology announces the affected station and action instead of only an arrow or × symbol.
- Escape from a line-editing tool now clears the map cursor as it leaves the tool; draft discard still requires confirmation.
- **`README.md`** records that map-mode controls also hide animated vehicles.
- **Why:** focus could escape dialogs; route selection was reported with listbox semantics on an ordinary button; and Escape erased unfinished line drafts.

### No-service statistics

- **`app.js`** shows satisfaction, waiting, journey and transfer values as unavailable when a scenario serves no transit trips. Operating cost and zero demand coverage remain numeric because those still have a defined value.
- **`styles.css`** keeps the unavailable satisfaction label legible at card widths.
- **Why:** zero-minute wait and journey values implied service existed after every line was switched off.

### Live system-theme changes

- **`app.js`** restores game overlays when MapLibre replaces its base style after an operating-system light/dark preference change. A guard adds the overlays only once per style, then restores the active planning layer, route filters, edited lines and vehicle positions.
- **Why:** changing the system theme updated the controls but silently removed all custom map layers, leaving only the basemap. A browser check reproduced the failure and confirmed that the restored layers remain after the fix.

### Shape-informed service distances

- **`sim.js`** estimates each published route's detour factor from its supplied GTFS shape and stop sequence. It uses the earlier mode fallback when geometry was edited, short or not plausibly aligned to the pattern.
- **`tests/simulation-audit.cjs`** checks that the source shapes affect modeled cost and passenger choices.
- **`README.md`** documents the new distance rule and the limit of this approximation.
- **Why:** the simulation previously used one 1.2 multiplier for bus, tram and rail, even though the supplied route shapes show different detours by mode and pattern.

### Vehicle animation pacing

- **`app.js`** paces illustrative vehicles by estimated route-shape travel time, using approximate mode speeds and headway-based spacing for up to four visible markers per sampled line. A separate elapsed-time counter prevents marker phases from jumping at midnight.
- **`index.html`** labels the Play control's motion as illustrative.
- **`README.md`** and the data dialog explain that markers are estimates, not a timetable or live positions.
- **`app.js`** also applies map mode visibility to the moving markers so a hidden mode does not keep showing vehicle dots.
- **`app.js`** now refreshes vehicle marker geometry only during active playback. Paused markers stay static until a network, layer, or theme change needs a redraw.
- **Why:** previously one dot completed an entire route once per headway, so a 12-minute service interval could look like a 12-minute end-to-end trip.

### Bounded interchange walking

- **`sim.js`** now lets passengers make at most one 340 m platform-to-platform walk between successive transit boardings. Zone access and destination egress remain separate. Transfer walking is still a geometric estimate, not street routing.
- **`README.md`** explains the transfer cap and its limits.
- **Why:** the old graph could chain adjacent 340 m links into a long walk that bypassed transit.

### Browser-found startup wiring issue

- The first integrated browser check caught the new legend handler targeting a missing element ID, which stopped the rest of startup wiring before stats were calculated. **`index.html`** now gives the map mode group the expected ID.
- **Verification:** browser checks now pass map visibility buttons, modal keyboard/focus handling, confirm-before-discard drafts, mobile tab states, no-service stats and zero browser console/page errors.

## Verification

- Syntax checks and the simulation audit pass. The audit reports baseline 48,348 passengers, zero with every route disabled, 87,317 at doubled service frequency, and 50,599 after adding a useful metro; shape-derived distances change modeled cost and passenger choices.
- The full Playwright interaction pass passed in light desktop, dark desktop and dark phone modes. It checked map-mode and vehicle visibility, station action labels, modal focus trapping and restoration, Escape draft confirmation and cursor reset, mobile tabs and no horizontal overflow. Maximum zoom 18 works; live system-theme changes restore route and population layers; no page or console errors were observed. Follow-up tests after the paused-animation optimization also passed.
- The vehicle pacing check observed zero marker-data refreshes while paused, four during playback, and no additional refreshes after playback paused and settled.
- The end-to-end smoke test edited service, created a metro, downloaded `gzm-transit-lab-2026-09-25.json`, opened the phone layout, and reported no page errors. Cost remained visible on mobile.
- `preview.png` was recaptured in the system dark theme. `CONTINUE-ON-ANOTHER-PC.md` now points to this session log so the notes and verification record travel with the project.
- Temporary Playwright helpers and screenshots used during QA are in the local `work/` folder; they are not dependencies of the browser game.

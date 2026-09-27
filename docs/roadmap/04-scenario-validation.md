# 04 · Scenario validation (security)

**Phase 0 · Size S · Depends on nothing · Review: yes (security)**

## Why

Scenario files will be shared publicly, and brief 34 adds share links that load a scenario just by opening a URL. Today `normalizeScenario()` in `app.js` spreads arbitrary fields from the file into state (`{ ...r }`, `{ ...raw }`), which opens two holes:

- **XSS through links.** `templateSourceUrl` is rendered into `href="…"` in the line inspector. A value like `javascript:…` runs when clicked. `escape()` blocks breaking out of the attribute, not dangerous schemes.
- **CSS injection.** `color` is only HTML-escaped before going into `style="background:…"` and `style="--route-color:…"`. A value like `red;background-image:url(https://tracker/…)` injects CSS.

Unbounded arrays and strings also let a file freeze the tab.

## Scope

1. Move scenario normalization into a new file, `scenario.js`, loaded before `app.js`. It exposes `window.TransitScenario = { normalize, safeUrl, safeColor }`, so Node tests can run it through `vm` like `sim.js`. Brief 11 will turn it into a module.
2. **Whitelist-build every object; never spread input.**
   - Custom route:
     - `id` matches `^[a-z]+:[a-z0-9]+(:[0-9]+)?$`, at most 64 characters, and must be unique.
     - `source` must be `'player'`. `name` is at most 18 characters, `longName` at most 120.
     - `mode` must be in the allowed mode list. `color` goes through `safeColor` (`^#[0-9a-f]{6}$`, otherwise the mode default).
     - `headway` is a number clamped to 3–60. `active` and `ring` are booleans, and `edited` is `true`.
     - `stopIds` (strings, deduplicated consecutively). `geometry` is rebuilt from stop positions and never taken from the file.
     - `templateId` must match a template in `templates.js`, and all `template*` metadata is copied from that local template, never from the file.
   - Custom stop:
     - `id` is `<routeId>:<n>` (at most 80 characters). `name` is at most 60 characters.
     - `pos` holds two finite numbers inside the network bbox expanded by 0.2°.
     - `schematic` is a boolean. `coordinateNote` is at most 200 characters.
     - `city` is always `'Player'`.
   - Override:
     - Only for known route ids, and only the keys `headway` (3–120), `active` (boolean), `color` (`safeColor`) and `stopIds` (existing stops).
     - `geometry` is rebuilt from stops when `stopIds` changes. Otherwise it is dropped, so the published shape is used. `edited` is set when `stopIds` is present.
3. **Limits.** Reject files over 5 MB before parsing. Cap custom routes at 200, custom stops at 5,000, stops per route at 300, and overrides at the number of published routes. Show a toast naming the limit that was hit.
4. Add `safeUrl(u)`, which returns `u` only for `http:` or `https:` and otherwise `'#'`. Use it for every `href` built from data: templates, sources and route template links.
5. Apply `normalize` to local storage, legacy local storage, file import and, later, share links. Nothing else may assign scenario data into `state`.
6. Tests: add `tests/scenario-audit.cjs` with a fixture `tests/fixtures/malicious-scenario.json`. The fixture includes a `javascript:` URL, a CSS-injection color, a 10,000-stop route, `__proto__` keys, non-numeric positions and an unknown template id. Assert that `normalize` output contains none of them and that the valid parts survive.

## Acceptance checks

- The new test passes. The existing audit passes. Importing the fixture in the browser shows a toast and a sanitized scenario, with no navigation or network requests to the fixture's URLs (check the Network tab).
- Earlier exported scenarios (v1 to v4) still import.

## Stop and ask if

- You find another place where file data reaches `innerHTML`, `href`, `src` or `style` without going through `escape`, `safeUrl` or `safeColor`. Fix it, and list it in the PR.

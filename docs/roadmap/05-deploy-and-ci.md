# 05 · Deploy (Proxmox + Cloudflare Tunnel) and CI

**Phase 0 · Size S · Depends on 01**

## Why

The app is static and every simulation runs in the visitor's browser, so the server only serves files. A 4 GB Proxmox host is plenty if the container stays small and Cloudflare caches aggressively. Do not size the container for the simulation. The performance budget for the model is the visitor's phone, specified in briefs 20 and 21.

## Scope

### `deploy/` folder (new)

1. `deploy/README.md`: a step-by-step runbook the owner can follow:
   - Create an **unprivileged Debian 12 LXC**: 1 vCPU, 512 MB RAM, 4 GB disk, no Docker (lighter than a VM).
   - Install Caddy (official apt repo) and `cloudflared` (official Cloudflare apt repo).
   - Clone the repo to `/srv/transit-lab`.
   - Create a tunnel in the Cloudflare Zero Trust dashboard, install it as a service with the token, and route the hostname to `http://localhost:8080`.
   - Don't open any inbound port on the router.
2. `deploy/Caddyfile`:
   - Listen on `:8080`, bound to localhost only, with root `/srv/transit-lab/public`.
   - `file_server` with `precompressed br gzip`, plus `encode zstd gzip` as fallback.
   - `Cache-Control`:
     - `index.html` → `no-cache`.
     - Files requested with a `?v=` query, and everything under `/vendor/` → `public, max-age=31536000, immutable`.
     - `/data/**` → `public, max-age=86400`. Brief 10 adds content-hashed names, after which these become immutable too.
   - Security headers:
     - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; worker-src 'self' blob:; connect-src 'self' https://tiles.openfreemap.org; img-src 'self' data: blob: https://tiles.openfreemap.org; style-src 'self' 'unsafe-inline'; font-src 'self' https://tiles.openfreemap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
     - Also `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
     - Verify the CSP against the running app: OpenFreeMap glyphs and sprites load from its host, and MapLibre may need `blob:` for workers. Fix it until the console is clean.
3. `deploy/publish.sh`, run on the server:
   - `git pull --ff-only` on the public branch.
   - Copy the runtime files (`index.html`, `*.js`, `*.css`, `icon.svg`, `vendor/`, `data/` without `sources/`) into a temporary folder.
   - Precompress every `.js`, `.css`, `.json`, `.html` and `.svg` with `brotli -q 11` and `gzip -9`.
   - Atomically swap the folder into `public/`.
   - Idempotent.
4. Optional `deploy/transit-lab-publish.timer` (systemd): runs `publish.sh` every 15 minutes, so pushing to `main` deploys without a webhook or open port.

### Cloudflare notes (in the runbook)

- Add a Cache Rule that caches everything on the hostname and respects origin `Cache-Control`.
- Enable Brotli (the default).
- Keep the free plan. Note that OpenFreeMap tiles are fetched by visitors directly from OpenFreeMap, not through the server. If OpenFreeMap is down, the game's files still load and the map area shows the brief 03 error that names OpenFreeMap. Self-hosting tiles (a PMTiles extract of Poland) is a possible later task, not part of this one.

### CI (`.github/workflows/ci.yml`)

- On push and PR:
  - `node --check` on every `.js` file outside `vendor/`.
  - `node tests/simulation-audit.cjs` and `node tests/scenario-audit.cjs` (once brief 04 exists).
  - `python3 -m py_compile data/*.py`.
  - Playwright (`tests/smoke.spec.mjs`): start `python3 -m http.server 8765`, load the app, wait until a passenger number replaces the placeholder, select tram T6, emulate `prefers-color-scheme: dark` and assert the selected line's color is not black, enter the metro tool and click the map twice, then assert the draft shows two stations. Fail the job on a console error.
- Use Node 22 LTS.
- Sources are not committed (brief 01), so CI does not re-run the importers. Install Playwright browsers in the workflow (`npx playwright install --with-deps chromium`).

## Acceptance checks

- Following the runbook on a fresh LXC makes the site reachable at the tunnel hostname, with no console errors (including CSP errors).
- `curl -sI -H 'Accept-Encoding: br' https://<host>/data/network.js` shows `content-encoding: br` and the expected `cache-control`.
- A second request shows `cf-cache-status: HIT`.
- CI is green on the default branch.

## Stop and ask if

- The owner's Cloudflare zone or hostname is needed. Use a placeholder `transit.example.com` throughout.
